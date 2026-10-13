## When an `it()` earns its place in e2e

An `it()` belongs in e2e only if it exercises a layer you cannot fake without gutting the test's value. In this codebase that means one or more of:

- a **real backend query against seeded data**: the assertion depends on the server actually filtering, sorting, or bucketing rows, not on a mocked response;
- **real rendering you then interact with**: clicking a charted ECharts SVG element at computed coordinates, drag and hit-testing, drill-through;
- **routing across screens**: navigation, URL param round-trips that the backend then honors, browser back and forward;
- **cross-screen traversal**: list to detail and back, where the value is the seam between screens.

A test belongs in **Jest + RTL** (the cheaper layer this repo already uses for component and unit coverage) when its real subject is frontend-only:

- **pure frontend logic**: a bucketing, formatting, or derivation decision (for example "single-day range buckets by hour") that has one right answer independent of the backend;
- **render assertions**: "the page mounts N titled cards and an SVG exists." A mocked dataset response plus RTL verifies the titles; that an ECharts SVG renders is library behavior, not your logic;
- **state and wiring**: tab to `aria-selected` to active state, or select to querystring mapping. The *URL gets the param* half is component-level; only the *backend honors the param* half needs e2e.

Ground each call in **which layers the test actually touches**, not in how the test is named or where it lives.
