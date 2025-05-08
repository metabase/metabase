# Card Rendering System Analysis

## File Index
```
src/metabase/channel/render/
├── card.clj               # Main card rendering component
├── body.clj               # Core rendering logic for different chart types
├── png.clj                # PNG image rendering capabilities
├── image_bundle.clj       # Image handling for attachments and inline images
├── table.clj              # Table visualization rendering
├── style.clj              # CSS styling for rendered components
└── js/
    ├── svg.clj            # SVG-based visualization rendering
    ├── color.clj          # Color handling for visualizations
    └── engine.clj         # JavaScript execution engine for visualization
```

## Summary

The Card Rendering System is responsible for transforming Metabase card data (queries/visualizations) into renderable formats for distribution through various channels like email, Slack, or downloads. The system handles multiple visualization types (tables, charts, scalar values) and output formats (HTML, PNG images).

The architecture follows a modular approach:
1. `card.clj` serves as the entry point, coordinating the rendering process
2. `body.clj` uses a multimethod pattern to support different visualization types
3. Specialized renderers handle specific visualization types
4. A JavaScript bridge (via GraalVM) enables advanced visualizations like charts and graphs
5. Rendering can be performed as inline content or as attachments with appropriate references

The system ensures consistent rendering across different delivery channels while optimizing for readability and compatibility with email clients and messaging platforms.

## Dependencies

### Upstream Dependencies
- **Query Processor**: Provides the data to be visualized
- **Card/Dashboard Models**: Supply metadata and visualization settings
- **Database Connections**: Source of underlying data
- **Timezone Settings**: Used for proper date/time formatting

### Downstream Dependencies
- **Pulse/Alert System**: Uses rendered cards for notifications
- **Download Export Functionality**: Utilizes rendering for exports
- **Email/Slack Delivery**: Consumes rendered content for delivery
- **Dashboard Subscription System**: Distributes rendered content on schedules

## Key Data Structures

1. **RenderedPartCard** (defined in `body.clj`):
   ```clojure
   [:map
    [:attachments                  [:maybe [:map-of :string (ms/InstanceOfClass URL)]]]
    [:content                      [:sequential :any]]
    [:render/text {:optional true} [:maybe :string]]]
   ```
   This is the core output structure containing:
   - `attachments`: Map of content-IDs to image URLs
   - `content`: Hiccup HTML structure for rendering
   - `render/text`: Optional plain text alternative for text-only clients

2. **Render Options** (defined in `card.clj`):
   ```clojure
   [:map
    [:channel.render/include-buttons?     {:description "default: false", :optional true} :boolean]
    [:channel.render/include-title?       {:description "default: false", :optional true} :boolean]
    [:channel.render/include-description? {:description "default: false", :optional true} :boolean]]
   ```

3. **Image Bundle**:
   Structure that contains image data in either inline or attachment format:
   - `content-id`: Identifier for referencing the image
   - `image-url`: URL to the image resource
   - `image-src`: Either a data URI or a CID reference
   - `render-type`: Either `:inline` or `:attachment`

## Core Functions

1. **render-pulse-card** (`card.clj`, L148-163)
   - Entry point for rendering a card
   - Handles title, description, and body rendering
   - Returns a complete `RenderedPartCard` structure

2. **detect-pulse-chart-type** (`card.clj`, L70-118)
   - Analyzes card metadata and query results to determine the appropriate visualization type
   - Maps Metabase visualization types to rendering-specific types

3. **render** (`body.clj`, L187-191)
   - Multimethod for rendering different visualization types
   - Dispatches based on the chart type (scalar, table, gauge, etc.)

4. **render-html-to-png** (`png.clj`, L124-142)
   - Converts Hiccup HTML to PNG images
   - Uses the CSSBox library for rendering HTML to images

5. **make-image-bundle** (`image_bundle.clj`, L46-52)
   - Creates appropriate image bundles for inline or attachment rendering
   - Handles the different requirements of each render type

6. **render-table** (`table.clj`, L288-324)
   - Specialized renderer for tabular data
   - Handles column formatting, styling, and layout

7. **\*javascript-visualization\*** (`js/svg.clj`, L160-173)
   - Bridge to JavaScript rendering for advanced visualizations
   - Uses GraalVM to execute JavaScript rendering code

## Configuration Points

1. **Visualization Settings**:
   - Passed from the card/dashboard to control rendering
   - Includes column formatting, colors, and display options

2. **Render Type**:
   - `:inline` for embedding content directly
   - `:attachment` for referencing external attachments

3. **Style Customization**:
   - Primary and secondary colors (from application settings)
   - Font settings and sizes
   - Table formatting options

4. **Timezone Handling**:
   - `defaulted-timezone` function to determine appropriate timezone
   - Used for proper date/time formatting in rendered content

5. **Javascript Engine Configuration**:
   - Context configuration for GraalVM JavaScript execution
   - Resource loading for visualization libraries

## Enterprise Extensions

While not explicitly documented in the core files, the rendering system appears designed for extension points, particularly:

1. **Custom Visualization Types**:
   - The `render` multimethod in `body.clj` can be extended with additional methods
   - Enterprise may add specialized visualization renderers

2. **Branding Customization**:
   - `primary-color` and `secondary-color` functions in `style.clj` allow for custom branding
   - Comment on L63-64 mentions explicit enterprise customization

3. **Additional Export Formats**:
   - The architecture allows for new render types beyond the existing ones

## Testing Approach

The codebase shows several testing approaches:

1. **Unit Testing**:
   - Tests for individual rendering functions
   - Mocked data structures for predictable rendering

2. **Visual Testing**:
   - Comment in `svg.clj` indicates special handling for tests
   - References to ensuring fonts are properly loaded for visual testing

3. **Delayed Initialization**:
   - JavaScript resources are conditionally loaded during testing
   - `assert-tests-are-not-initializing` in `svg.clj` prevents side effects during test initialization

4. **Error Handling Tests**:
   - Testing for proper error handling when cards have errors
   - Fallback rendering for invalid visualizations

## Error Handling

The code includes several layers of error handling:

1. **Card Query Errors** (`card.clj`, L130-146):
   - Explicit try/catch for card query errors
   - Renders a "Card has errors" message
   - Logs the specific error for debugging

2. **Rendering Errors**:
   - Fallback to error card when rendering fails
   - Default error message defined in `body.clj`

3. **Font Loading Errors** (`style.clj`, L110-120):
   - Catches and logs font registration failures
   - Provides detailed error message and reference to known issues

4. **JavaScript Engine Errors**:
   - Locking mechanism to prevent concurrent execution issues
   - Context validation before execution

5. **SVG Sanitization** (`js/svg.clj`, L104-115):
   - Sanitizes SVG strings to ensure they're valid XML
   - Removes characters that would break rendering

## Additional Insights

1. **Performance Considerations**:
   - JavaScript engine contexts are cached with a 10-minute TTL to balance memory usage and performance
   - Specific optimizations for image rendering quality vs. size

2. **Internationalization Support**:
   - Non-Latin character handling in `png.clj`
   - Font fallback mechanism for characters not supported by Lato

3. **Email Client Compatibility**:
   - Table rendering specifically addresses email client quirks
   - Comments reference email client compatibility concerns

4. **Memory Management**:
   - Careful resource handling with `with-open` for image processing
   - Thread-local caching for JavaScript engines to prevent memory leaks