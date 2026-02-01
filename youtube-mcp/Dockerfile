FROM node:20-slim

# Install ttyd, tmux, and basic tools
RUN apt-get update && \
    apt-get install -y \
    wget \
    git \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install ttyd
RUN wget https://github.com/tsl0922/ttyd/releases/download/1.7.7/ttyd.x86_64 -O /usr/local/bin/ttyd && \
    chmod +x /usr/local/bin/ttyd

 # Install MCP server globally
RUN npm install -g zubeid-youtube-mcp-server

# Simple static server for /app/www
RUN npm install -g http-server


# Inside the server package, install a modern MCP SDK and patch for runtime compatibility
# (1) Ensure @modelcontextprotocol/sdk root export resolves in CJS
# (2) Adapt older server code that used McpServer/addMethod/listen to the current SDK API
RUN <<'SH'
set -eux
cd /usr/local/lib/node_modules/zubeid-youtube-mcp-server

npm install --no-audit --no-fund @modelcontextprotocol/sdk@1.25.3

SDK_DIR="node_modules/@modelcontextprotocol/sdk"
# Some SDK publishes omit dist/cjs/index.js even though exports reference it; add the exact shim we used.
if [ ! -f "$SDK_DIR/dist/cjs/index.js" ]; then
  printf 'module.exports = require("./types.js");\n' > "$SDK_DIR/dist/cjs/index.js"
fi

# 1) Import McpServer + stdio transport from the new SDK paths (not the root package).
sed -i 's|const sdk_1 = require("@modelcontextprotocol/sdk");|const mcp_1 = require("@modelcontextprotocol/sdk/server/mcp.js");\nconst stdio_1 = require("@modelcontextprotocol/sdk/server/stdio.js");|g' dist/server.js

# 2) Construct McpServer from the correct module.
sed -i 's|new sdk_1.McpServer(|new mcp_1.McpServer(|g' dist/server.js

# 3) Inject addMethod compatibility shim (use tools.<name> to avoid '/' in tool names)
node - <<'NODE'
const fs = require('fs');
const p = '/usr/local/lib/node_modules/zubeid-youtube-mcp-server/dist/server.js';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('Compatibility shim: older code used addMethod')) {
  const re = /(const server = new mcp_1\.McpServer\(\{[\s\S]*?\}\);\n)/;
  s = s.replace(re, (m, g1) =>
    g1 +
    "\n    // Compatibility shim: older code used addMethod({name, description, parameters, handler})\n" +
    "    // Newer MCP SDK uses server.tool(methodName, schema, handler)\n" +
    "    server.addMethod = (def) => server.tool(\n" +
    "        \"tools.\" + def.name,\n" +
    "        Object.assign({ name: def.name, description: def.description }, def.parameters),\n" +
    "        def.handler\n" +
    "    );\n\n"
  );
  fs.writeFileSync(p, s);
}
NODE

# 4) Replace the old listen() call with stdio connect.
node - <<'NODE'
const fs = require('fs');
const p = '/usr/local/lib/node_modules/zubeid-youtube-mcp-server/dist/server.js';
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/\bawait\s+server\.listen\(\);/g, 'await server.connect(new stdio_1.StdioServerTransport());');
fs.writeFileSync(p, s);
NODE
SH


# Create app directory
WORKDIR /app

# Expect /app (including /app/www and /app/bridge.js) to be bind-mounted at runtime.
# We still create the directories so the image can start even without mounts.
RUN mkdir -p /app/www

# Expose ports
# 7681 - ttyd debug terminal (human)
# 8080 - static file server (serves /app/www)
# 8081 - MCP bridge (HTTP -> stdio)
EXPOSE 7681 8080 8081

RUN cat <<'EOF' > /usr/local/bin/start.sh
#!/bin/bash
set -euo pipefail

# If the user bind-mounted their own start script, prefer it (no rebuild workflow)
if [ -f /app/start.sh ]; then
  echo "[start] using bind-mounted /app/start.sh"
  exec bash /app/start.sh
fi

echo "[start] using image default startup"

# Ports (match compose.yaml)
export TTYD_PORT=${TTYD_PORT:-7681}
export STATIC_PORT=${STATIC_PORT:-8080}
export BRIDGE_PORT=${BRIDGE_PORT:-8081}

# Ensure log files exist
mkdir -p /app
: > /app/bridge.log
: > /app/static.log
: > /app/ttyd-debug.log

# 1) ttyd: debug terminal (human)
#    --writable so you can type / run diagnostics from the browser.
ttyd -W --writable -p "$TTYD_PORT" bash >>/app/ttyd-debug.log 2>&1 &

# 2) Static file server for /app/www
http-server /app/www -a 0.0.0.0 -p "$STATIC_PORT" >>/app/static.log 2>&1 &

# 3) Bridge server (HTTP -> stdio) implemented by your bind-mounted /app/bridge.js
#    The bridge should listen on BRIDGE_PORT and expose POST /mcp.
node /app/bridge.js >>/app/bridge.log 2>&1
EOF
RUN chmod +x /usr/local/bin/start.sh

CMD ["/usr/local/bin/start.sh"]
