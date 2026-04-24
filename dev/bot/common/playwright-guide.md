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

### Login

1. `browser_navigate` to `http://localhost:$MB_JETTY_PORT/auth/login`
2. `browser_snapshot` → `browser_fill` email and password → `browser_click` sign-in button
3. **`browser_navigate` to `http://localhost:$MB_JETTY_PORT/`** — always navigate explicitly to the home page after login. Do NOT rely on the login redirect alone. The redirect can leave the browser session in a state where clicks don't register.
4. `browser_snapshot` to confirm you're logged in

### Quick login via API (alternative)

Get a session token via API and set it as a cookie — faster than filling the login form:
```bash
./bin/mage -bot-api-call /api/session --method POST --body '{"username":"<email>","password":"<password>"}'
```
Extract the `id` from the response, then use `browser_evaluate` with script:
```javascript
document.cookie = 'metabase.SESSION=<token>;path=/'
```
Then `browser_navigate` to the target page. Use the credentials from `./bin/mage -bot-server-info`.

### When clicks don't work

1. Take a fresh snapshot (async rendering). 2. Try hover + click (menu triggers). 3. Try keyboard (focus + Enter). 4. After 3 attempts, report and move on.

### Rules

- Always use `http://localhost:$MB_JETTY_PORT`
- Close the browser when done
- Use inline response snapshots when sufficient — only take separate `browser_snapshot` when needed
- Browser is pre-configured: 1440x900 viewport, full snapshot mode, isolated session, 10s action timeout
