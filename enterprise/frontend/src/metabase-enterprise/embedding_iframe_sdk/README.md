# Embedding iframe SDK

This enterprise plugin exposes React SDK components as a route that will be used by customers as an iframe. Customers can consume it by embedding the "embed.js" script in their websites without having to use React.

## Testing Strategy

### Overview

- End-to-end tests using Cypress
- Tests will use actual `embed.js` script for iframe creation
- Located in `e2e/test/scenarios/embedding/sdk-iframe-embedding/`
- Uses test helpers in "H." format

### Key Testing Patterns

#### Dynamic Test Pages with cy.intercept

Instead of creating temporary files for iframe testing, we use `cy.intercept()` to dynamically serve test pages. This approach offers several benefits:

- No file system operations needed during tests
- Clean test environment without temporary files
- Consistent behavior across different test environments
- Easy to parameterize test HTML content

Example:

```typescript
function loadSdkEmbedIframeTestPage(options) {
  const testPage = getIframeTestPageHtml(options);

  cy.intercept("GET", "/sdk-iframe-test-page", {
    body: testPage,
    headers: { "content-type": "text/html" },
  }).as("dynamicPage");

  cy.visit("/sdk-iframe-test-page");
}
```

### Test Cases

1. **iframe Creation and Authentication**
   - Test with both dashboard and question embedding
   - Test both numeric IDs and entity IDs
   - Uses API key for authentication temporarily until the new JWT/SSO/SAML implementation is ready on the SDK side. This is insecure, but this is only used for testing purposes until SSO is available.

Example snippet for new iframe embedding:

```html
<script src="http://localhost:3000/app/embed.js"></script>

<div id="metabase-embed-container"></div>

<script>
  const { MetabaseEmbed } = window["metabase.embed"];

  const embed = new MetabaseEmbed({
    target: "#metabase-embed-container",
    url: "http://localhost:3000",
    dashboardId: 1,
    apiKey: "(metabase-api-key)",
    theme: {
      colors: {
        background: "#2d2d3d",
        "text-primary": "#fff",
        "text-secondary": "#b3b3b3",
        "text-tertiary": "#8a8a8a",
        brand: "#ff9900",
      },
    },
  });
</script>
```

2. **Theme Switching**
   - Test updating settings to switch between light and dark themes

Example:

```javascript
// change between like and dark mode by passing the theme object
function switchTheme() {
  embed.updateSettings({ theme });
}
```

### Implementation Notes

- Uses actual `embed.js` script instead of mocking postMessage communication
- Relies on test API key for authentication
- Tests run in Cypress for end-to-end verification
- Uses `cy.intercept` for dynamic test page creation instead of temp files
- Mocks enterprise features using premium features endpoint for testing

### TODO - Test Cases

1. **Entity ID Support**

   - Add tests for entity ID support in embedding
   - Currently using numeric IDs for testing
   - Need to implement entity ID tests similar to dashboard/collection entity ID tests

2. **Resource State Tests**

   - Add tests for embedding when resources are:
     - Archived
     - Moved to different collections
     - Have embedding permissions revoked

3. **Browser Support**

   - Add tests for browser-specific iframe behavior
   - Test iframe sandbox settings
   - Test cross-browser compatibility issues

4. **Theme Testing**
   - Expand theme testing to include:
     - Text colors
     - Brand colors
     - Font settings
     - Custom themes
