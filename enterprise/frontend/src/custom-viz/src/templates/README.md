# `__CUSTOM_VIZ_NAME__`

A custom visualization plugin for [Metabase](https://www.metabase.com).

## Getting Started

### Install dependencies and start developing

```bash
npm install
npm run dev        # Watch mode — rebuilds and hot-reloads on changes
```

### Build and package for upload

```bash
npm run build      # Compiles src/ → dist/, then packages it into a .tgz
```

`npm run build` writes `<name>-<version>.tgz` to the project root. Upload that file in
**Admin → Custom visualizations → Add** to register the plugin.

> The packaged archive contains `metabase-plugin.json` plus the build output (`dist/index.js` and any whitelisted `dist/assets/*`). The `dist/` folder does not need to be committed.

### Project structure

```
src/
  index.tsx             # Your visualization code — start here
metabase-plugin.json    # Plugin manifest (name, icon, version)
public/
  assets/
    icon.svg            # Visualization icon (shown in chart type picker)
vite.config.ts          # Build configuration (do not edit)
tsconfig.json
```

---

## Development

To develop against a live Metabase instance with hot-reload:

1. Start Metabase with dev mode enabled:

   ```
   MB_CUSTOM_VIZ_PLUGIN_DEV_MODE_ENABLED=true
   ```

2. Run `npm run dev` — changes will hot-reload automatically in Metabase.

3. In Metabase, go to **Admin → Custom visualizations → Development**.

4. Set the dev server URL to `http://localhost:5174`.

---

## Plugin Manifest (`metabase-plugin.json`)

```json
{
  "name": "__CUSTOM_VIZ_NAME__",
  "icon": "icon.svg",
  "metabase": {
    "version": ">=1.60.0"
  }
}
```

| Field              | Description                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `name`             | Unique identifier for the plugin. Must match the `id` returned by your visualization factory. |
| `icon`             | Path to the visualization icon (SVG recommended). Served automatically.                      |
| `metabase.version` | Semver range of compatible Metabase versions (e.g. `">=1.60.0"`, `"^1.60"`).                  |

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

| Property                 | Type                                | Description                                                                                                                 |
| ------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | `string`                            | Unique identifier. Must match `name` in `metabase-plugin.json`.                                                             |
| `getName()`              | `() => string`                      | Display name shown in the chart type picker.                                                                                |
| `minSize`                | `{ width, height }`                 | Minimum dashboard grid size.                                                                                                |
| `defaultSize`            | `{ width, height }`                 | Default dashboard grid size.                                                                                                |
| `noHeader`               | `boolean`                           | When `true`, hides the default card title/description header.                                                               |
| `canSavePng`             | `boolean`                           | Set to `false` to disable PNG export for this visualization.                                                                |
| `checkRenderable`        | `(series, settings) => void`        | Throw here to signal the viz cannot render with the current data or settings. Metabase shows the error message to the user. |
| `settings`               | `Record<string, SettingDefinition>` | Map of setting definitions created by `defineSetting()`.                                                                    |
| `VisualizationComponent` | `React.ComponentType`               | The interactive React component for dashboard/question rendering.                                                           |

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

## Using Images

A custom visualization is a single JS bundle — it cannot load separate image files
from the Metabase instance. To use an image, **inline it into your bundle**:

- Draw it as inline `<svg>` (best for icons and simple graphics — this is what the
  generated `src/index.tsx` does), or
- Embed a raster image as a base64 `data:` URL:

```tsx
const myImage = "data:image/png;base64,iVBORw0KGgo...";

// ...
return <img src={myImage} alt="My image" />;
```

You can also reference images hosted on your own domain (`<img src="https://example.com/1.png" />`).

> **Note:** The only file served from the instance is the plugin `icon`, declared via
> `"icon"` in the manifest.

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
<path fill="var(--mb-color-core-brand)" .../>
```

Keep the icon **simple and monochromatic** — avoid gradients and multiple colors.

---

## Static Visualizations (Email / Slack)

Custom visualizations are not rendered in emails or Slack messages. In those contexts rendering falls back to a default visualization for the underlying query.
