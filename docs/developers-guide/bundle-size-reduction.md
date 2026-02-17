# Frontend Bundle Size Reduction Recommendations

## Executive Summary

This document provides a comprehensive analysis of the Metabase frontend bundle and actionable recommendations to reduce bundle size. The analysis covers dependency optimization, code splitting, import patterns, and build configuration improvements.

## Current State

### Build Configuration
- **Bundler**: Rspack (migrated from Webpack 5)
- **Entry Points**: 4 main bundles (app-main, app-public, app-embed, app-embed-sdk)
- **Code Splitting**: Limited to 4 large libraries (sql-formatter, jspdf, html2canvas)
- **Optimization**: SWC-based minification, runtime chunk separation

### Technology Stack
- React 18.2.0
- Redux Toolkit 2.5.0
- TypeScript 5.9.2
- Mantine UI 8.3.5
- 180+ production dependencies

## High-Impact Recommendations

### 1. Replace Underscore.js with Tree-Shakeable Alternatives

**Current Issue**: Underscore is imported as a full module in 280+ files
```javascript
import _ from "underscore";  // Imports entire library (~40KB)
```

**Impact**: High - Underscore is one of the most widely used dependencies
**Effort**: Medium - Requires codebase-wide refactoring

**Recommended Actions**:

a) **Option 1: Migrate to lodash-es** (tree-shakeable)
```javascript
// Before
import _ from "underscore";
const value = _.map(items, fn);

// After
import { map } from "lodash-es";
const value = map(items, fn);
```

b) **Option 2: Use native JavaScript methods** (preferred where possible)
```javascript
// Before
import _ from "underscore";
const filtered = _.filter(items, predicate);

// After
const filtered = items.filter(predicate);
```

c) **Implementation Strategy**:
- Run codemod to identify all underscore usage patterns
- Prioritize native JS replacements for common operations (map, filter, find, etc.)
- Use lodash-es for complex utilities that don't have native equivalents
- Use ESLint rule to prevent new underscore imports

**Expected Savings**: 30-50KB (gzipped)

### 2. Implement Lazy Loading for Heavy Libraries

**Current Issue**: Large visualization and utility libraries loaded upfront

**Libraries to Lazy Load**:

| Library | Size (approx) | Usage Pattern | Recommendation |
|---------|---------------|---------------|----------------|
| echarts | ~300KB | Used in chart visualizations | Dynamic import when rendering charts |
| d3 | ~200KB | Used in specific visualizations | Dynamic import per visualization type |
| @visx/* | ~150KB | Used in advanced charts | Dynamic import in chart components |
| leaflet + plugins | ~150KB | Used in map visualizations | Dynamic import in Map component |
| CodeMirror packages | ~400KB | Used in SQL/code editors | Dynamic import in editor components |
| TipTap extensions | ~100KB | Used in rich text editor | Dynamic import in text editor |
| react-virtualized | ~80KB | Used in large tables | Dynamic import in table components |

**Implementation Example**:
```javascript
// Before - in top-level imports
import * as echarts from "echarts";

// After - lazy loaded
const Chart = () => {
  const [ECharts, setECharts] = useState(null);
  
  useEffect(() => {
    import("echarts").then((module) => {
      setECharts(module);
    });
  }, []);
  
  // Render when loaded
};
```

**Expected Savings**: 500KB+ (gzipped)

### 3. Optimize CSS Loading Strategy

**Current Issue**: All CSS loaded upfront, even for unused features

**Recommendations**:

a) **Extract CSS to route-based chunks**:
```javascript
// Load only when map component is rendered
const MapView = lazy(() => import(
  /* webpackChunkName: "map-view" */
  "./MapView"
));
```

b) **Use CSS-in-JS dynamic imports for Mantine**:
```javascript
// Instead of importing all Mantine styles
import "@mantine/core/styles.css";

