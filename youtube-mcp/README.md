# MCP YouTube Demo

A demonstration of using Model Context Protocol (MCP) stdio-based server with a static HTML web app.

## Architecture

```
Browser (xterm.js) 
  ↓ WebSocket (ws://localhost:7681)
ttyd 
  ↓ PTY/stdio
tmux session
  ↓ stdin/stdout
zubeid-youtube-mcp-server (MCP stdio server)
```

## What This Demonstrates

- **MCP stdio transport**: Browser communicates with MCP server via WebSocket → ttyd → stdio
- **No backend needed**: Static HTML page connects directly to ttyd
- **Tool discovery**: LLMs can discover and use YouTube tools (search, metadata, transcripts, etc.)
- **Debugging**: tmux session allows real-time monitoring of MCP communication

## Prerequisites

- Docker & Docker Compose
- YouTube Data API v3 key (see below)

## Getting Your YouTube API Key

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create a new project (or select existing)
3. Enable **YouTube Data API v3**
4. Create credentials → **API Key**
5. Copy the key

## Setup

1. **Clone/download this project**

2. **Create `.env` file** (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

3. **Edit `.env`** and add your YouTube API key:
   ```bash
   YOUTUBE_API_KEY=AIzaSy...your_actual_key
   ```

4. **Add your static web app** (optional):
   - Replace `www/index.html` with your actual app
   - Or keep the test page to verify MCP connection first

## Running

```bash
# Start the container
docker compose -f compose.yaml up -d

# View logs
docker compose -f compose.yaml logs -f

# Stop
docker compose -f compose.yaml down

# Rebuild after changes
docker compose -f compose.yaml up -d --build
```

## Access Points

- **Static Web App**: http://localhost:8080
- **Debug Terminal**: http://localhost:7681 (view raw MCP communication in tmux)

## Testing the MCP Connection

1. Open http://localhost:8080 in your browser
2. Open browser DevTools Console (F12)
3. You should see:
   - ✅ WebSocket connected
   - 📤 Initialize request sent
   - 📥 MCP server response received
   - 📤 Tools list request sent
   - 📥 Available YouTube tools returned

## Available MCP Tools

The `zubeid-youtube-mcp-server` provides tools like:

- `search_videos` - Search YouTube with engagement metrics
- `get_video_details` - Get video metadata and statistics
- `get_channel_stats` - Analyze channel subscriber count, views
- `get_video_transcript` - Retrieve video transcripts
- `get_playlist_videos` - List videos in a playlist

## Integrating with Your LLM App

### Basic MCP Communication Pattern

```javascript
// Hidden WebSocket connection (no terminal display needed)
const { Terminal } = window;
const { AttachAddon } = window.AttachAddon;

const term = new Terminal();
const ws = new WebSocket('ws://localhost:7681');
term.loadAddon(new AttachAddon(ws));

// Receive MCP responses
term.onData((data) => {
  const mcpResponse = JSON.parse(data);
  // Feed to your LLM or display in UI
});

// Send MCP requests
function callMCPTool(toolName, args) {
  term.write(JSON.stringify({
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args
    },
    id: Date.now()
  }) + '\n');
}

// Example: Search for videos
callMCPTool('search_videos', {
  query: 'jazz music',
  maxResults: 5
});
```

## Project Structure

```
mcp-youtube-demo/
├── Dockerfile              # Container with ttyd + tmux + MCP server
├── config.yaml            # Docker Compose configuration
├── .env.example           # Template for environment variables
├── .env                   # Your actual API key (git-ignored)
├── .gitignore            # Ignore .env and node_modules
├── README.md             # This file
└── www/
    └── index.html        # Your static web app (test page included)
```

## Debugging

### View MCP Communication in Real-Time

Open http://localhost:7681 in a separate browser tab to see the raw JSON-RPC messages flowing through the tmux session.

If you see no session, check `/app/mcp.log` inside the container for MCP startup errors.

### Manual MCP Testing

In the debug terminal (http://localhost:7681), you can manually send MCP requests:

```json
{"jsonrpc":"2.0","method":"tools/list","id":1}
```

Press Enter and see the MCP server's response.

### Browser Console

The test page logs all MCP communication to the browser console for debugging.

## Troubleshooting

**WebSocket won't connect:**
- Ensure container is running: `docker ps`
- Check logs: `docker-compose -f config.yaml logs`

**MCP server errors:**
- Verify YouTube API key is set correctly in `.env`
- Check API key has YouTube Data API v3 enabled
- View raw errors in debug terminal: http://localhost:7681

**No MCP responses:**
- MCP uses newline-delimited JSON - ensure requests end with `\n`
- Check request format matches JSON-RPC 2.0 spec
- Verify `id` field is present in requests

## Why This Architecture?

- **No backend code needed**: Static HTML can directly leverage MCP servers
- **Standard MCP protocol**: Works with any stdio-based MCP server
- **Easy debugging**: tmux session shows raw communication
- **Scalable**: Same pattern works for any MCP server (filesystem, database, APIs, etc.)

## Next Steps

1. Replace `www/index.html` with your actual LLM inferencing app
2. Integrate MCP tool calls into your LLM prompt/response flow
3. Use MCP tool descriptions to help LLMs reason about when to use tools
4. Add more MCP servers for additional capabilities

## Resources

- [Model Context Protocol Docs](https://modelcontextprotocol.io/)
- [zubeid-youtube-mcp-server](https://github.com/zubeirom/youtube-mcp-server)
- [ttyd Documentation](https://github.com/tsl0922/ttyd)
- [xterm.js Documentation](https://xtermjs.org/)

## License

MIT (adjust as needed for your project)
