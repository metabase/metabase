---
title: Building custom visualizations
summary: Use the Custom Visualizations SDK to build, develop, and package your own chart types for Metabase.
---

# Building custom visualizations

{% include plans-blockquote.html feature="Custom visualizations" %}

You can create a custom chart type for Metabase that you build with React and TypeScript and ship as a plugin.

You scaffold a project with the `@metabase/custom-viz` package, write your visualization, and package it into a `.tgz` bundle. An admin uploads the plugin to Metabase (see [Custom visualizations](../questions/visualizations/custom.md)), and you're in business.

## Overview of a custom visualization

A custom visualization is a small React app that Metabase renders in place of a built-in chart.

Building a custom viz from scaffolding to adding it to your Metabase looks something like:

1. **Scaffold** a project with the `@metabase/custom-viz` CLI. The command sets up the build, the manifest, and a working starter visualization.
2. **Develop** against a locally running Metabase with hot reload while you write your component and settings.
3. **Handle the data**: read query results from `series`, wire up clicks and tooltips, and add any settings your chart needs.
4. **Match the look** with Metabase's formatters, theme variables, and color scheme.
5. **Build and package** the project into a `.tgz` bundle.
6. **Add it to your Metabase**: an admin uploads the bundle, and your chart type becomes available in your Metabase.

## Prerequisites

