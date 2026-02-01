## Implementation notes (for Codex and contributors)

The following constraints are intentional and should be preserved when completing or extending the demo:

### Backend and configuration (Fireworks)

- The demo’s LLM backend is a **Fireworks.ai** OpenAI-compatible chat-completions endpoint.
- The demo UI must provide text inputs for:
  - **Model** (string; prefilled with `fireworks/gpt-oss-20b`)
  - **API key** (string)
  - **Base URL** / endpoint URL (prefilled with `https://api.fireworks.ai/inference/v1`; may be adjusted if using a relay for CORS)
- During the live demo, these values will be entered manually.
- After entry, the demo should persist them in **`localStorage`** so a page refresh does not require re-typing.
- No secrets should be committed to the repository.

### Target stack (single self-contained HTML)

- The demo UI should be implemented as a **single self-contained HTML file** (for example, `demo.html`) with inline JS and minimal inline CSS.
- Use these CDN scripts (exactly as shown):

```html
<script src="https://unpkg.com/htmx.org@1.9.5"></script>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/flowbite/1.6.0/flowbite.min.js"></script>
```

- No Node.js build, bundlers, or server framework is required for the demo UI.

### Demo user and mock data

- Use a simple mock user profile for the default demo state:
  - The user is a **web developer** who is learning **LLM topics**
  - The user enjoys **science fiction**
- Mock data is acceptable for candidates and watch history, but the demo should also support live YouTube results (see below).

### YouTube data source

- The demo should include a text input for a **YouTube Data API key**.
- After entry, persist the YouTube key in **`localStorage`** (same approach as the LLM key).
- Candidate video lists may be sourced from YouTube when a key is present; otherwise fall back to mock data.

### MCP YouTube (optional)

The repo includes a `youtube-mcp/` demo that exposes a YouTube MCP server via an HTTP JSON-RPC bridge.
The main demo should support MCP as an **optional** alternative source:

- Add an MCP Bridge URL input (default `http://127.0.0.1:8081/mcp`) and Connect/Disconnect controls.
- Display MCP connection status and available tool names inside the **context window**.
- If MCP is connected and provides `search_videos`, allow the tool `fetchCandidatesMCP("query")` to use it.
- MCP integration should be additive; the existing direct YouTube API flow remains available.

### Context window = payload (non-negotiable)

- The **context window DOM subtree is the payload**. Serialize the visible context window as XHTML/HTML and send that as the user message.
- Do not introduce a separate “current context” label or proxy layer. The rendered context window is the only source of truth.
- The UI should render the context window prominently so observers can see exactly what is sent.

### Meeting structure and actor behavior (critical)

- The meeting is **round‑table and turn‑based**. Each actor gets exactly **one inference** per turn.
- Actors are **stateless** between turns. The only persistent memory they will see again is what the application renders:
  - The **Whiteboard** (shared notes)
  - The **current actor’s notes** (their own private notes)
- No other memory, chat history, or hidden state is carried forward. If it is not rendered, it does not exist.
- Each actor must behave as if they only have a few seconds and **one shot** to affect the meeting on their turn.
- Actors should **use tools to write notes** so they can see them later:
  - Use `addActorNote(note)` for personal notes you want to carry to your next turn.
  - Use `addWhiteboard(note)` for shared notes all actors will see.
- The model should **not narrate recommendations**. To act, it must:
  - Fetch/refresh candidates with a meaningful query
  - Expand relevant facts
  - Filter/rank candidates
  - Commit picks with `updateSuggestions(topN)`
- If an actor has nothing new to contribute, it should output **only** `CALL: passTurn()`.
- The meeting is continuous; actors should expect their next turn to arrive with better context after other actors have acted.

#### Tool functions that feed the context window

The page should expose tool functions that the meeting (via tool calls) can trigger to bring data into the visible context-window elements. Examples:

- Fetch a candidate list (from YouTube or mock): `fetchCandidates()`
- Fetch with a specific query string: `fetchCandidates("specific query")`
- Expand/collapse fact cards: `expandFact(id)`, `collapseFact(id)`
- Rank/update suggestions: `rankCandidates(id1, id2, ...)`, `updateSuggestions(topN)`
- Mark items as seen and update history: `markSeen(videoId)`
- Add notes: `addActorNote(note)` for the current actor; `addWhiteboard(note)` for shared meeting notes
- Add spoken lines: `addTranscript(line)` to append a meaningful, goal‑relevant utterance to the meeting transcript
- Pass the microphone: `passTurn()` to advance to the next actor when you have nothing to add
- Await fetched data: `awaitResults()` to re-run inference for the current actor after a fetch
- End meeting: `endMeeting()` to conclude the meeting (Administrator only)
- Finalize meeting: `finalizeMeeting(id1, id2, ...)` to rank, commit, and end (Administrator only)

Tool execution should mutate the **DOM/XHTML context window elements** so observers can see the exact state being sent on the next inference call.

#### Function glossary (detailed behavior)

