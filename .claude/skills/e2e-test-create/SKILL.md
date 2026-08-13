---
name: e2e-test-create
description: >
  Analyze React component source code to understand UI structure,
  then generate idiomatic Cypress E2E tests following Metabase conventions.
  Falls back to Playwright MCP browser exploration only when code reading
  and screenshot debugging are insufficient.
disable-model-invocation: true
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - Skill
  - "mcp__playwright__*"
---

# Code-Reading-First → Generate Cypress Tests (Metabase)

You are writing Cypress E2E tests for the **Metabase** codebase.
Before generating ANY test code, you MUST analyze React component source code
to understand DOM structure, selectors, and user flows.

## Phase 0 — Research

1. Read existing helpers before writing anything:
   - `e2e/support/helpers/` — all shared helpers (restore, signInAs, openOrdersTable, etc.)
   - `e2e/support/cypress_sample_database.ts` — table/field schema constants (ORDERS, PRODUCTS, etc.)
   - `e2e/support/cypress_sample_instance_data.ts` — instance-specific IDs (ORDERS_DASHBOARD_ID, NORMAL_USER_ID, etc.)
2. Glob `e2e/test/scenarios/` to find the closest existing spec to the area under test.
   Study its patterns — match them exactly.
3. Glob `frontend/src/metabase/` to find React components for the feature area.

## Phase 1 — Code Analysis

Read React component source to understand DOM structure. No browser needed — source code has everything.

1. **Find relevant components**: Glob and grep `frontend/src/metabase/` for the feature area.
2. **Extract selectors**: Grep for `data-testid` in relevant components.
3. **Note visible text**: Read component JSX for button labels, headings, placeholders.
4. **Note aria attributes**: Grep for `aria-label` in relevant components.
5. **Understand user flows**: Read event handlers (onClick, onSubmit, onChange) to understand interactions.
6. **Find API calls**: Grep for `Api.use`, `fetch`, `useQuery`, endpoint definitions to identify API calls to intercept.
7. **Cross-reference with existing specs**: Find specs in the same area and reuse their proven selectors and `cy.intercept` patterns.

## Phase 2 — Start Backend

Use `MB_EDITION=oss` by default. Only use `MB_EDITION=ee` when the user explicitly asks to write an enterprise test.

Start the backend using `run_in_background: true` (NOT `&`).
`bin/e2e-backend` automatically detects if a backend is already running and reuses it.
```bash
MB_EDITION=oss bin/e2e-backend
```

Do NOT manually generate snapshots by running unrelated test specs.
The `bun test-cypress` runner has `GENERATE_SNAPSHOTS: true` by default and automatically
generates snapshots before running any spec. When running tests in Phase 4 via the `/e2e-test` skill,
snapshots will be generated on the first run if they don't already exist.

Restore clean test data:
```bash
curl -sf -X POST http://localhost:4000/api/testing/restore/default
```

## Phase 3 — Generate Cypress Spec

Follow the Metabase Cypress conventions:

@./../_shared/cypress-conventions.md

When you identified API calls during code analysis, stub or wait on them using the intercept pattern shown above.

## Phase 4 — Validate

After generating specs:
1. Check that all imported helpers exist (Grep `e2e/support/helpers/`).
2. **You MUST use the `/e2e-test` skill** to run tests — do NOT run `bun test-cypress` directly.
   The `/e2e-test` skill handles edition selection, snapshot management, and correct env vars.
   `/e2e-test GREP="should do the thing" --spec e2e/test/scenarios/<path>`
   If you created multiple `it()` blocks, run each one individually to isolate failures.

## Phase 5 — Fix Failures (up to 2 attempts)

When a test fails, **try to fix it from Cypress output first**:
1. Read the failure screenshot (path printed under `(Screenshots)`).
2. Read the error message and code frame from the console output.
3. Fix the test and re-run (back to Phase 4, step 2).

If you cannot diagnose the issue after 2 attempts, proceed to Phase 6.

## Phase 6 — Playwright Fallback

Only reach this phase after 2 failed fix attempts from Phase 5. The backend is already running.

Restore clean test data:
```bash
curl -sf -X POST http://localhost:4000/api/testing/restore/default
```

**Bypass CSP** headers before navigating (Metabase serves strict CSP that blocks dev server scripts).
Use `browser_run_code` to set this up:

```js
async (page) => {
  // Strip CSP headers so the page loads (mirrors Cypress chromeWebSecurity: false)
  await page.context().route('**/*', async (route) => {
    const response = await route.fetch();
    const headers = { ...response.headers() };
    delete headers['content-security-policy'];
    delete headers['content-security-policy-report-only'];
    await route.fulfill({ response, headers });
  });

  // Sign in via API
  const response = await page.request.post('http://localhost:4000/api/session', {
    data: { username: 'admin@metabase.test', password: '12341234' }
  });
  const session = await response.json();
  await page.context().addCookies([{
    name: 'metabase.DEVICE',
    value: session.id,
    domain: 'localhost',
    path: '/'
  }]);

  await page.goto('http://localhost:4000');
  await page.waitForLoadState('networkidle');
  return 'signed in';
}
```

**Maintain an observation log incrementally.** After EVERY significant Playwright interaction,
IMMEDIATELY append what you observed to the scratch file BEFORE performing the next interaction:

```bash
cat >> /tmp/e2e-observations.md << 'OBSERVATION'
## [Page/Flow name]
- URL: /question/notebook#...
- Clicked: "Box plot" button → visible text "Box plot", role: radio
- Selectors: data-testid="viz-type-button", findByText("Box plot")
- API call: POST /api/dataset (triggered on viz change)
- Key state: after selecting viz type, summary sidebar shows metric picker
OBSERVATION
```

For each page/flow:
- Take an accessibility snapshot (`browser_snapshot`).
- Click through interactive elements, fill forms, trigger modals.
- **Append to the observation log immediately after each step**: URLs, visible text, aria labels, `data-testid` attrs, API calls.
- Screenshot key states.

After exploration:
1. Read back your observation log: `cat /tmp/e2e-observations.md`
2. Fix the test using observed selectors and behavior.
3. Re-run the test (back to Phase 4).
4. Clean up: `rm -f /tmp/e2e-observations.md`

## Phase 7 — Cleanup

After all tests pass (or after giving up on fixing failures), **always kill the backend on port 4000**:
```bash
lsof -ti:4000 | xargs kill 2>/dev/null || true
```

Do NOT use broad `pkill` patterns — there may be other Metabase instances on different ports.
The backend process started in Phase 2 will NOT be killed automatically when the Claude session ends.
Leaving it running wastes resources and can interfere with future sessions. Always clean up.

## What NOT to do (workflow)

- Do NOT use Playwright as the first step — always analyze source code first.
- Do NOT kill the backend between phases — it stays running throughout.
- Do NOT invent selectors you didn't find in source code or observe in the browser.

For convention-level "do nots" (selectors, waits, helpers, etc.), see the conventions file referenced in Phase 3.