- Node.js 22 or newer.
- Familiarity with React and TypeScript.
- A Metabase on a [Pro or Enterprise plan](https://www.metabase.com/pricing/) to load your plugin into.

## Scaffold a custom visualization project

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
metabase-plugin.json    # Plugin manifest (name, icon, version)
public/
  assets/
    icon.svg            # Visualization icon (shown in the chart type picker)
package.json
vite.config.ts          # Build configuration — don't edit
pack.mjs                # Packages the build into a .tgz — don't edit
tsconfig.json
```

Only `index.tsx` has to export the factory. For a more sophisticated plugin, you'd want to split the component, settings, types, and helpers into their own modules (check out the [calendar-heatmap example](#example-plugins), which keeps the definition in `index.tsx`, the React component in `Visualization.tsx`, and chart configuration and utilities under `src/`).

### The starter visualization

The scaffold ships a complete, working example: a chart that shows a thumbs-up emoji (👍) when a single numeric result meets a `threshold` setting, and a thumbs-down (👎) otherwise.

## Develop against a running Metabase

To develop your plugin against a live Metabase with hot reload:

1. Start Metabase with the `MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED` environment variable set to `true`. Dev mode is meant for local development, so you can only turn it on with this environment variable. Like any Metabase that runs custom visualizations, this local instance needs a [Pro or Enterprise](https://www.metabase.com/pricing/) token.
2. Run `npm run dev` in your project. By default, the dev server listens on `http://localhost:5174`.
3. In Metabase, go to **Admin** > **Settings** > **Custom visualizations** > **Development** and set the **Dev server URL** to your dev server's address.

Your plugin shows up in the **Custom visualizations** section of the visualization sidebar (alongside any installed plugins) and is labeled as a dev visualization.

If you're running Metabase in a Docker container, you'll need to set the **Dev server URL** to:

```
http://host.docker.internal:5174
```

## The plugin manifest

Every plugin includes a `metabase-plugin.json` file at the root of the project:

```json
{
  "name": "my-viz",
  "icon": "icon.svg",
  "metabase": {
    "version": ">=1.62.0"
  }
}
```

| Field              | Description                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | Unique identifier for the plugin. Metabase registers your visualization under this name and uses it to match replacement bundles.                                                            |
| `icon`             | Path to the visualization icon (SVG recommended). Metabase serves the icon automatically. It's the only file Metabase serves alongside your bundle. See [Bundling assets](#bundling-assets). |
| `metabase.version` | Semver range of Metabase versions the plugin supports (for example, `">=1.62.0"`, `"^1.62"`, `">=1.62 <1.64"`).                                                                              |

## Defining a visualization

`src/index.tsx` exports a factory function. Metabase calls the function with two helpers: `defineSetting` (for declaring settings) and the current `locale`. The factory function should return the result of `defineConfig`, which wraps your `VisualizationComponent`.

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

| Property                 | Type                                | Description                                                                                 |
| ------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| `id`                     | `string`                            | Identifier for the visualization definition.                                                |
| `getName()`              | `() => string`                      | Display name for the visualization.                                                         |
| `minSize`                | `{ width, height }`                 | Minimum size on a dashboard grid.                                                           |
| `defaultSize`            | `{ width, height }`                 | Default size on a dashboard grid.                                                           |
| `noHeader`               | `boolean`                           | When `true`, hides the default card title and description header.                           |
| `canSavePng`             | `boolean`                           | Set to `true` to enable PNG export of the live, interactive chart. Disabled by default.     |
| `checkRenderable`        | `(series, settings) => void`        | Let people know the chart doesn't work with the current data or settings.                   |
| `settings`               | `Record<string, SettingDefinition>` | Map of setting definitions created with `defineSetting()`.                                  |
| `VisualizationComponent` | `React.ComponentType`               | The interactive React component that renders the visualization in questions and dashboards. |

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

## Handling query results

`series` is an array of result sets, with one entry per series on the chart. A single question produces one entry; a dashboard card with [multiple series](../dashboards/multiple-series.md) produces several entries. Each entry has a `data` object:

- `data.rows`: an array of rows; each row is an array of cell values in column order. Row order is preserved, so when you map rows to chart points one-to-one, a point's index maps straight back to `data.rows[i]`. Useful for grabbing the whole row, not just the clicked cell.
- `data.cols`: an array of column objects describing each value. The fields you'll reach for most: `name` (database column name), `display_name` (label shown in the UI), `base_type` (Metabase type, for example `"type/Integer"`), and `semantic_type` (for example `"type/Currency"` or `"type/Latitude"`).

```tsx
const [{ data }] = series;
const total = data.rows.reduce((sum, [value]) => sum + Number(value), 0);
```

To classify a column without matching type strings by hand, use the column-type predicates the SDK exports: `isNumeric`, `isDate`, `isString`, `isBoolean`, `isCurrency`, `isLatitude`, `isCoordinate`, `isFK`, `isPK`, `isCategory`, `isURL`. These predicates take a `Column` and resolve type metadata from the host, so they only work inside a running Metabase. See [Formatting and theming](#formatting-and-theming).

```tsx
import { isNumeric } from "@metabase/custom-viz";

const numericColumns = data.cols.filter(isNumeric);
```

## Clicks and tooltips

Your component receives `onClick` and `onHover`. Call them with an object that identifies the data point being interacted with. Metabase positions popovers from it, and for clicks it offers the matching drill-through actions (filter by this value, view these rows, and so on).

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

Pass `null` to `onHover` to dismiss the tooltip. `onClick` also takes an `origin: { row, cols }` when a drill-through needs the whole row, not just the clicked cell. It can take a `data` array of `{ col, value }` pairs (one per column) when an action needs every column's value. You can include `settings` (the current resolved settings) in the click object too, so dashboard click behaviors configured against your visualization have what they need.

The hover object accepts more than `element` and `data`. Optional fields like `index` and `seriesIndex` (to highlight a series in the legend) and `value`, `column`, `dimensions`, and `event` (for a simpler single-point tooltip) are available when you need them.

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

| Property                       | Description                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `id`                           | Unique key — has to match the key in your `Settings` type.                                       |
| `title`                        | Label shown in the sidebar.                                                                      |
| `getSection()`                 | Function returning the section the setting appears under (for example, `"Data"` or `"Display"`). |
| `group`                        | Sub-heading within a section for grouping related settings.                                      |
| `index`                        | Display order within a group.                                                                    |
| `inline`                       | When `true`, renders the widget on the same line as `title` (handy for `"toggle"`).              |
| `widget`                       | A [built-in widget](#built-in-widgets) name, or a [custom React component](#custom-widgets).      |
| `getDefault(series, settings)` | Computes the default value when none is stored.                                                  |
| `getValue(series, settings)`   | Always-computed value — overrides the stored value on every render.                              |
| `getProps(series, settings)`   | Returns widget-specific props.                                                                   |
| `isValid(series, settings)`    | Return `false` to discard a stored value and fall back to `getDefault`.                          |
| `readDependencies`             | Setting IDs that have to resolve before this one.                                                |
| `writeDependencies`            | Setting IDs whose current values are persisted when this setting changes.                        |
| `eraseDependencies`            | Setting IDs reset to `null` when this setting changes.                                           |
| `persistDefault`               | When `true`, writes the value from `getDefault` to stored settings on first render.              |

### Built-in widgets

Widgets for the settings UI.

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

### Custom widgets

When the built-in widgets don't fit, set `widget` to your own React component instead of a built-in name. Metabase renders the component in the settings sidebar, inside the same [sandbox](#sandbox-restrictions) as your visualization. A widget that reaches for a blocked API is removed, so keep widgets to plain inputs and display.

Metabase injects these props into your widget component (import the type with `BaseWidgetProps<TValue, TSettings>`):

| Prop               | Type                  | Description                             |
| ------------------ | --------------------- | --------------------------------------- |
| `id`               | `string`              | The setting's `id`.                     |
| `value`            | `TValue \| undefined` | The setting's current value.            |
| `onChange`         | `(value?) => void`    | Update this setting's value.            |
| `onChangeSettings` | `(settings) => void`  | Update other settings at the same time. |

Add any extra props your component needs with `getProps()`. Its return type is your component's own props, minus the base props Metabase injects.

```tsx
import { defineConfig, type BaseWidgetProps } from "@metabase/custom-viz";

type Settings = { label?: string };

function LabelWidget({ value, onChange }: BaseWidgetProps<string, Settings>) {
  return (
    <input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
  );
}

// ...in your visualization's settings:
settings: {
  label: defineSetting({
    id: "label",
    title: "Label",
    widget: LabelWidget,
  }),
},
```

## Formatting and theming

Render numbers, dates, and currencies the way the rest of Metabase does with `formatValue`. Pass the cell's column to pick up that column's formatting settings, or override with options like `currency`, `decimals`, `compact`, or `date_style`:

```tsx
import { formatValue } from "@metabase/custom-viz";

formatValue(row[1], { column: cols[1] });
formatValue(0.084, { number_style: "percent", decimals: 1 }); // "8.4%"
```

`formatValue` and the column-type predicates (like `isNumeric` and `isDate`) read formatting and type metadata from Metabase. If you call them outside of Metabase, like in a unit test, they'll throw `Metabase Viz API not initialized`.

For layout math (like fitting labels or sizing axes), `measureText(text, { size, family, weight })` returns `{ width, height }` in pixels. There's also `measureTextWidth` and `measureTextHeight` if you only need one dimension.

To match Metabase's look (and follow [dark mode](../people-and-groups/account-settings.md#theme)), you have two paths. For anything you render as DOM or SVG, you can style with Metabase's CSS variables: `var(--mb-color-brand)` and the other `--mb-color-*` variables, and the theme follows automatically.

Canvas-based charting libraries (like ECharts and Chart.js) can't read CSS variables, so in those cases you branch on the `colorScheme` prop (`"light"` or `"dark"`) and pass explicit colors. See the [calendar-heatmap example](#example-plugins) for one built with ECharts.

## Bundling assets

The build produces a single JavaScript bundle (`dist/index.js`), and the [icon](#the-visualization-icon) is the only file Metabase serves alongside it. Metabase doesn't serve arbitrary static files, so bundling images into your plugin is the most reliable approach. The [sandbox](#sandbox-restrictions) blocks scripted network access like `fetch` and `XMLHttpRequest`, but it doesn't stop the browser from loading an `<img>` or CSS `url()`: an external image still loads as long as its domain is allowed by the image-domains Content Security Policy (see below).

Bundled images always render, including when an admin has turned on [Restrict image domains](../configuring-metabase/settings.md#restrict-image-domains). That Content Security Policy setting limits which external hosts images can load from, but inline and `data:` images ship inside your bundle, so they're never blocked.

Your `npm` dependencies are bundled in too. You can pull in a charting library (the calendar-heatmap example bundles [ECharts](https://echarts.apache.org/)), but everything ships in that single `dist/index.js`, so your code and its dependencies all count toward the packaged plugin's [size limits](#build-and-package-the-plugin).

So anything your visualization renders has to live inside that bundle. For images, you have a few options:

- **Inline SVG or emoji.** What the starter visualization does (it renders 👍 / 👎). Drop the SVG markup straight into your JSX.
- **Import the image.** Import an image from `src/` and the bundler inlines small files as a base64 data URL. Vite inlines assets below its `assetsInlineLimit` (4 KB by default); larger files are emitted as separate assets that won't ship in the single bundle, so keep imported images small or raise the limit.
- **Embed a data URL directly.** Paste a `data:image/png;base64,...` string into your component's `src`.

```tsx
import logo from "./logo.svg"; // inlined as a data URL at build time

const VisualizationComponent = () => <img src={logo} alt="" />;
```

## The visualization icon

The icon shows up in the chart type picker and elsewhere in the Metabase UI.

- Declare it with `"icon"` in `metabase-plugin.json`. The default location is `public/assets/icon.svg`.
- Use `currentColor` for fills and strokes so the icon adapts to light and dark themes, as well as to hover and active states (like when it's highlighted in a menu):

```svg
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="..." stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

- For more control, you can use Metabase's CSS variables inside an inline SVG, like `fill="var(--mb-color-brand)"`.
- Keep the icon simple and monochromatic. Skip gradients and multiple colors.

## Build and package the plugin

Run:

```
npm run build
```

This compiles `src/` to `dist/` and packages the result into `<name>-<version>.tgz` at the project root. The archive contains `metabase-plugin.json`, `dist/index.js`, and the whitelisted icon under `dist/assets/`, and has to come in under 5 MiB. The packaging step also rejects an archive whose uncompressed contents exceed 25 MiB. You don't need to commit `dist/`.

For uploading and managing plugins, see [Custom visualizations](../questions/visualizations/custom.md).

## Versioning and compatibility

The Custom Visualizations SDK works with Metabase 1.62 and newer. Declare the versions your plugin supports with `metabase.version` in `metabase-plugin.json`, using [npm semver range](https://github.com/npm/node-semver#ranges) syntax — `">=1.62.0"`, `"^1.62"`, `">=1.62 <1.64"`. Write the range against the full version number (`">=1.62.0"`), not a bare major version (`">=62"`), which won't match.

If you upload a bundle to a Metabase outside the plugin's declared range, Metabase rejects the upload.

## Sandbox restrictions

Metabase runs plugin code in an isolated sandbox, so a visualization works only from the `series` and `settings` it's given. The sandbox blocks:

- **Network access**: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `Worker`, `SharedWorker`, `RTCPeerConnection`, `WebTransport`, `BroadcastChannel`, `navigator.sendBeacon`, and `FontFace.load`. You can't call Metabase's APIs or any other service.
- **Browser storage and cookies**: `localStorage`, `sessionStorage`, `indexedDB`, the Cache API, `document.cookie`, and the `CookieStore` API.
- **Device and credential APIs**: clipboard, geolocation, camera and microphone, service workers, the Credentials and Permissions APIs, USB, Bluetooth, HID, serial, WebXR, and Web Share.
- **Browser UI**: `window.open`, dialogs (`alert`, `confirm`, `prompt`, `print`), notifications, modal dialogs, fullscreen, and payment requests.
- **Navigation and the rest of the app**: history changes, the host page's URL and referrer, and any DOM outside the plugin's own container.
- **Unsafe DOM and timing APIs**: `document.write`, `execCommand`, constructable stylesheets, raw HTML parsers (`DOMParser`, `setHTMLUnsafe`, `XSLTProcessor`), and resource-timing APIs that expose other requests the page has made.

### Custom visualizations only render in the live app

Custom visualizations only render in the live, interactive app. Static renders, like dashboard subscriptions sent by [email](../dashboards/subscriptions.md), Slack, or webhook, fall back to a table for any card that uses a custom visualization. The same goes for [embedded](../embedding/introduction.md) questions and dashboards: a card that uses a custom visualization falls back to a table.

## Example plugins

- [Calendar heatmap](https://github.com/metabase/custom-viz-calendar-heatmap). Read through `src/` for an example of `checkRenderable`, settings, and rendering against `series` data.
- [Thumbs](https://github.com/metabase/custom-viz-thumbs). Thumbs up or down depending on a threshold.

## Further reading

- [Custom visualizations](../questions/visualizations/custom.md)
- [`@metabase/custom-viz` on npm](https://www.npmjs.com/package/@metabase/custom-viz)
- [Visualization overview](../questions/visualizations/visualizing-results.md)
