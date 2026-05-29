---
title: Building custom visualizations
summary: Use the Custom Visualizations SDK to build, develop, and package your own chart types for Metabase.
---

# Building custom visualizations

{% include plans-blockquote.html feature="Custom visualizations" %}

A custom visualization is a Metabase chart type that you build with React and TypeScript and ship as a plugin.

You scaffold a project with the `@metabase/custom-viz` package, write your visualization, package it into a `.tgz` bundle, and an admin uploads it to Metabase (see [Custom visualizations](../questions/visualizations/custom.md)).

## Prerequisites

- Node.js 22 or newer.
- Familiarity with React and TypeScript.
- A Metabase on a [Pro or Enterprise plan](https://www.metabase.com/pricing/) to load your plugin into.

## Scaffold a project

Generate a new project with the `@metabase/custom-viz` CLI:

```
npx @metabase/custom-viz init my-viz
```

Then install dependencies and start the dev server:

```
cd my-viz
npm install
npm run dev
```

`npm run dev` runs in watch mode and rebuilds your plugin on every change.

### Project structure

```
src/
  index.tsx             # Your visualization code — start here
metabase-plugin.json    # Plugin manifest (name, icon, assets, version)
public/
  assets/
    icon.svg            # Visualization icon (shown in the chart type picker)
    ...                 # Any other static assets
vite.config.ts          # Build configuration — don't edit
pack.mjs                # Packages the build into a .tgz — don't edit
tsconfig.json
```

### The starter visualization

The scaffold ships a complete, working example: a chart that shows a thumbs-up image when a single numeric result meets a `threshold` setting, and a thumbs-down otherwise. Start dev mode (below) and it renders on any single-number question. Open `src/index.tsx` to see how it fits together: the factory function, `checkRenderable`, a `defineSetting` for the threshold, and the React component — then edit it into your own visualization.

## Develop against a running Metabase

To develop your plugin against a live Metabase with hot reload:

1. Start Metabase with the following `MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED` environment variable set to `true`. Dev mode is meant for local development, so you can only turn it on with this environment variable.

2. Run `npm run dev` in your project. By default, the dev server listens on `http://localhost:5174`.

3. In Metabase, go to **Admin** > **Settings** > **Custom visualizations** > **Development** and set the **Dev server URL** to your dev server's address.

Your plugin shows up in the **Custom visualizations** section of the visualization sidebar (alongside any installed plugins) and is labeled as a dev visualization. Metabase watches the dev server and re-registers your plugin whenever you rebuild, so you don't have to reload by hand.

### If Metabase runs in Docker

Metabase's backend — not your browser — fetches from the dev server: it pulls `metabase-plugin.json`, the JS bundle, and the hot-reload stream from the **Dev server URL**. The URL therefore has to resolve from wherever Metabase runs.

When Metabase runs in a container, `http://localhost:5174` points at the container itself, and the **Development** page reports "Could not fetch metabase-plugin.json from the dev server." Point the URL at the host instead:

- **Docker Desktop (macOS or Windows):** set the Dev server URL to `http://host.docker.internal:5174`.
- **Linux:** start the container with `--add-host=host.docker.internal:host-gateway` (in Docker Compose, `extra_hosts: ["host.docker.internal:host-gateway"]`), then use the same `http://host.docker.internal:5174`.

The dev server listens on all network interfaces, so `npm run dev` needs no extra flags.

## The plugin manifest

Every plugin includes a `metabase-plugin.json` file at the root of the project:

```json
{
  "name": "my-viz",
  "icon": "icon.svg",
  "assets": ["image.png"],
  "metabase": {
    "version": ">=1.62.0"
  }
}
```

| Field              | Description                                                                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | Unique identifier for the plugin. Metabase registers your visualization under this name and uses it to match replacement bundles. It doesn't have to match the `id` your visualization returns. |
| `icon`             | Path to the visualization icon (SVG recommended). Metabase serves it automatically.                                                                                                                     |
| `assets`           | Other static files to bundle (images and JSON only). Reference them in code with `getAssetUrl()`.                                                                                                       |
| `metabase.version` | Semver range of Metabase versions the plugin supports (for example, `">=1.62.0"`, `"^1.62"`, `">=1.62 <1.64"`).                                                                                         |

## Defining a visualization

`src/index.tsx` exports a factory function. Metabase calls it with a set of helpers and expects a visualization definition back. Wrap the definition in `defineConfig` — it turns the React `VisualizationComponent` you write into the renderer Metabase mounts, and keeps the definition's types in check:

```tsx
import {
  defineConfig,
  type CreateCustomVisualization,
  type CustomVisualizationProps,
} from "@metabase/custom-viz";

type Settings = {
  threshold?: number;
};

const createVisualization: CreateCustomVisualization<Settings> = ({
  defineSetting,
  getAssetUrl,
  locale,
}) => {
  const VisualizationComponent = ({
    series,
    settings,
    width,
    height,
  }: CustomVisualizationProps<Settings>) => {
    // Render your visualization with React
    return <div>{/* ... */}</div>;
  };

  return defineConfig<Settings>({
    id: "my-viz",
    getName: () => "My visualization",
    minSize: { width: 2, height: 2 },
    defaultSize: { width: 6, height: 4 },
    checkRenderable(series, settings) {
      // Throw if the visualization can't render with this data or these settings
      if (series.length === 0) {
        throw new Error("No data");
      }
    },
    settings: {
      threshold: defineSetting({
        id: "threshold",
        title: "Threshold",
        widget: "number",
      }),
    },
    VisualizationComponent,
  });
};

export default createVisualization;
```

### Visualization definition properties

| Property                 | Type                                | Description                                                                                                                                                                                     |
| ------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | `string`                            | Identifier for the visualization definition. It doesn't have to match `name` in `metabase-plugin.json` — the example plugin uses the name `"Calendar Heatmap"` and the id `"calendar-heatmap"`. |
| `getName()`              | `() => string`                      | Display name for the visualization.                                                                                                                                                             |
| `minSize`                | `{ width, height }`                 | Minimum size on a dashboard grid.                                                                                                                                                               |
| `defaultSize`            | `{ width, height }`                 | Default size on a dashboard grid.                                                                                                                                                               |
| `noHeader`               | `boolean`                           | When `true`, hides the default card title and description header.                                                                                                                               |
| `canSavePng`             | `boolean`                           | Set to `true` to enable PNG export for this visualization. Disabled by default.                                                                                                                 |
| `checkRenderable`        | `(series, settings) => void`        | Throw here to signal the visualization can't render with the current data or settings. Metabase shows the error message to the person viewing the chart.                                        |
| `settings`               | `Record<string, SettingDefinition>` | Map of setting definitions created with `defineSetting()`.                                                                                                                                      |
| `VisualizationComponent` | `React.ComponentType`               | The interactive React component that renders the visualization in questions and dashboards.                                                                                                     |

### Props passed to your component

| Prop          | Type                                     | Description                                                                                 |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| `series`      | `Series`                                 | Query results — an array of series; each has `data.rows` and `data.cols`.                   |
| `settings`    | `CustomVisualizationSettings<TSettings>` | The resolved visualization settings.                                                        |
| `width`       | `number \| null`                         | Container width in pixels. `null` until the first measure — render `null` to avoid a flash. |
| `height`      | `number \| null`                         | Container height in pixels. `null` until the first measure.                                 |
| `colorScheme` | `"light" \| "dark"`                      | Metabase's current color scheme.                                                            |
| `onClick`     | `(clickObject) => void`                  | Call to trigger drill-through actions on a data point.                                      |
| `onHover`     | `(hoverObject?) => void`                 | Call to show a tooltip on a data point.                                                     |

## Query results

`series` is an array of result sets — one entry per series on the chart. A single question produces one entry; a dashboard card with [multiple series](../dashboards/multiple-series.md) produces several. Each entry has a `data` object:

- `data.rows` — an array of rows; each row is an array of cell values in column order.
- `data.cols` — an array of column objects describing each value. The fields you'll reach for most: `name` (database column name), `display_name` (label shown in the UI), `base_type` (Metabase type, for example `"type/Integer"`), and `semantic_type` (for example `"type/Currency"` or `"type/Latitude"`).

```tsx
const [{ data }] = series;
const total = data.rows.reduce((sum, [value]) => sum + Number(value), 0);
```

To classify a column without matching type strings by hand, use the column-type predicates the SDK exports — `isNumeric`, `isDate`, `isString`, `isBoolean`, `isCurrency`, `isLatitude`, `isCoordinate`, `isFK`, `isPK`, `isCategory`, `isURL`, and more — each of which takes a `Column`:

```tsx
import { isNumeric } from "@metabase/custom-viz";

const numericColumns = data.cols.filter(isNumeric);
```

Use `checkRenderable` to bail out when the data isn't a shape your visualization can handle. Throw an `Error` whose message is aimed at the person viewing the chart — Metabase shows it in place of the visualization, so "Pick exactly one numeric column" beats a stray `TypeError`.

## Clicks and tooltips

Your component receives `onClick` and `onHover`. Call them with an object that identifies the data point being interacted with — Metabase positions popovers from it, and for clicks it offers the matching drill-through actions (filter by this value, view these rows, and so on).

```tsx
<rect
  onClick={(event) =>
    onClick({
      value: row[1],
      column: cols[1],
      dimensions: [{ value: row[0], column: cols[0] }],
      event: event.nativeEvent,
      element: event.currentTarget,
    })
  }
  onMouseMove={(event) =>
    onHover({
      element: event.currentTarget,
      data: cols.map((col, i) => ({
        col,
        value: row[i],
        key: col.display_name,
      })),
    })
  }
  onMouseLeave={() => onHover(null)}
/>
```

Pass `null` to `onHover` to dismiss the tooltip. `onClick` also takes an `origin: { row, cols }` when a drill-through needs the whole row, not just the clicked cell.

## Settings and widgets

Define settings with the `defineSetting()` helper. Each setting shows up in the visualization settings sidebar.

```tsx
settings: {
  threshold: defineSetting({
    id: "threshold",
    title: "Threshold",
    getSection: () => "Display",
    widget: "number",
    getDefault: () => 0,
    getProps: () => ({
      placeholder: "Enter threshold",
      options: { isNonNegative: true },
    }),
  }),
},
```

### Setting definition properties

Settings can depend on each other. `getDefault`, `getValue`, `getProps`, and `isValid` all receive the current `series` and resolved `settings`, so one setting's default or options can react to another's value. Declare those relationships with `readDependencies` (resolve these first), `writeDependencies` (persist these alongside this one), and `eraseDependencies` (reset these when this one changes) so Metabase recomputes everything in the right order.

| Property                       | Description                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `id`                           | Unique key — has to match the key in your `Settings` type.                                       |
| `title`                        | Label shown in the sidebar.                                                                      |
| `getSection()`                 | Function returning the section the setting appears under (for example, `"Data"` or `"Display"`). |
| `group`                        | Sub-heading within a section for grouping related settings.                                      |
| `index`                        | Display order within a group.                                                                    |
| `inline`                       | When `true`, renders the widget on the same line as `title` (handy for `"toggle"`).              |
| `widget`                       | Built-in widget name (see below).                                                                |
| `getDefault(series, settings)` | Computes the default value when none is stored.                                                  |
| `getValue(series, settings)`   | Always-computed value — overrides the stored value on every render.                              |
| `getProps(series, settings)`   | Returns widget-specific props.                                                                   |
| `isValid(series, settings)`    | Return `false` to discard a stored value and fall back to `getDefault`.                          |
| `readDependencies`             | Setting IDs that have to resolve before this one.                                                |
| `writeDependencies`            | Setting IDs whose current values are persisted when this setting changes.                        |
| `eraseDependencies`            | Setting IDs reset to `null` when this setting changes.                                           |
| `persistDefault`               | When `true`, writes the value from `getDefault` to stored settings on first render.              |

### Built-in widgets

| Widget               | `getProps()` return type                                                   | Description              |
| -------------------- | -------------------------------------------------------------------------- | ------------------------ |
| `"input"`            | `{ placeholder? }`                                                         | Text input               |
| `"number"`           | `{ placeholder?, options?: { isInteger?, isNonNegative? } }`               | Numeric input            |
| `"toggle"`           | _(none — omit `getProps`)_                                                 | Boolean toggle           |
| `"radio"`            | `{ options: { name, value }[] }`                                           | Radio button group       |
| `"select"`           | `{ options: { name, value }[], placeholder?, placeholderNoOptions? }`      | Dropdown                 |
| `"segmentedControl"` | `{ options: { name, value }[] }`                                           | Segmented button control |
| `"color"`            | `{ title? }`                                                               | Color picker             |
| `"multiselect"`      | `{ options: { label, value }[], placeholder?, placeholderNoOptions? }`     | Multi-select dropdown    |
| `"field"`            | `{ columns, options: { name, value }[], showColumnSetting? }`              | Single column picker     |
| `"fields"`           | `{ columns, options: { name, value }[], addAnother?, showColumnSetting? }` | Multi-column picker      |

## Formatting and theming

Render numbers, dates, and currencies the way the rest of Metabase does with `formatValue` from the SDK. Pass the cell's column to pick up that column's formatting settings, or override with options like `currency`, `decimals`, `compact`, or `date_style`:

```tsx
import { formatValue } from "@metabase/custom-viz";

formatValue(row[1], { column: cols[1] });
formatValue(0.084, { number_style: "percent", decimals: 1 }); // "8.4%"
```

For layout math — fitting labels, sizing axes — `measureText(text, { size, family, weight })` returns `{ width, height }` in pixels (`measureTextWidth` and `measureTextHeight` are there too if you only need one dimension).

To match the app's look and follow [dark mode](../people-and-groups/account-settings.md#theme) automatically, style with Metabase's CSS variables — `var(--mb-color-brand)` and the other `--mb-color-*` tokens — instead of hard-coded colors. The `colorScheme` prop (`"light"` or `"dark"`) is available too if you need to branch explicitly.

## Bundling assets

To ship static files (images or JSON) with your plugin:

1. List them under `"assets"` in `metabase-plugin.json`.
2. Put the files in `public/assets/` — they're copied to `dist/assets/` when you build.
3. Reference them in code with `getAssetUrl("filename.png")`, which returns the right URL in both interactive rendering and dev mode. `getAssetUrl` is provided by the factory parameters — destructure it from the factory argument, don't import it from `@metabase/custom-viz`.

```tsx
const createVisualization: CreateCustomVisualization<Settings> = ({
  getAssetUrl,
}) => {
  const VisualizationComponent = () => (
    <img src={getAssetUrl("my-image.png")} alt="" />
  );

  // ...return your visualization definition with this component
};
```

## The visualization icon

The icon shows up in the chart type picker and elsewhere in the Metabase UI.

- Declare it with `"icon"` in `metabase-plugin.json`. The default location is `public/assets/icon.svg`.
- Use `currentColor` for fills and strokes so the icon adapts to light and dark themes:

```svg
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="..." stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

- For more control, you can use Metabase's CSS variables inside an inline SVG, like `fill="var(--mb-color-brand)"`.
- Keep the icon simple and monochromatic — skip gradients and multiple colors.

## Build and package the plugin

When your visualization is ready, run:

```
npm run build
```

This compiles `src/` to `dist/` and packages the result into `<name>-<version>.tgz` at the project root. The archive contains `metabase-plugin.json`, `dist/index.js`, and any whitelisted `dist/assets/*` files, and has to come in under 5 MB (5 MiB). The packaging step also rejects an archive whose uncompressed contents exceed 25 MiB. You don't need to commit `dist/`.

Upload the `.tgz` file in **Admin** > **Settings** > **Custom visualizations** > **Manage visualizations** > **Add**. See [Custom visualizations](../questions/visualizations/custom.md) for more on uploading and managing plugins.

## Versioning and compatibility

The Custom Visualizations SDK works with Metabase 1.62 and newer. Declare the versions your plugin supports with `metabase.version` in `metabase-plugin.json`, using [npm semver range](https://github.com/npm/node-semver#ranges) syntax — `">=1.62.0"`, `"^1.62"`, `">=1.62 <1.64"`. Write the range against the full version number (`">=1.62.0"`), not a bare major version (`">=62"`), which won't match.

Metabase accepts the upload regardless of version, but a plugin only loads when the running instance falls within its range. If the instance is outside the range — whether the plugin needs a newer version, or a later downgrade moves the instance out of range — the plugin doesn't appear in the visualization picker, and cards that used it fall back to a default visualization until the instance is back in range.

## Sandbox restrictions

Metabase runs plugin code in an isolated sandbox, so a visualization works only from the `series` and `settings` it's given. The sandbox blocks:

- **Network access**: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `Worker`, and similar. You can't call Metabase's APIs or any other service.
- **Browser storage**: `localStorage`, `sessionStorage`, `indexedDB`, the Cache API, and cookies.
- **Navigation and the rest of the app**: `window.open`, history changes, and any DOM outside the plugin's own container.

Plugins also don't render in static visualizations: dashboard subscriptions sent by [email](../dashboards/subscriptions.md) and Slack fall back to a default visualization for cards that use a custom visualization.

## Examples

- [Calendar heatmap](https://github.com/metabase/custom-viz-calendar-heatmap) — a complete custom visualization plugin. Clone it, run `npm install && npm run build`, and upload the resulting `.tgz` to a Metabase to see it in action — or read through `src/` for a worked example of `checkRenderable`, settings, and rendering against `series` data.

## Further reading

- [Custom visualizations](../questions/visualizations/custom.md)
- [`@metabase/custom-viz` on npm](https://www.npmjs.com/package/@metabase/custom-viz)
- [Visualization overview](../questions/visualizations/visualizing-results.md)