// Import only used components' styles
import { Button } from "@mantine/core";
// Mantine automatically includes only Button styles
```

c) **Defer non-critical CSS**:
- Move grid layout, resizable, and leaflet CSS to respective components
- Use `rel="preload"` for critical CSS only

**Expected Savings**: 50-100KB (gzipped)

### 4. Reduce CodeMirror Bundle Size

**Current Issue**: 11+ CodeMirror packages loaded, many unused in most views

**Recommendations**:

a) **Create lightweight SQL editor wrapper**:
```javascript
const CodeEditor = lazy(() => 
  import(/* webpackChunkName: "code-editor" */ "./CodeEditor")
);
```

b) **Load language modes on demand**:
```javascript
// Only load SQL mode when needed
const sqlMode = await import("@codemirror/lang-sql");
```

c) **Extract to separate chunk in rspack.config**:
```javascript
cacheGroups: {
  codemirror: {
    test: /[\\/]node_modules[\\/]@codemirror[\\/]/,
    chunks: "async",
    name: "codemirror",
    priority: 10,
  },
}
```

**Expected Savings**: 200-300KB (gzipped)

### 5. Optimize Date/Time Utilities

**Current Issue**: Multiple date libraries and duplicate utilities

**Consolidation Plan**:
- Standardize on `dayjs` (already in use)
- Consolidate `lib/date-time.ts` and `lib/time-dayjs.ts`
- Remove duplicate formatting functions
- Use dayjs plugins only when needed (lazy load)

**Expected Savings**: 10-20KB (gzipped)

### 6. Implement More Granular Code Splitting

**Current Code Splitting**: Only 4 libraries split (sql-formatter, jspdf, html2canvas)

**Recommended Additional Splits**:

```javascript
optimization: {
  splitChunks: {
    cacheGroups: {
      // Existing splits...
      
      // New splits:
      echarts: {
        test: /[\\/]node_modules[\\/]echarts[\\/]/,
        chunks: "async",
        name: "echarts",
        priority: 20,
      },
      d3: {
        test: /[\\/]node_modules[\\/]d3[\\/]/,
        chunks: "async",
        name: "d3",
        priority: 20,
      },
      codemirror: {
        test: /[\\/]node_modules[\\/]@codemirror[\\/]/,
        chunks: "async",
        name: "codemirror",
        priority: 20,
      },
      leaflet: {
        test: /[\\/]node_modules[\\/]leaflet[\\/]/,
        chunks: "async",
        name: "leaflet",
        priority: 20,
      },
      tiptap: {
        test: /[\\/]node_modules[\\/]@tiptap[\\/]/,
        chunks: "async",
        name: "tiptap",
        priority: 20,
      },
      mantine: {
        test: /[\\/]node_modules[\\/]@mantine[\\/]/,
        chunks: "all",
        name: "mantine",
        priority: 15,
      },
      redux: {
        test: /[\\/]node_modules[\\/](redux|react-redux|@reduxjs)[\\/]/,
        chunks: "all",
        name: "redux",
        priority: 15,
      },
    },
  },
}
```

**Expected Savings**: Improved caching, 100-200KB effective reduction

### 7. Enable Tree Shaking for All Dependencies

**Add to package.json**:
```json
{
  "sideEffects": [
    "*.css",
    "*.scss",
    "*.sass"
  ]
}
```

**Ensure all dependencies support tree shaking**:
- Audit dependencies for ESM builds
- Use ESM imports where available
- Configure package.json module field

**Expected Savings**: 50-100KB (gzipped)

### 8. Reduce Redux Bundle Size

**Current Issue**: Full Redux Toolkit imported in many places

**Recommendations**:

a) **Import only used Redux functions**:
```javascript
// Before
import { createSlice, createAsyncThunk, ... } from "@reduxjs/toolkit";

// After - import only what's needed
import { createSlice } from "@reduxjs/toolkit";
```

b) **Avoid barrel exports in redux utilities**:
- Current `lib/redux/index.ts` re-exports everything
- Import directly from specific files

**Expected Savings**: 20-40KB (gzipped)

### 9. Optimize Polyfills and Shims

**Current Issue**: Some polyfills may be unnecessary for modern browsers

**Recommendations**:
- Review browserslist configuration (currently just "defaults")
- Remove unnecessary polyfills for modern browsers
- Use dynamic polyfill loading for older browsers
- Audit buffer, events, process, stream-browserify usage

**Update browserslist**:
```json
{
  "browserslist": [
    "last 2 Chrome versions",
    "last 2 Firefox versions",
    "last 2 Safari versions",
    "last 2 Edge versions"
  ]
}
```

**Expected Savings**: 30-50KB (gzipped)

### 10. Implement Route-Based Code Splitting

**Current Issue**: All routes loaded in main bundle

**Recommended Structure**:
```javascript
// In router configuration
const QueryBuilder = lazy(() => import("./query-builder"));
const Dashboard = lazy(() => import("./dashboard"));
const Admin = lazy(() => import("./admin"));
const Collection = lazy(() => import("./collection"));

// Wrap in Suspense
<Suspense fallback={<LoadingSpinner />}>
  <Routes>
    <Route path="/question/*" element={<QueryBuilder />} />
    <Route path="/dashboard/*" element={<Dashboard />} />
    <Route path="/admin/*" element={<Admin />} />
  </Routes>
