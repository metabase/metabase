# Bundle Size Optimization Quick Reference

## Quick Commands

```bash
# Analyze current bundle
bun run analyze-bundle

# Just generate stats (no browser)
bun run analyze-bundle:json

# Build production bundle with stats
bun run build-stats

# View existing stats
npx webpack-bundle-analyzer stats.json
```

## Top Priority Actions

### 1. Before Adding New Dependencies

Always check the size impact:

```bash
# Check package size
npx bundlephobia <package-name>

# Or visit
# https://bundlephobia.com/package/<package-name>
```

**Rules**:
- Packages > 50KB require justification
- Always prefer tree-shakeable alternatives
- Check for lighter alternatives first

### 2. Import Patterns

❌ **Avoid** - Full library imports:
```javascript
import _ from "underscore";          // Imports entire library
import * as d3 from "d3";            // Imports all of d3
import { Button } from "@mantine";   // May import more than needed
```

✅ **Prefer** - Specific imports:
```javascript
import debounce from "lodash-es/debounce";  // Just debounce
import { select } from "d3-selection";       // Just selection module
import { Button } from "@mantine/core";      // Specific component
```

✅ **Best** - Native JavaScript when possible:
```javascript
// Instead of _.map
array.map(fn)

// Instead of _.filter  
array.filter(predicate)

// Instead of _.find
array.find(predicate)
```

### 3. Lazy Loading Pattern

For heavy components (charts, editors, maps):

```typescript
import { lazy, Suspense } from "react";

// Lazy load heavy component
const ChartVisualization = lazy(() => 
  import(/* webpackChunkName: "chart" */ "./ChartVisualization")
);

// Use with Suspense
function MyComponent() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <ChartVisualization data={data} />
    </Suspense>
  );
}
```

### 4. Dynamic Imports for Libraries

For heavy libraries used conditionally:

```typescript
// Load echarts only when needed
async function renderChart(element: HTMLElement, options: ChartOptions) {
  const echarts = await import("echarts");
  const chart = echarts.init(element);
  chart.setOption(options);
  return chart;
}
```

### 5. CSS Optimization

❌ **Avoid** - Importing all styles upfront:
```javascript
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css"; 
import "leaflet/dist/leaflet.css";
```

✅ **Prefer** - Import only when component is used:
```javascript
// In MapComponent.tsx
import { lazy } from "react";

const MapView = lazy(async () => {
  // Import CSS with component
  await import("leaflet/dist/leaflet.css");
  return import("./MapView");
});
```

## Common Bundle Bloat Patterns to Avoid

### Pattern 1: Barrel Exports

❌ **Avoid** creating index files that re-export everything:
```typescript
// utils/index.ts - DON'T DO THIS
export * from "./helpers";
export * from "./validators";
export * from "./formatters";
// This forces importing all utilities even if you need one
```

✅ **Prefer** direct imports:
```typescript
// Import specific file
import { formatDate } from "utils/formatters";
```

### Pattern 2: Importing Dev Dependencies

❌ **Avoid** importing dev dependencies in production code:
```javascript
import { faker } from "@faker-js/faker";  // Dev dependency!
```

✅ **Use** code splitting or remove from production:
```javascript
const mockData = 
  process.env.NODE_ENV === "development"
    ? await import("./mock-data")
    : null;
```

### Pattern 3: Large Moment.js Locales

If using moment (prefer dayjs):
```javascript
// Configure moment to load locales on demand
import moment from "moment";

// Only import needed locale
import "moment/locale/fr";
```

## Checklist for New Features

- [ ] Are heavy libraries lazy loaded?
- [ ] Using tree-shakeable imports?
- [ ] CSS imported with component, not globally?
- [ ] No dev dependencies in production code?
- [ ] Checked bundle size impact with `analyze-bundle`?
- [ ] Added to appropriate code split chunk?

## Bundle Size Targets

| Bundle | Current Target | Ideal Target |
|--------|---------------|--------------|
| Main JS | < 2MB | < 1.5MB |
| Vendor JS | < 1MB | < 800KB |
| CSS | < 300KB | < 200KB |
| Per Route | < 500KB | < 300KB |

## Tools Reference

### Bundle Analysis
```bash
# Full analysis with visualization
bun run analyze-bundle

# Check specific dependency cost
npx cost-of-modules

# Find duplicate packages
npx duplicate-package-checker-webpack-plugin

# List all dependencies with sizes
npx cost-of-modules --less
```

### Dependency Auditing
```bash
# Check for unused dependencies
npx depcheck

# Check for outdated packages
npx npm-check-updates

# Find security issues
bun audit
```

### Performance Testing
```bash
# Lighthouse CI (if configured)
npm run lighthouse

# Check bundle size impact in PR
# (Automated via CI)
```

## ESLint Rules to Enable

Add to `.eslintrc`:
```json
{
  "rules": {
    "no-restricted-imports": ["error", {
      "patterns": [{
        "group": ["underscore"],
        "message": "Use lodash-es or native JavaScript instead"
      }, {
        "group": ["**/index"],
        "message": "Import specific files, not barrel exports"
      }]
    }]
  }
}
```

## When to Split Code

### Always Split
- Chart libraries (echarts, d3, visx)
- Map libraries (leaflet)
- Code editors (CodeMirror, Monaco)
- PDF generators (jspdf)
- Image manipulation (html2canvas)

### Consider Splitting (> 50KB)
- Rich text editors (TipTap)
- Large form libraries
- Data visualization tools
- Admin-only features

### Keep in Main Bundle
- Core React/Redux
- UI component library (Mantine core)
- Router
- API client
- Common utilities

## Resources

- [Full Bundle Size Guide](./bundle-size-reduction.md)
- [Bundlephobia](https://bundlephobia.com)
- [Rspack Optimization Docs](https://rspack.dev/guide/optimization)
- [React Code Splitting](https://react.dev/reference/react/lazy)

## Getting Help

If you're unsure about bundle impact:
1. Run `bun run analyze-bundle` before and after
2. Check the size difference
3. Ask in #frontend channel if > 50KB increase
4. Document reason in PR description

---

**Remember**: Every KB counts. Users on slow connections will thank you! 🚀
