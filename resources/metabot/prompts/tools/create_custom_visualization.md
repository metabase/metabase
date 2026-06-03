Apply a reusable custom visualization plugin to a query, creating a new plugin only when needed.

Use this tool when the user asks for a visualization that cannot be built with Metabase's built-in chart types, such as bespoke controls, custom drawing, cards, ratings, timelines, diagrams, or interactive widgets, or when `list_visualization_types` shows an existing reusable custom visualization that matches the request. The plugin you create must be a reusable visualization type, not a one-off chart tied to one table, metric, or dataset.

Workflow:

- First call `list_visualization_types` before choosing a chart implementation. If a built-in visualization fits the user request, use `create_chart` instead of this tool. If an existing custom visualization fits the reusable pattern, reuse it by calling this tool with `query_id` and `identifier`, omitting `factory_js`, `display_name`, and `description`.
- Fetch the data the visualization needs with `execute_notebook_query_silently`, NOT `construct_notebook_query` or `create_chart`. The custom visualization IS the user-facing output, so the intermediate query result must not be shown to the user as its own table or chart. `execute_notebook_query_silently` runs the query without rendering anything and returns a `<query-id>` you can reuse. Do not cite values from this silent result with `metabase://data-point` links; wait until the custom visualization is rendered, then only link values that are visible there.
- Then call this tool with that `query_id`. Do not run `construct_notebook_query`/`create_chart` first just to obtain a query — that displays an extra table to the user before the custom visualization appears.
- Only provide new `factory_js` when neither a built-in visualization nor an existing custom visualization fits the request.
- Provide `factory_js` as a JavaScript expression, not a module. Do not include imports or exports.
- Render with plain DOM APIs. Do not use React, JSX, npm packages, network requests, localStorage, or global CSS.
- The frontend will report custom visualization render feedback after it tries the generated plugin. If you receive a "Custom visualization render feedback: failed" message, call this tool again for the same query/user intent with corrected `factory_js`.
- The custom-viz sandbox blocks dangerous DOM operations and tags. Do not create `input`, `form`, `a`, `script`, `iframe`, `object`, `embed`, `link`, `meta`, `base`, `frame`, `map`, `area`, `style`, `video`, `audio`, `source`, `track`, `use`, `image`, `feImage`, or `foreignObject` elements, and do not set `javascript:` URLs or inline `on*` attributes.
- Use `button`, `div`, `span`, and SVG primitives for controls and drawing. For inputs/segmented controls, make button-like controls instead of real form elements.
- The factory function receives exactly `{ defineSetting, locale }`. There is no `getAssetUrl` or any other helper — do not reference one. It must return an object with `id`, `getName`, `checkRenderable`, optional `settings`, and `mount`.
- `mount(container, initialProps)` must render into `container` and return `{ update(nextProps), unmount() }`. `mount` is called once; `update` is called on every later change (new data, resize, settings); `unmount` must clean up.
- The props passed to `mount`/`update` are `{ width, height, series, settings, colorScheme, onClick, onHover }`. `width`/`height` are pixel numbers (may be `null` before the first measure — render nothing until both are set). `colorScheme` is `"light"` or `"dark"`. Call `onClick(clickObject)` / `onHover(hoverObject)` for interactivity, or ignore them.
- Size the first render for the Metabot inline visualization slot: about `850px` wide by `384px` tall on desktop, and about the viewport width by `288px` tall on narrow/mobile screens. Expanded/fullscreen views can be larger, so always use the actual `props.width` and `props.height` when laying out. Do not create a fixed 700px+ tall root, reserve empty lower space, or assume the chart can grow vertically; make dense layouts (calendar heatmaps, timelines, maps) fit inside the supplied height with compact labels, legends, scrolling, or pagination as needed.
- Read data from `props.series[0].data.cols` (column metadata: each has `name`, `display_name`, `base_type`, `semantic_type`, `effective_type`) and `props.series[0].data.rows` (array of value arrays, one per row, column order matching `cols`).
- Helpers are available on `globalThis.__METABASE_VIZ_API__`: `formatValue(value, { column })` returns a display string for a cell, `measureText(text, { size, family, weight })` returns `{ width, height }`, `measureTextWidth`/`measureTextHeight` return numbers, and `columnTypes` has predicates such as `isNumeric(col)`, `isDate(col)`, `isString(col)`, `isLatitude(col)`, `isLongitude(col)`. Prefer these over reinventing formatting or type detection.
- `settings` entries created with `defineSetting` must use one of these `widget` values only: `input`, `number`, `radio`, `select`, `toggle`, `segmentedControl`, `color`, `multiselect`, `field`, `fields`. Any other widget name is rejected.
- Keep state such as selected page/month inside the mounted visualization closure, and re-render on button clicks and updates.
- Use `visualization_settings` for query-specific constants the plugin should receive as `props.settings`, such as thresholds, labels, units, field-role overrides, and display options.
- The generated `factory_js` is validated on the server (it is parsed and run through the full `factory → checkRenderable → mount → update → unmount` lifecycle) before the visualization is shown. If validation fails, the tool returns the JavaScript error instead of creating the visualization; read the error, fix `factory_js`, and call the tool again. Keep `factory_js` reasonably compact so the tool call is not truncated.

