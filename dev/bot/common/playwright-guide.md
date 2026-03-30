## Browser Automation with Playwright MCP

A Playwright MCP server is configured in `.mcp.json`. Load the tool schemas first with `ToolSearch`: `select:mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_click,mcp__playwright__browser_fill,mcp__playwright__browser_type,mcp__playwright__browser_press_key,mcp__playwright__browser_hover,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_close`

If ToolSearch says "MCP servers still connecting," wait a few seconds and retry — the server takes a moment to start on first use.

### Core pattern: Snapshot → Act → Check

1. **`browser_snapshot`** — see what's on screen, get element refs
2. **Act** — `browser_click`, `browser_fill`, `browser_type`, etc. using refs from the snapshot
3. **Check the inline response** — every action returns a snapshot in its response. Read it.

**When to take a separate `browser_snapshot` after acting:**
- The inline response snapshot looks wrong, empty, or unchanged — take a fresh one (async rendering may not have completed)
- You need refs for your NEXT action — the inline snapshot's refs are valid, use them directly
- You're unsure if the action worked — take one more snapshot to confirm

**When you do NOT need a separate snapshot after acting:**
- The inline response already shows the expected change (e.g., you clicked a link and the response shows the new page)
- You're about to take a screenshot anyway (`browser_take_screenshot` shows the current state)
- You're doing a chain of actions on the same form (e.g., filling multiple fields) — snapshot once at the end, not after each fill

**Element refs go stale after every action.** Use refs from the most recent snapshot or inline response — never from an earlier one.

### How to interact with Metabase's UI components

Metabase uses Mantine UI components. Most interactions work with a plain `browser_click`. The hover-before-click pattern is only needed for specific component types.

**Regular buttons, links, form inputs, checkboxes, tabs:**
Just `browser_click` them directly. No hover needed.

**Buttons that open dropdown menus (e.g., "+ New", "..." action menus, filter type pickers):**
These use Mantine's `<Menu>` component which has a race condition with direct clicks. **Hover before clicking** these:
1. `browser_hover` on the button
2. `browser_click` on the button
3. Check the inline response — if the menu appeared, use its refs directly

How to tell if a button opens a dropdown menu: it usually has a chevron/arrow icon, a "..." label, or is labeled as creating something new (like "+ New"). If unsure, try a direct click first — if it doesn't work, retry with hover.

**Select and dropdown components (e.g., database picker, column picker):**
Mantine Select/MultiSelect are NOT native `<select>` elements. `browser_select_option` will NOT work. Instead:
1. `browser_click` on the input/trigger
2. `browser_click` on the option you want (use refs from the inline response)

You can also type into the input to filter options before clicking.

**Modals and dialogs:**
To dismiss: `browser_click` the close/action button, or `browser_press_key` with `Escape`.

### Key tools

| Tool | What it does | Key params |
|------|-------------|------------|
| `browser_navigate` | Go to a URL | `url` |
| `browser_snapshot` | Accessibility tree with element refs | — |
| `browser_click` | Click an element | `element`, `ref` |
| `browser_fill` | Clear and fill a text field | `element`, `ref`, `value` |
| `browser_type` | Type with keyboard events (appends) | `text`, optional `element`/`ref` |
| `browser_press_key` | Press a key (Enter, Escape, Tab, ArrowDown, etc.) | `key` |
| `browser_select_option` | Select from a native dropdown (NOT for Mantine) | `element`, `ref`, `values` |
| `browser_hover` | Hover over an element | `element`, `ref` |
| `browser_evaluate` | Run JavaScript on the page | `script` |
| `browser_take_screenshot` | Save a visual screenshot | `raw` (base64) |
| `browser_console_messages` | Browser console logs | — |
| `browser_network_requests` | Network activity | — |
| `browser_close` | Close the browser | — |
| `browser_resize` | Change viewport size | `width`, `height` |
| `browser_navigate_back` | Browser back button | — |
| `browser_wait_for` | Wait for a condition | — |

### Login

1. `browser_navigate` to `http://localhost:$MB_JETTY_PORT/auth/login`
2. `browser_snapshot` → `browser_fill` email and password → `browser_click` sign-in button
3. **`browser_navigate` to `http://localhost:$MB_JETTY_PORT/`** — always navigate explicitly to the home page after login. Do NOT rely on the login redirect alone. The redirect can leave the browser session in a state where clicks don't register.
4. `browser_snapshot` to confirm you're logged in

### When clicks don't seem to work

If a click had no effect (inline response shows no change):

1. **Take one fresh snapshot** — async rendering may not have completed
2. **Try hover + click** — if the element is a menu trigger
3. **Try keyboard** — `browser_click` to focus, then `browser_press_key` with `Enter` or `Space`
4. **If nothing on the page responds at all**, `browser_close` and `browser_navigate` to restart the session
5. **After 3 attempts**, report it as a struggle and move on. Do NOT use JavaScript workarounds.

### Configuration notes

The browser is pre-configured with:
- **1440x900 viewport** — wide enough to avoid responsive breakpoints hiding UI elements
- **Full snapshot mode** — every snapshot shows the complete page, not just changes since the last one
- **Isolated session** — clean in-memory browser profile every time (no stale state from previous sessions)
- **10-second action timeout** — longer than default to handle slow-rendering menus

### General rules

- Always use `http://localhost:$MB_JETTY_PORT` — never any other port
- Close the browser when done to free resources
- If the Playwright MCP tools are unavailable on first use, skip browser work entirely
- **Be efficient with snapshots** — use the inline response snapshot when it shows what you need. Only take a separate `browser_snapshot` when the inline response is insufficient.
