# value-formatting

Given a value and its column, produce what the app displays. This module is
`formatValue` plus its satellites: the per-column-type formatters it
dispatches to (date, time, url, email, geography, image), the click-behavior
template machinery (`link`, `click-data`), and the JSX injection point
(`registry`, `ui`).

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
- No import-time side effects: both rspack configs mark this directory
  `sideEffects: false`, so unused files behind the barrel are tree-shaken
  out of bundles (the static-viz size budget depends on this). Do not add
  top-level registration calls or global mutations.
- JSX rendering in interactive contexts is injected at app startup via
  `registerJsxFormatting()` (called from `visualizations/register.js`).
  Without registration - e.g. in static-viz's server-side bundle - jsx
  formatting degrades to plain text by design.
- Module boundaries are enforced by a leaf rule in
  `frontend/lint/module-boundaries.mjs`: only the `common` link components
  and embedding-sdk link handling may be imported from the shared tier.
