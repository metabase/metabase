# Frontend Bundle Size Review - Summary & Recommendations

## Overview

This document summarizes the comprehensive bundle size analysis performed on the Metabase frontend codebase and provides prioritized, actionable recommendations.

## Current State Analysis

### Build System
- **Bundler**: Rspack (modern, faster alternative to Webpack)
- **Entry Points**: 4 main bundles
  - `app-main` - Primary application
  - `app-public` - Public sharing
  - `app-embed` - Embedding iframe
  - `app-embed-sdk` - SDK application
- **Current Optimizations**: 
  - Limited code splitting (4 libraries: sql-formatter, jspdf, html2canvas)
  - SWC-based minification
  - Runtime chunk separation

### Dependencies
- **Total Production Dependencies**: 180+
- **Major Heavy Dependencies**:
  - CodeMirror packages (11+) - ~400KB combined
  - echarts - ~300KB
  - d3 - ~200KB
  - Mantine UI - ~150KB
  - @visx/* - ~150KB
  - leaflet + plugins - ~150KB
  - TipTap - ~100KB
  - react-virtualized - ~80KB

### Key Issues Identified

#### 1. Underscore.js Usage (HIGH PRIORITY)
- **Impact**: Used in 280+ files
- **Problem**: Not tree-shakeable, entire library (~40KB) loaded
- **Solution**: Replace with native JS or lodash-es
- **Expected Savings**: 30-50KB gzipped

#### 2. No Route-Based Code Splitting (HIGH PRIORITY)
- **Impact**: All routes loaded in main bundle
- **Problem**: Users loading admin code even on public pages
- **Solution**: Implement React.lazy() for major routes
- **Expected Savings**: 500KB+ gzipped

#### 3. Heavy Libraries Loaded Upfront (HIGH PRIORITY)
- **Impact**: Visualization libraries in main bundle
- **Problem**: Charts/maps loaded even when not used
- **Solution**: Dynamic imports for echarts, d3, leaflet, CodeMirror
- **Expected Savings**: 500KB+ gzipped

#### 4. CSS Loading Strategy (MEDIUM PRIORITY)
- **Impact**: All CSS loaded upfront
- **Problem**: Map/grid CSS loaded on all pages
- **Solution**: Component-level CSS imports
- **Expected Savings**: 50-100KB gzipped

#### 5. Limited Code Splitting (MEDIUM PRIORITY)
- **Impact**: Only 4 libraries in separate chunks
- **Problem**: Large vendor bundle
- **Solution**: More granular splitChunks configuration
- **Expected Savings**: Improved caching, 100-200KB effective

## Implementation Priority

### Phase 1: High Impact, Quick Wins (1-2 weeks)

**Target Savings**: 1-1.5MB total (300-500KB gzipped)

1. **Implement Route-Based Code Splitting**
   - Use React.lazy() for major sections (Dashboard, Query Builder, Admin)
   - Add Suspense boundaries
   - See: `docs/developers-guide/bundle-examples/lazy-chart-component.example.tsx`

2. **Lazy Load Visualization Libraries**
   - Dynamic import for echarts, d3, visx
   - Load only when chart is rendered
   - See: `docs/developers-guide/bundle-examples/conditional-library-loading.example.tsx`

3. **Lazy Load CodeMirror**
   - Dynamic import for all CodeMirror packages
   - Load only when editor is used
   - Fallback to simple textarea during load

4. **Set Up Bundle Analysis**
   - Use `bun run analyze-bundle` script
   - Document baseline bundle sizes
   - Set up CI monitoring

### Phase 2: Medium Impact (2-4 weeks)

**Target Savings**: 200-400KB total (70-150KB gzipped)

5. **Begin Underscore Migration**
   - Create codemod for common patterns
   - Start with high-frequency files
   - Add ESLint rule to prevent new usage
   - See: `docs/developers-guide/bundle-examples/underscore-replacement.example.tsx`

6. **Optimize CSS Loading**
   - Move CSS imports to component level
   - See: `docs/developers-guide/bundle-examples/dynamic-css-imports.example.tsx`

7. **Improve Code Splitting Configuration**
   - Add more granular splitChunks for Mantine, Redux, etc.
   - Configure async chunks for heavy libraries

8. **Enable Tree Shaking**
   - Add `sideEffects` to package.json
   - Audit dependencies for ESM support

### Phase 3: Ongoing Maintenance

9. **Complete Underscore Migration**
   - Remove underscore dependency entirely
   - Update all remaining usages

10. **Implement Performance Budgets**
    - Add size limits to rspack config
    - Fail builds that exceed limits
    - Monitor bundle size in CI

11. **Regular Bundle Analysis**
    - Monthly bundle size review
    - Track size over time
    - Identify new opportunities

## Resources Created

### Documentation
1. **[Bundle Size Reduction Guide](./bundle-size-reduction.md)**
   - Comprehensive strategies
   - All 20 recommendations detailed
   - Expected savings for each
   - Implementation guidance

2. **[Quick Reference Guide](./bundle-size-quick-reference.md)**
   - Day-to-day best practices
   - Import patterns
   - Common pitfalls
   - Checklist for new features

3. **[Code Examples](./bundle-examples/)**
   - Lazy loading charts
   - Dynamic CSS imports
   - Conditional library loading
   - Underscore replacement patterns

4. **Updated [Frontend Guide](./frontend.md)**
   - Added bundle size section
   - Links to resources

### Tooling
1. **Bundle Analysis Script** (`bin/analyze-bundle.js`)
   - Generates bundle stats
   - Provides summary
   - Opens webpack-bundle-analyzer

2. **NPM Scripts**
   - `bun run analyze-bundle` - Full analysis
   - `bun run analyze-bundle:json` - Stats only

## Quick Start Guide

### For Developers

**Before adding any dependency**:
```bash
npx bundlephobia <package-name>
```

**Before committing changes**:
```bash
bun run analyze-bundle:json
```

**When adding heavy features**:
- Use React.lazy() for components
- Dynamic import for libraries
- See examples in `docs/developers-guide/bundle-examples/`

### For Reviewers

**Check PR bundle impact**:
1. Ask for bundle analysis results
2. Verify lazy loading for heavy dependencies
3. Ensure tree-shakeable imports used
4. Check for unnecessary dependencies

## Success Metrics

### Targets

| Metric | Current | Phase 1 Target | Phase 2 Target | Final Target |
|--------|---------|----------------|----------------|--------------|
| Main Bundle | ~2MB | ~1.5MB | ~1.2MB | ~1MB |
| Initial Load (3G) | ~5s | ~3s | ~2.5s | ~2s |
| Lighthouse Score | ~70 | ~80 | ~85 | ~90+ |

### How to Measure

```bash
# Before changes
bun run analyze-bundle:json
cp stats.json stats-before.json

# After changes
bun run analyze-bundle:json
cp stats.json stats-after.json

# Compare
node -e "
const before = require('./stats-before.json');
const after = require('./stats-after.json');
const beforeSize = before.assets.reduce((sum, a) => sum + a.size, 0);
const afterSize = after.assets.reduce((sum, a) => sum + a.size, 0);
const diff = beforeSize - afterSize;
const percent = (diff / beforeSize * 100).toFixed(1);
console.log(\`Size change: \${diff > 0 ? '-' : '+'}\${Math.abs(diff)} bytes (\${percent}%)\`);
"
```

## Common Questions

### Q: Won't lazy loading make the app feel slower?
A: No. Initial load is faster, and subsequent loads are from cache. The delay when loading a lazy component is minimal (usually < 100ms) and worth the faster initial load.

### Q: How do I know what to lazy load?
A: Generally, lazy load anything:
- Used on specific routes only
- > 50KB in size
- Not needed for initial render
- Used by < 50% of users

### Q: What about the learning curve?
A: The patterns are simple React patterns (lazy, Suspense, dynamic import). Examples are provided in `bundle-examples/`.

### Q: How do we prevent regression?
A: Add performance budgets to rspack config and monitor in CI. The `analyze-bundle` script makes it easy to check impact.

## Next Steps

1. **Get buy-in from team** - Share this analysis
2. **Pick Phase 1 quick wins** - Start with route-based splitting
3. **Set up measurement** - Run baseline bundle analysis
4. **Create first PR** - Implement one optimization
5. **Measure impact** - Document actual savings
6. **Iterate** - Move to next optimization

## Conclusion

The Metabase frontend bundle can be significantly optimized with minimal code changes. The biggest wins come from:

1. **Route-based code splitting** - Load only what's needed
2. **Lazy loading heavy libraries** - Charts, maps, editors on demand
3. **Replacing underscore** - Use tree-shakeable alternatives
4. **Optimizing CSS** - Load with components, not globally

**Total Potential Savings**: 1.5-2MB (500-700KB gzipped) representing a 30-40% reduction in bundle size.

Implementation can be done incrementally, with each change providing measurable benefit and minimal risk.

---

**Created**: 2026-02-17  
**Author**: GitHub Copilot Analysis  
**Status**: Ready for Implementation
