// /app/bridge.js
// Minimal HTTP -> MCP(stdio) bridge for zubeid-youtube-mcp-server
// - Starts the MCP server as a child process
// - Speaks MCP over stdio using newline-delimited JSON (MCP stdio transport)
// - Exposes POST /rpc and POST /mcp (send one JSON-RPC message, get one response)
// - Exposes GET /health

const http = require("http");
const { spawn } = require("child_process");

const PORT = process.env.BRIDGE_PORT ? Number(process.env.BRIDGE_PORT) : 8080;
const MCP_CMD = process.env.MCP_CMD || "zubeid-youtube-mcp-server";

// ---- MCP stdio framing helpers ----
function encodeMessage(obj) {
  return Buffer.from(`${JSON.stringify(obj)}\n`, "utf8");
}

function createLineDecoder(onMessage) {
  let buf = "";
  return function push(chunk) {
    buf += chunk.toString("utf8");
    while (true) {
      const idx = buf.indexOf("\n");
      if (idx === -1) return;
      const line = buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        onMessage(JSON.parse(line));
      } catch {
        // ignore non-JSON output (e.g., stdout logs)
      }
    }
  };
}

function tryParseFramed(body) {
  const headerEnd = body.indexOf("\r\n\r\n");
  if (headerEnd === -1) return null;
  const header = body.slice(0, headerEnd);
  const m = header.match(/Content-Length:\s*(\d+)/i);
  if (!m) return null;
  const contentLen = Number(m[1]);
  const bodyStart = headerEnd + 4;
  const bodyEnd = bodyStart + contentLen;
  if (body.length < bodyEnd) return null;
  const payload = body.slice(bodyStart, bodyEnd);
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// ---- Spawn MCP server ----
const child = spawn("bash", ["-lc", `exec ${MCP_CMD}`], {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

child.stderr.on("data", (d) => process.stderr.write(d));
child.on("exit", (code, sig) => {
  console.error(`[bridge] MCP process exited code=${code} sig=${sig}`);
});

// Simple relay: one request -> first decoded response.
// No streaming and no id-based correlation.
const waiters = [];

const pushStdout = createLineDecoder((msg) => {
  const w = waiters.shift();
  if (w) w.resolve(msg);
});

child.stdout.on("data", pushStdout);

// ---- HTTP server ----
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = http.createServer((req, res) => {
  setCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }

  if (req.method === "POST" && (req.url === "/rpc" || req.url === "/mcp")) {
    let body = "";
    req.on("data", (c) => (body += c.toString("utf8")));
    req.on("end", async () => {
      const raw = body || "";
      const timeoutMs = Number(process.env.BRIDGE_TIMEOUT_MS || 8000);

      let obj;
      const framed = tryParseFramed(raw);
      if (framed) {
        obj = framed;
      } else {
        try {
          obj = JSON.parse(raw);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "invalid json (send JSON-RPC object or framed MCP message)" }));
        }
      }

      const p = new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
      });

      const timer = setTimeout(() => {
        const w = waiters.shift();
        if (w) w.reject(new Error("timeout"));
      }, timeoutMs);

      // Send to MCP over stdio
      child.stdin.write(encodeMessage(obj));

      try {
        const reply = await p;
        clearTimeout(timer);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify(reply));
      } catch (e) {
        clearTimeout(timer);
        res.writeHead(504, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: String(e?.message || e) }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("not found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[bridge] listening on :${PORT}`);
});