- `fetchCandidates("query")`: Use the provided query string to fetch videos from YouTube (or mock data if no key). Replace the Candidate list with the fetched items.
- `expandFact(id)` / `collapseFact(id)`: Show or hide a fact detail block. Only visible facts are included in the inference payload.
- `rankCandidates(id1, id2, ...)`: Provide your ranked picks by listing candidate IDs in order. All other candidates are dropped from the ranked list.
- `updateSuggestions(topN)`: Write the top N ranked candidates into the Suggestions panel (this is the explicit commit step for recommendations).
- `markSeen(videoId)`: Remove a candidate from the list and append its title to watch history.
- `addActorNote(note)`: Append a note to the current actor’s private notes; only that actor sees it next time.
- `addWhiteboard(note)`: Append a shared note visible to all actors in future turns.
- `addTranscript(line)`: Append a single spoken line to the meeting transcript. Use sparingly for meaningful, goal‑relevant statements only.
- `passTurn()`: End the current actor’s turn and advance to the next actor (equivalent to clicking Next Turn).
- `awaitResults()`: Re-run inference for the current actor after a fetch so they can review the new list in the same actor context.
- `endMeeting()`: Conclude the meeting and freeze further turns. Only the Administrator should see/use this tool.
- `finalizeMeeting(id1, id2, ...)`: Convenience tool for the Administrator to rank by ids, commit suggestions, and end the meeting.

- **The context window is the literal inference payload.** The XHTML-like context window is not a summary or a proxy; it is the exact, foundational data sent to the model on each turn. Do not add meta UI labels like “current context” that suggest a separate layer. The visible context window *is* the context.
- **Only the current actor’s prompt is visible.** The meeting includes multiple actors with distinct personality + goal + grounding prompts, but only the active actor’s prompt is rendered into the context window each turn. Other actors are hidden and therefore excluded from the inference payload until their turn.
- **Recommendations must commit via tool calls.** Actors should not output plain-text recommendation lists. If they have suggestions, they must invoke `updateSuggestions(topN)` (and any filtering/ranking calls) so the UI state reflects the recommendation.
- **Tool call format must be explicit.** Include a tool-call instruction block inside the context window (rendered) that tells the model to emit `CALL: toolName(arg1, arg2)` lines.
- **Tool arguments must be real values.** The tool-call examples should use meaningful parameters (actual IDs, realistic top-N), and the instructions should tell the model not to emit placeholder arguments like `(N)` or `(videoId)`.
- **Meeting protocol must be in-context.** The context window should tell the actor that this is a round‑table meeting, that they should write their own notes via `addActorNote`, use `addWhiteboard` for shared notes, and that they will get another turn after other actors take theirs.
- **Passing a turn must be supported.** The context window should instruct actors to emit only `CALL: passTurn()` when they have nothing to add.
- **Administrator role.** The first actor is the Administrator; they should conclude with existing candidates when viable, and only seed a foundational query if candidate coverage is weak.
- **Matching rule.** Do not require every suggestion to satisfy all interests. Each pick can match a single primary interest as long as the list is balanced overall.

- **Run tools behavior (correction).** A “Run tools” action should execute tool calls and then re‑infer **the same actor** with the updated context. If `passTurn()` is called, the UI should advance to the next actor (equivalent to clicking “Next turn”) and stop re‑inferring the current actor.
- **Tool parsing tolerance (correction).** Keep the `CALL:` format as the canonical instruction, but allow tolerant parsing for drifted outputs (for example, `addActorNote: "..."` and `addWhiteboard: "..."`) so notes still land in the UI.

- **Turns advance only via user action.** The application never advances turns automatically or loops on its own.
- **One inference per turn.** A single LLM response may recommend multiple tool calls, but no additional inference requests are made during that turn.
- **Tool calls are consequences, not new turns.** Executing tools (expanding facts, filtering candidates, ranking options) does not trigger inference.
- **The context window must be visible.** The demo UI should render the current context window so observers can see exactly what is sent to inference on each turn.
- **Data realism is optional.** Candidate entertainment items may be static or mocked; the purpose of the demo is context control and orchestration, not recommendation quality.

If an implementation violates any of the above, it is demonstrating a different architecture than the one this project is intended to explore.

## Summary

This demo treats LLM inference as:

- discrete
- bounded
- stateless
- application-driven

If that sounds boring, that’s intentional.

The interesting part is what becomes possible once the system is predictable.
### Context window data format (make it explicit)

The context window is serialized as XHTML/HTML and sent as the **user message**. Every element that is visible becomes part of the payload; hidden elements are removed. Because the model only sees what is rendered:

- **Lists are authoritative.** If a list exists and contains items, the model must assume those items are available. Do not say “no candidates” when a visible list contains entries.
- **Candidate items include rich fields.** Each candidate entry should include:
  - Title
  - Channel
  - Duration (when known)
  - Published date
  - Thumbnail URL or image
  - Description
- **Facts and notes are literal.** The Whiteboard and current actor notes are the only persistent memory. If information is not written there, it will not be seen again.

The demo is intentionally rigid: **the DOM is the state**, and “what is visible” is synonymous with “what exists for the model.”

### Turn flow (step-by-step)

Each actor gets a single inference. The expected flow during a turn is:

1. **Read the visible context window.** Trust the rendered lists and facts.
2. **Decide if more context is needed.** If so, expand facts first.
3. **Fetch or refine candidates.** Use `fetchCandidates("your query")` when the list is empty or off-target. The query must be crafted from visible facts.
4. **Filter and rank.** Apply `filterCandidates(...)` and `rankCandidates(...)` to shape the set.
5. **Commit recommendations.** Use `updateSuggestions(topN)` to write the chosen results to the Suggestions panel.
6. **Record memory.** Use `addActorNote(...)` and `addWhiteboard(...)` as needed.
7. **Pass the turn.** If done, call `passTurn()`.

If there is nothing to add, the actor should output **only** `CALL: passTurn()`.

**One inference per turn** means: after you finish information gathering, perform a single set of tool updates (notes, rankings, suggestions) and end the turn. Do not attempt to “loop” or iterate within a turn.

**When to pass**: use `passTurn()` only when candidates are acceptable for the current actor and their notes/whiteboard/transcript updates are satisfactory. If something is missing, take the needed action before passing.
