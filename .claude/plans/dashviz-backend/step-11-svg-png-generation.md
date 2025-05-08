# SVG/PNG Generation Analysis

## File Index
```
src/metabase/channel/render/
├── js/
│   ├── svg.clj        # SVG generation using JavaScript engine
│   ├── engine.clj     # GraalVM JavaScript engine interface
│   └── color.clj      # Color selection for visualization
├── png.clj            # PNG rendering from HTML
├── image_bundle.clj   # Image handling utilities
├── style.clj          # CSS styling and font registration
└── body.clj           # Main rendering logic for various visualization types
```

## Summary

The visualization rendering system in Metabase provides a way to generate static SVG and PNG representations of visualizations for use in exports, emails, and other contexts where interactive JavaScript isn't available. The system follows two main approaches:

1. **JavaScript-based SVG Generation**:
   - Uses GraalVM's JavaScript engine to run the same visualization code as the frontend
   - Renders charts to SVG format which can then be converted to PNG
   - Supports multiple chart types including funnel, gauge, row charts and more

2. **HTML-to-PNG Rendering**:
   - Renders HTML to static PNG images using CSSBox
   - Handles font registration and proper rendering of international characters
   - Used for tables and other complex layouts

This dual approach allows Metabase to leverage its existing frontend visualization library while also supporting formats like email that require static images.

## Dependencies

### Upstream Dependencies
- **GraalVM Polyglot Engine**: Used to execute JavaScript code for rendering SVG visualizations
- **Frontend Visualization Bundle**: Built with `yarn build-static-viz`, provides the charting library
- **Apache Batik**: Used for SVG processing and conversion to PNG
- **CSSBox**: Used for rendering HTML to images
- **Hiccup**: Generates HTML representations of visualizations
- **Query Processor**: Provides the data to be visualized

### Downstream Dependencies
- **Pulse/Alert System**: Uses these renderers to generate visualizations for email
- **Export System**: Provides PNG/PDF exports of dashboards and questions
- **Dashboard Subscriptions**: Sends rendered visualizations on a schedule

## Key Data Structures

1. **SVG Document** (SVGOMDocument): The core representation of SVG content that can be manipulated and converted to PNG.

2. **Image Bundle**:
   ```clojure
   {:content-id  "hash@metabase"  ; Used for email attachments
    :image-url   java.net.URL     ; URL to the image
    :image-src   "cid:hash@metabase" or "data:image/png;base64,..."  ; Reference for embedding
    :render-type :attachment or :inline  ; How the image should be rendered
   }
   ```

3. **RenderedPartCard**:
   ```clojure
   {:attachments {String -> URL}  ; Map of content IDs to image URLs
    :content     [hiccup]         ; Hiccup vector for rendering
    :render/text String           ; Optional text representation
   }
   ```

## Core Functions

### SVG Generation
- `js.svg/context`: Creates or retrieves a cached JavaScript context with the visualization bundle loaded
- `js.svg/svg-string->bytes`: Converts SVG strings to PNG byte arrays
- `js.svg/funnel`, `js.svg/gauge`, `js.svg/progress`, `js.svg/row-chart`: Specific chart renderers
- `js.svg/*javascript-visualization*`: Main function for rendering various chart types using JavaScript

### PNG Generation
- `png/render-html-to-png`: Converts HTML content to PNG images
- `png/render-to-png`: Core function that uses CSSBox to render HTML to an image
- `image-bundle/make-image-bundle`: Creates image bundles for different render types
- `body/render`: Multimethod that handles rendering for different chart types

### Core Pipeline
1. Data is processed by the query processor
2. The rendering system selects the appropriate renderer based on visualization type
3. For JavaScript visualizations:
   - JS code renders the visualization to SVG
   - SVG is processed (fix fills, clear style nodes)
   - SVG is converted to PNG
4. For HTML visualizations:
   - HTML is generated with Hiccup
   - HTML is rendered to PNG using CSSBox
5. Images are packaged as image bundles for delivery

## Configuration Points

1. **Render Settings**:
   - `*svg-render-width*` and `*svg-render-height*`: Control the dimensions of rendered SVGs
   - Custom visualization settings passed through from cards and dashcards

2. **Font Configuration**:
   - Font registration in `style/register-fonts-if-needed!`
   - Font fallback handling in `png/wrap-non-lato-chars`

3. **Color Configuration**:
   - Application colors from settings
   - Color selection based on visualization-specific rules

4. **Rendering Type**:
   - `:inline` vs `:attachment` rendering modes for different delivery mechanisms

## Enterprise Extensions
The code doesn't explicitly mention enterprise extensions, but the pattern of having `*javascript-visualization*` as a dynamic var suggests it can be extended or overridden in enterprise edition.

## Testing Approach
Tests focus on:
1. **SVG Processing**: Ensuring SVG output doesn't contain HTML elements that would break rendering
2. **Character Sanitization**: Removing invalid XML characters
3. **Attribute Transformation**: Converting unsupported attributes (like `fill="transparent"`)
4. **Image Generation**: Verifying that functions produce valid byte arrays

Tests use fixtures to ensure visualization bundles are properly built before testing.

## Error Handling

1. **Graceful Fallbacks**:
   - `error-rendered-info` and `card-error-rendered-info` provide friendly error messages when visualization fails
   - Specific error visualizations for different failure modes

2. **Error Messages**:
   - Clear error messages for missing resources
   - Detailed logs for font registration issues

3. **Exception Handling**:
   - Specific exception handling in `render-html-to-png` with logging
   - Context creation errors are caught with informative messages

4. **Resource Management**:
   - Proper use of `with-open` to ensure resources are closed even if errors occur
   - Careful handling of GraalVM context to prevent memory leaks with TTL-based caching