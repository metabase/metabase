# `__CUSTOM_VIZ_NAME__`

A custom visualization plugin for [Metabase](https://www.metabase.com).

## Getting Started

### Install dependencies and start developing

```bash
npm install
npm run dev        # Watch mode — rebuilds and hot-reloads on changes
```

### Build for production

```bash
npm run build
```

The build output goes to `dist/`, ready to be loaded into Metabase. Those files need be committed into the repo to be later used by Metabase.

### Project structure

```
src/
  index.tsx             # Your visualization code — start here
metabase-plugin.json    # Plugin manifest (name, icon, assets, version)
public/
  assets/
    icon.svg            # Visualization icon (shown in chart type picker)
    ...                 # Any other static assets
vite.config.ts          # Build configuration (do not edit)
tsconfig.json
```

---

## Development

To develop against a live Metabase instance with hot-reload:

1. Run `npm run dev` — changes hot-reload automatically in Metabase.

2. Start Metabase with dev mode enabled:

   ```
   MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED=true
   ```

3. In Metabase, go to **Admin → Custom visualizations → Development**.

4. Register your plugin and set the dev server URL to `http://localhost:5174`.

---

## Plugin Manifest (`metabase-plugin.json`)

```json
{
  "name": "__CUSTOM_VIZ_NAME__",
  "icon": "icon.svg",
  "assets": ["image.png"],
  "metabase": {
    "version": ">=1.60.0"
  }
}
```

| Field              | Description                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| `name`             | Unique identifier for the plugin. Must match the `id` returned by your visualization factory.    |
| `icon`             | Path to the visualization icon (SVG recommended). Automatically served — do not add to `assets`. |
| `assets`           | Additional static files to bundle (images and JSON only). Reference them via `getAssetUrl()`.    |
| `metabase.version` | Semver range of compatible Metabase versions (e.g. `">=1.60.0"`, `"^1.60"`).                     |

---

## Defining a Visualization

Your `src/index.tsx` exports a factory function that receives helpers and returns a visualization definition:

```tsx
import type { CreateCustomVisualization } from "@metabase/custom-viz";

type Settings = {
  myOption?: string;
};

const createVisualization: CreateCustomVisualization<Settings> = ({
  defineSetting,
  getAssetUrl,
  locale,
}) => {
  const VisualizationComponent = ({ series, settings, width, height }) => {
    // Render your visualization using React
    return <div>{/* ... */}</div>;
  };

  return {
    id: "__CUSTOM_VIZ_NAME__",
    getName: () => "__CUSTOM_VIZ_DISPLAY_NAME__",
    minSize: { width: 2, height: 2 },
    defaultSize: { width: 6, height: 4 },
    checkRenderable(series, settings) {
      // Throw an error if the visualization cannot be rendered
      if (series.length === 0) {
        throw new Error("No data");
      }
    },
    settings: {
      myOption: defineSetting({
        id: "myOption",
        title: "My option",
        widget: "input",
      }),
    },
    VisualizationComponent,
  };
};

export default createVisualization;
```

### Visualization definition properties

| Property                       | Type                                | Description                                                                                                                 |
| ------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`                           | `string`                            | Unique identifier. Must match `name` in `metabase-plugin.json`.                                                             |
| `getName()`                    | `() => string`                      | Display name shown in the chart type picker.                                                                                |
| `minSize`                      | `{ width, height }`                 | Minimum dashboard grid size.                                                                                                |
| `defaultSize`                  | `{ width, height }`                 | Default dashboard grid size.                                                                                                |
| `noHeader`                     | `boolean`                           | When `true`, hides the default card title/description header.                                                               |
| `canSavePng`                   | `boolean`                           | Set to `false` to disable PNG export for this visualization.                                                                |
| `checkRenderable`              | `(series, settings) => void`        | Throw here to signal the viz cannot render with the current data or settings. Metabase shows the error message to the user. |
| `settings`                     | `Record<string, SettingDefinition>` | Map of setting definitions created by `defineSetting()`.                                                                    |
| `VisualizationComponent`       | `React.ComponentType`               | The interactive React component for dashboard/question rendering.                                                           |
| `StaticVisualizationComponent` | `React.ComponentType`               | Optional. Component used for email, Slack, and PDF rendering (see below).                                                   |

### VisualizationComponent props

| Prop          | Type                                     | Description                                                                              |
| ------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------- |
| `series`      | `Series[]`                               | Query results (rows + column metadata).                                                  |
| `settings`    | `CustomVisualizationSettings<TSettings>` | Resolved visualization settings.                                                         |
| `width`       | `number \| null`                         | Container width in pixels (`null` until first measure — render `null` to avoid a flash). |
| `height`      | `number \| null`                         | Container height in pixels (`null` until first measure).                                 |
| `colorScheme` | `"light" \| "dark"`                      | Current Metabase color scheme.                                                           |
| `onClick`     | `(clickObject) => void`                  | Call to trigger drill-through actions on a data point.                                   |
| `onHover`     | `(hoverObject?) => void`                 | Call to show a tooltip on a data point.                                                  |

## Visualization Settings

Define settings with the `defineSetting()` helper. Each setting appears in the visualization settings sidebar.

```tsx
settings: {
  threshold: defineSetting({
    id: "threshold",
    title: "Threshold",
    section: "Display",
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

| Property                       | Description                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `id`                           | Unique key, must match the key in `Settings` type.                                   |
| `title`                        | Label shown in the sidebar.                                                          |
| `section`                      | Top-level section (e.g. `"Data"`, `"Display"`, `"Axes"`).                            |
| `group`                        | Sub-heading within a section for grouping related settings.                          |
| `index`                        | Display order within a group.                                                        |
| `inline`                       | When `true`, renders the widget on the same line as `title` (useful for `"toggle"`). |
| `widget`                       | Built-in widget name or a custom React component.                                    |
| `getDefault(series, settings)` | Computes the default value when none is stored.                                      |
| `getValue(series, settings)`   | Always-computed value — overrides stored value on every render.                      |
| `getProps(series, settings)`   | Returns widget-specific props.                                                       |
| `isValid(series, settings)`    | Return `false` to discard a stored value and fall back to `getDefault`.              |
| `readDependencies`             | Setting IDs that must resolve before this one.                                       |
| `writeDependencies`            | Setting IDs whose current values are persisted when this setting changes.            |
| `eraseDependencies`            | Setting IDs reset to `null` when this setting changes.                               |
| `persistDefault`               | When `true`, writes the computed default to stored settings on first render.         |

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

You can also pass a **custom React component** as `widget`. Its props (minus the base props injected by Metabase) are returned by `getProps`.

---

## Using Assets

1. Declare assets in `metabase-plugin.json` under `"assets"` (images and JSON files only).
2. Place files in `public/assets/` during development — they're copied to `dist/assets/` on build.
3. Reference them in code using `getAssetUrl("filename.png")`.

```tsx
const createVisualization: CreateCustomVisualization<Settings> = ({
  getAssetUrl,
}) => {
  // ...
  return <img src={getAssetUrl("my-image.png")} />;
};
```

`getAssetUrl()` returns the correct URL in all contexts: interactive rendering, static rendering (base64 data URL), and development mode.

> **Note:** The plugin icon is declared separately as `"icon"` in the manifest and is served automatically — do not add it to `"assets"`.

---

## Visualization Icon

The icon appears in the chart type picker and elsewhere in the Metabase UI.

- Declared via `"icon"` in `metabase-plugin.json`.
- Default location: `public/assets/icon.svg`.
- **Use `currentColor`** for fill/stroke so the icon adapts to light and dark themes.

```svg
<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="..." stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>
```

You can also use Metabase CSS variables inside inline SVG for more control:

```svg
<path fill="var(--mb-color-brand)" .../>
```

Keep the icon **simple and monochromatic** — avoid gradients and multiple colors.

---

## Static Visualizations (Email / Slack / PDF)

Provide a `StaticVisualizationComponent` to enable rendering in non-interactive contexts: email attachments, Slack previews, and PDF exports.

```tsx
const StaticVisualizationComponent = ({
  series,
  settings,
  renderingContext,
}: CustomStaticVisualizationProps<Settings>) => {
  const { getColor, fontFamily } = renderingContext;

  return (
    <svg viewBox={`0 0 540 360`} xmlns="http://www.w3.org/2000/svg">
      {/* Pure rendering — no event handlers */}
    </svg>
  );
};
```

### RenderingContext

| Property                         | Type                       | Description                                                                   |
| -------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `getColor(name)`                 | `(name: string) => string` | Returns a hex color for the given Metabase color name.                        |
| `measureText(text, style)`       | `TextWidthMeasurer`        | Measures the rendered width of a text string.                                 |
| `measureTextHeight(text, style)` | `TextHeightMeasurer`       | Measures the rendered height of a text string.                                |
| `fontFamily`                     | `string`                   | The font family in use. Apply to root elements for consistent text rendering. |

### GraalJS limitations

Static components run inside a **GraalJS (GraalVM) server-side JavaScript engine**. The following are unavailable:

- Browser globals: `window`, `document`, `navigator`, `localStorage`
- Network: `fetch`, `XMLHttpRequest`
- Timers: `setTimeout`, `setInterval`
- Dynamic imports: `import()`

**Guidelines:**

- Use fixed dimensions (e.g. `width: 540, height: 360`) — no responsive sizing.
- Return a valid React SVG component.
- Do not use `width`/`height` props (they are not passed in static context).
- Avoid external dependencies that rely on browser APIs.
- Use `getAssetUrl()` — in static context assets are provided as base64 data URLs.
- Keep rendering pure: data and settings in, JSX out.