Reusable plugin requirements:

- Treat each custom visualization as a generic chart type that will appear in the admin list of custom visualizations and can be selected for other questions later.
- Make `display_name`, `identifier`, `description`, and the factory `id` describe the reusable visualization pattern. Good: "Star Rating Bars", "Month Switcher", "Bubble Map", "Commit Graph". Bad: "Orders by Month Stars", "Reviews by Star Rating", "Revenue Bar Chart Race".
- The query can be specific to the user's data, but the plugin must not be. Do not hardcode table names, metric names, field names, date ranges, filter values, or business entities into `factory_js`.
- Infer labels from `props.series[0].data.cols[*].display_name` or `name`, and allow overrides via `props.settings`. For example, use `settings.valueLabel` or the value column display name instead of hardcoding "orders", "reviews", "revenue", or "customers".
- Prefer generic column roles over exact column names. Read by position by default, or use settings such as `categoryColumn`, `valueColumn`, `timeColumn`, `seriesColumn`, `latitudeColumn`, and `longitudeColumn` to override role mapping.
- Validate reusable data shapes in `checkRenderable`: require a numeric value column for bars/gauges/ratings, a temporal or category column for grouped views, latitude/longitude columns for maps, etc. Do not require exact names like `Rating`, `Created At`, `Count`, or `State`.
- Put dataset-specific thresholds, scales, titles, units, color labels, and requested wording in `visualization_settings`, not inside the plugin source. Example: a generic "Star Rating Bars" plugin can receive `{ "minValue": 0, "maxValue": 15000, "valueLabel": "orders" }`.
- When repairing a generated visualization after frontend feedback, keep the same generic `identifier` unless the reusable visualization pattern itself changes.

Metabase visual design guidelines:

- Make the visualization feel native to Metabase: quiet, analytical, task-focused, and data-first. Avoid marketing-style hero layouts, decorative backgrounds, large illustrations, glassmorphism, heavy gradients, shadows, or ornamental flourishes.
- Prefer a clean white or near-white canvas with subtle borders (`#dfe4e8`, `#edf2f5`) and restrained fills (`#f7f9fb`, `#f1f5f9`). Use Metabase blue (`#509ee3`) for primary interactive states and semantic colors only when they clarify meaning: green for good/up/success, red for bad/down/error, yellow/orange for warning or attention.
- Keep typography compact and legible. Use the host font stack (`font-family: inherit` or system sans-serif), normal letter spacing, 12-14px labels, 16-24px headings or key values, and heavier weights only for titles, numbers, and active states.
- Use spacing in small, regular steps: 4px, 8px, 12px, 16px, 24px, and 32px. Keep radii modest, usually 4-8px. Avoid pill-shaped controls unless the surrounding Metabase UI already uses that pattern for the same control.
- Make dense information easy to scan. Align numbers, label axes and units clearly, keep legends close to the chart, and avoid redundant prose inside the visualization. Put details in tooltips or compact labels instead of explanatory paragraphs.
- Choose chart forms by analytical purpose: line/area for time trends, bar/row for category comparison, table/pivot for exact values, progress/gauge for goal progress, scalar/trend for a single KPI, scatter/box for distributions, funnel for ordered drop-off, map only for geographic data, and custom controls only when they help explore the data.
- For interactive custom visualizations, make controls obvious and Metabase-like: small `button` elements with clear labels or symbols, subtle hover/focus states, disabled states when navigation cannot proceed, and no layout shift when labels or values change.
- Make the empty, invalid, or sparse-data states graceful. `checkRenderable` should throw a concise, actionable error when required columns are missing, and the rendered UI should avoid blank panels when data exists but has zeros or nulls.
- Keep custom visualizations responsive inside the Metabot card and fullscreen view. Use container-relative sizing, avoid fixed widths that overflow, and ensure labels, buttons, and legends do not overlap on narrow screens.

Factory shape:

```javascript
function ({ defineSetting }) {
  return {
    id: "metric-summary",
    getName: function () { return "Metric Summary"; },
    checkRenderable: function (series, settings) {
      if (!series.length) throw new Error("Expected one series");
    },
    settings: {
      maxValue: defineSetting({
        id: "maxValue",
        title: "Max value",
        widget: "number",
        getDefault: function () { return 100; }
      })
    },
    mount: function (container, initialProps) {
      var props = initialProps;
      function render() {
        container.innerHTML = "";
        var root = document.createElement("div");
        root.textContent = String(props.series[0].data.rows.length);
        container.appendChild(root);
      }
      render();
      return {
        update: function (nextProps) { props = nextProps; render(); },
        unmount: function () { container.innerHTML = ""; }
      };
    }
  };
}
```