</Suspense>
```

**Expected Savings**: 500KB+ (gzipped) - largest impact

## Medium-Impact Recommendations

### 11. Optimize Icon Loading

**Current Pattern**: Check how icons are loaded
- If all icons loaded upfront, switch to dynamic loading
- Use SVG sprites for frequently used icons
- Lazy load icon sets

**Expected Savings**: 20-50KB (gzipped)

### 12. Remove Duplicate Dependencies

**Audit for duplicates**:
```bash
npx depcheck
npx npm-check-updates
```

**Common duplicates to check**:
- Multiple date libraries (if any beyond dayjs)
- Multiple state management libraries
- Duplicate UI component libraries

**Expected Savings**: 10-30KB (gzipped)

### 13. Optimize Image Assets

**Recommendations**:
- Use WebP format with fallbacks
- Implement responsive images
- Lazy load images below the fold
- Compress images during build

**Expected Savings**: Varies based on assets

### 14. Implement Preloading Strategy

**Use resource hints**:
```html
<link rel="preload" href="vendor.js" as="script">
<link rel="prefetch" href="admin-bundle.js" as="script">
```

**Expected Improvement**: Better perceived performance

### 15. Enable Compression

**Ensure server configuration**:
- Brotli compression (better than gzip)
- Proper cache headers
- CDN optimization

**Expected Savings**: 60-70% size reduction (already standard)

## Low-Impact / Long-Term Recommendations

### 16. Consider Alternative UI Library

**Analysis**: Mantine v8 is comprehensive but large
- Evaluate using only needed Mantine components
- Consider lighter alternatives for simple components
- Custom build Mantine with only used components

### 17. Reduce Visualization Library Count

**Current**: echarts, d3, visx all used
- Standardize on one primary library
- Remove or reduce usage of others
- Long-term refactor to single solution

### 18. Optimize TypeScript Compilation

**Ensure**:
- `"importHelpers": true` in tsconfig.json
- Use tslib for helper reuse

### 19. Implement Performance Budgets

**Add to CI/CD**:
```javascript
// In rspack config
performance: {
  maxEntrypointSize: 512000, // 500KB
  maxAssetSize: 512000,
  hints: 'error'
}
```

### 20. Regular Bundle Analysis

**Establish process**:
- Run bundle analyzer monthly
- Set up size tracking in CI
- Alert on size increases

## Implementation Priority

### Phase 1 (Immediate - High Impact)
1. Implement route-based code splitting
2. Lazy load heavy libraries (echarts, d3, leaflet, CodeMirror)
3. Replace underscore with tree-shakeable alternatives
4. Add bundle analyzer to build process

**Expected Total Savings**: 1-2MB (gzipped: 300-600KB)

### Phase 2 (Short-term - Medium Impact)
5. Optimize CSS loading
6. Improve code splitting configuration
7. Enable comprehensive tree shaking
8. Optimize Redux imports
9. Update browserslist and remove unnecessary polyfills

**Expected Total Savings**: Additional 200-400KB (gzipped: 70-150KB)

### Phase 3 (Long-term - Maintenance)
10. Route-based icon loading
11. Remove duplicate dependencies
12. Implement performance budgets
13. Regular bundle analysis
14. Consolidate date/time utilities

**Expected Total Savings**: Additional 100-200KB (gzipped: 30-70KB)

## Measurement Strategy

### Before Starting
1. Run bundle analyzer and document current sizes
2. Measure Lighthouse scores
3. Document page load metrics

### Tools to Use
```bash
# Generate bundle stats
bun run build-stats

# Analyze bundle
npx webpack-bundle-analyzer stats.json

# Check for duplicate dependencies
npx depcheck
```

### Success Metrics
- **Target**: Reduce main bundle by 30-40%
- **Target**: Initial page load under 2s on 3G
- **Target**: Lighthouse performance score > 90

## Next Steps

1. **Run bundle analyzer** to get current baseline
2. **Identify quick wins** from Phase 1
3. **Create focused PRs** for each optimization
4. **Measure impact** of each change
5. **Document findings** and update this guide

## Resources

- [Rspack Optimization Guide](https://rspack.dev/guide/optimization)
- [React Code Splitting](https://react.dev/reference/react/lazy)
- [Web.dev Bundle Size Guide](https://web.dev/reduce-javascript-payloads-with-code-splitting/)
- [Bundle Analyzer](https://www.npmjs.com/package/webpack-bundle-analyzer)

## Appendix: Bundle Analysis Commands

```bash
# Build with stats
bun run build-stats

# Analyze main bundle
npx webpack-bundle-analyzer stats.json

# Check dependency sizes
npx cost-of-modules

# Find duplicate packages
npx duplicate-package-checker-webpack-plugin

# Analyze what's in node_modules
npx npkill  # Clean unused packages
```

## Conclusion

Implementing these recommendations in phases can significantly reduce the Metabase frontend bundle size. The most impactful changes are:

1. Route-based code splitting
2. Lazy loading heavy libraries
3. Replacing underscore.js
4. Optimizing CSS loading

Starting with Phase 1 recommendations should yield immediate and measurable improvements in bundle size and application performance.
