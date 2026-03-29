## Browser Automation with Playwright MCP

A Playwright MCP server is configured in `.mcp.json`. Load the tool schemas first with `ToolSearch`: `select:mcp__playwright__browser_navigate,mcp__playwright__browser_snapshot,mcp__playwright__browser_click,mcp__playwright__browser_fill,mcp__playwright__browser_type,mcp__playwright__browser_press_key,mcp__playwright__browser_hover,mcp__playwright__browser_take_screenshot,mcp__playwright__browser_close`

If ToolSearch says "MCP servers still connecting," wait a few seconds and retry — the server takes a moment to start on first use.

### The one rule: Snapshot → Act → Snapshot

Every interaction follows this pattern:

1. **`browser_snapshot`** — see what's on screen, get element refs
2. **Act** — `browser_click`, `browser_fill`, `browser_type`, etc. using refs from the snapshot
3. **`browser_snapshot`** — see what changed

**The snapshot you take in step 3 is the only reliable way to see what happened.** The click/fill response may include a snapshot, but it's often stale — Metabase renders menus, modals, and popovers asynchronously, so they may not appear until you take a fresh snapshot. Never assume an action failed based on the inline response. Always take your own snapshot afterward.

**Element refs go stale after every action.** Never reuse a ref from a snapshot that was taken before another action — always take a fresh snapshot and use the new refs.

If your post-action snapshot looks the same as before, take **one more snapshot** — the UI may still be rendering. If it's still unchanged after two post-action snapshots, then the action genuinely had no effect.

### How to interact with Metabase's UI components

Metabase uses Mantine UI components. These components handle events differently from native HTML elements, which affects how you interact with them.

**Buttons that open menus or popovers (e.g., "+ New", filter dropdowns, column pickers):**

Always **hover before clicking** buttons that open dropdown menus:
1. `browser_hover` on the button
2. `browser_click` on the button
3. `browser_snapshot` to see the menu

Why: Mantine menus open on `pointerdown` but their outside-click detection fires on `mousedown`. A direct click can cause the menu to open and immediately close in the same event cycle. Hovering first establishes the pointer relationship and prevents this race condition.

If hover-then-click still doesn't work, use **keyboard** instead:
1. `browser_click` on the button (to focus it)
2. `browser_press_key` with `Enter` or `Space`
3. `browser_snapshot` to see the menu

**Select and dropdown components (e.g., database picker, column picker):**

Mantine Select/MultiSelect are NOT native `<select>` elements — they're built from `<input>` + `<div>` elements. `browser_select_option` will NOT work. Instead:
1. `browser_click` on the input/trigger to open the dropdown
2. `browser_snapshot` to see the options
3. `browser_click` on the option `<div>` you want

You can also type into the input to filter options before clicking.

**Modals and dialogs:**

To dismiss a modal, try in order:
1. `browser_click` on the close button or primary action button
2. `browser_press_key` with `Escape`
3. `browser_click` on the overlay area outside the modal

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

If snapshot → hover → click → snapshot shows no change:

1. **Try keyboard** — `browser_click` the element (to focus), then `browser_press_key` with `Enter` or `Space`
2. **Snapshot once more** — the UI may still be rendering
3. **If nothing on the page responds** (not just one button — multiple elements are unresponsive), close the browser with `browser_close` and reopen it with `browser_navigate`. This resets the browser session and usually fixes initialization issues.
4. **After 3 total attempts** on a specific element (hover+click, keyboard, browser restart), report it as a struggle and move on. Do NOT use JavaScript workarounds.

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
