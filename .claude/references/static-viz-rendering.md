# Static Visualization Rendering in Metabase

This document provides an overview of Metabase's static visualization rendering system, which enables chart generation for email subscriptions, exports, and other non-interactive contexts.

## File Structure

```
src/metabase/channel/render/
├── core.clj                   # Main entry point for rendering
├── body.clj                   # Core multimethod for rendering different chart types
├── card.clj                   # Card/visualization rendering functions
├── png.clj                    # HTML to PNG conversion
├── table.clj                  # Table rendering
├── style.clj                  # Styling utilities
├── image_bundle.clj           # Image attachments and bundling
├── util.clj                   # Utility functions
├── preview.clj                # Dashboard preview rendering
└── js/
    ├── engine.clj             # GraalVM JavaScript engine setup
    ├── svg.clj                # SVG generation via JavaScript
    └── color.clj              # Color utilities

resources/frontend_shared/
└── static_viz_interface.js    # JavaScript interface exposed to Clojure

frontend/src/metabase/static-viz/
├── index.js                   # Main entry point for frontend static viz
├── register.js                # Visualization registration
├── lib/
│   ├── svg.ts                 # SVG utilities and sanitization
│   └── rendering-context.ts   # Context creation for viz rendering
└── components/                # React components for different visualization types
    ├── StaticVisualization/
    │   └── StaticVisualization.tsx  # Component that routes to specific viz types
    ├── ComboChart/            # Handles line, bar, area charts
    ├── ScatterPlot/           # Scatter visualization
    ├── PieChart/              # Pie/donut visualization 
    ├── FunnelBarChart/        # Funnel visualization
    ├── WaterfallChart/        # Waterfall visualization
    ├── SankeyChart/           # Sankey visualization
    ├── ScalarChart/           # Single value visualization
    └── SmartScalar/           # Smart scalar with comparisons
```

## Key Files and Functions

### Clojure Backend

#### `src/metabase/channel/render/core.clj`
- Primary namespace that imports and re-exports key rendering functions
- Uses `potemkin/import-vars` to expose functions from other modules

#### `src/metabase/channel/render/body.clj`
- Defines the `render` multimethod that handles different visualization types
- Methods for `render :table`, `render :scalar`, `render :progress`, `render :gauge`, etc.
- Contains formatting functions for data cells and header rows

#### `src/metabase/channel/render/card.clj`
- `render-pulse-card`: Primary function for rendering a card for a Pulse
- `render-pulse-card-to-png`: Converts a card to PNG format
- `detect-pulse-chart-type`: Determines the visualization type of a card

#### `src/metabase/channel/render/png.clj`
- `render-html-to-png`: Converts HTML content to PNG using CSSBox
- Handles font rendering and image cropping

#### `src/metabase/channel/render/js/svg.clj`
- `*javascript-visualization*`: Core function to render JavaScript visualizations
- `svg-string->bytes`: Converts SVG string to PNG bytes
- Functions for specific chart types: `funnel`, `gauge`, `progress`, `row-chart`, etc.
- `render-svg`: Renders SVG document to PNG using Batik

#### `src/metabase/channel/render/js/engine.clj`
- `context`: Creates GraalVM JavaScript context for executing JS code
- `load-resource`: Loads JavaScript resources into the context
- `execute-fn-name`: Executes named JavaScript functions with arguments

### JavaScript Interface

#### `resources/frontend_shared/static_viz_interface.js`
- Acts as a bridge between Clojure and JavaScript
- Exposes functions like `javascript_visualization`, `funnel`, `gauge`, `progress`, etc.
- Responsible for determining if output is SVG or HTML based on content

### Frontend Components

#### `frontend/src/metabase/static-viz/index.js`
- `RenderChart`: Main function for rendering static visualizations
- Sets up environment (colors, formatting) and creates rendering context
- Processes data and invokes ReactDOMServer.renderToStaticMarkup

#### `frontend/src/metabase/static-viz/components/StaticVisualization/StaticVisualization.tsx`
- Router component that selects the appropriate visualization based on display type
- Transforms the series data and computes settings for the visualization

#### `frontend/src/metabase/static-viz/components/ComboChart/ComboChart.tsx`
- Renders line, bar, area, and combo charts using ECharts
- Initializes ECharts with SVG renderer
- Processes chart SVG for compatibility with Batik

#### `frontend/src/metabase/static-viz/lib/svg.ts`
- `sanitizeSvgForBatik`: Prepares SVG for rendering with Apache Batik
- `patchDominantBaseline`: Fixes vertical alignment issues in text elements

## Technologies and Libraries

### Apache Batik
- Java-based toolkit for SVG processing
- Used to convert SVG to PNG on the backend
- Requires specific SVG sanitization for compatibility

### GraalVM JavaScript Engine
- Allows executing JavaScript from JVM
- Used to bridge Clojure backend with JavaScript visualization code
- Isolates JavaScript execution for security

### ECharts
- JavaScript visualization library used for most chart types
- Configured with SVG renderer for static visualization
- Provides robust charting capabilities with extensive configuration options

### ReactDOMServer
- React library component for server-side rendering
- `renderToStaticMarkup`: Converts React components to static HTML/SVG strings
- Generates clean markup without React-specific attributes

### CSSBox
- HTML rendering engine used in `png.clj`
- Renders HTML to image format with proper layout

## Rendering Flow

1. **Clojure Entry Point**
   - `render-pulse-card` or similar function is called
   - `render` multimethod dispatches based on chart type
   - For JavaScript visualizations, calls into `js.svg/*javascript-visualization*`

2. **JavaScript Bridge**
   - GraalVM executes JavaScript code via `js.engine/execute-fn-name`
   - The appropriate function in `static_viz_interface.js` is called
   - This calls into `StaticViz.RenderChart` in the frontend bundle

3. **React Component Rendering**
   - `StaticVisualization` component selects the appropriate chart component
   - Chart-specific component (e.g., `ComboChart`) renders using React
   - ECharts generates the SVG content when applicable
   - `ReactDOMServer.renderToStaticMarkup` converts to a string

4. **SVG Processing**
   - SVG is sanitized with `sanitizeSvgForBatik` on the frontend
   - Returned to Clojure as a string
   - Further processed with `fix-fill`, `clear-style-node`, etc.
   - Converted to PNG using Batik when needed

5. **Final Output**
   - PNG bytes are returned for attachment in emails
   - HTML content may be included directly in email bodies