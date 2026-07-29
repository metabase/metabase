# value-formatting

Given a value and its column, produce what the app displays. This module is
`formatValue` plus its satellites: the per-column-type formatters it
dispatches to (date, time, url, email, geography, image), the click-behavior
template machinery (`link`, `click-data`), and the `registry` that the app's
JSX renderers register into.

This module imports nothing app-ward. The JSX rendering for links, markdown
and email (which needs `common`/`embedding-sdk` components) lives in
`visualizations/lib/register-jsx-formatting` and is injected into the
`registry` at app boot, so the engine itself stays a pure leaf.

## Where does a formatter belong?

The boundary with `metabase/utils/formatting` is a signature test:

- Takes a **column**, or speaks column-settings / temporal-unit vocabulary
  (`ColumnSettings`, `DatetimeUnit`, `TimeOnlyOptions`) → **here**.
- Takes a plain value and plain options (numbers, currency, durations,
  string munging) → **`metabase/utils/formatting`** (lib tier, may not
  import app code).

## Conventions

- Consumers import from the module root only; `index.ts` is the curated
  public interface. Internal helpers are deliberately unexported - add a
  name when a consumer needs it, not before.
- JSX rendering in interactive contexts is injected at app startup via
  `registerJsxFormatting()` (called from `visualizations/register.js`).
  Without registration - e.g. in static-viz's server-side bundle - jsx
  formatting degrades to plain text by design. This is why the module can
  stay a pure leaf: the React UI stack it would otherwise pull in lives in
  viz, not here.
- Module boundaries are enforced by a leaf rule in
  `frontend/lint/module-boundaries.mjs`: this module must not import any
  app-tier code.
