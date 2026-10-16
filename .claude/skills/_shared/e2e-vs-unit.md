## When a test belongs in e2e

Ground each decision in **the layers that the test touches**, not in its name or its folder. A test belongs in e2e only if it exercises a layer that you cannot fake without losing the value of the test.

### Signals for e2e (keep)

A request to the backend alone is not sufficient. Keep the test if one of these is true:

- The assertion reads data that the backend computes from the database (filter, sort, bucket, permissions), **and** no backend test pins that data. If a backend test pins it, and the frontend step that shows it can be tested alone, only the backend half needs a test at that layer. The frontend half moves.
- The test writes through one endpoint and reads back through a different one, for example `cy.reload()` after a save.
- The flow crosses several endpoints or screens, and the state of one depends on another (list → detail → back, with real data).
- The server must honor a URL: a URL parameter round trip, or browser back and forward that reloads data. Frontend-only navigation is not a reason: the router location covers it in Jest.
- The assertion needs a real browser. jsdom does not do these: layout and measured sizes, CSS visibility and overflow, scroll and virtualization, focus and keyboard across iframes, clipboard, file downloads, `ResizeObserver`, canvas and SVG geometry, a click at chart coordinates, drag, hit-testing, drill-through from a rendered chart.
- The test sends real traffic to a service that the CI stack runs (mail catcher, webhook tester), **and** no backend test sends the same traffic to a real local server.

### Signals for Jest + RTL (move)

- **Mocked data.** `cy.intercept` with a stubbed body, `req.reply(...)` or a fixture for the endpoint that the assertions read. A `cy.intercept` that only **waits** on a request is not a mock.
- **Render only.** Only `should("exist" | "be.visible" | "contain" | "have.attr")` after `cy.visit`, with no `click` or `type` that reaches the backend. Clicks that only navigate or open UI are still render only.
- **Frontend logic.** A formatting, bucketing or derivation decision that has one correct answer without the backend (for example "a single-day range buckets by hour").
- **State and wiring.** Tab → `aria-selected`, select → query string. The "URL gets the parameter" half is component-level. Only the "backend honors the parameter" half needs e2e.
- **Configuration.** The assertions depend only on a token or plan, a setting value, or a feature flag. These are props or state in a unit test.
- **Tracking.** A Snowplow assertion on a view or click event. In Jest, `metabase/analytics` is mocked automatically.
- **Library behavior.** "An ECharts SVG renders" tests the library, not our code.
- A comment that says a behavior "can't be tested in unit tests". Check it. Such comments are often out of date.

### Not reasons to keep a test

- A third-party API on the internet. The CI result depends on that service. Treat it as a risk, not as coverage.
- A backend validation error shown in the UI. Usually a backend test pins the response, and Jest covers how the UI shows it.
- A low priority on the referenced issue. Priority shows the user impact at triage time. It does not show how likely the bug is to occur again.

Do not fill the keep bucket to look balanced. A spec where all tests stay is a correct result, and so is a spec where all tests move. When a test is partly frontend-only, split it: keep the integration half in e2e.
