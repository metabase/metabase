# Issue #55728: Gauge visualization is nonsensical when using a time unit breakout

**URL**: https://github.com/metabase/metabase/issues/55728  
**Priority**: P3  
**Type**: Bug  
**Reporter**: randommm  
**Updated**: April 1, 2025

## Difficulty Score: 2/10

## Issue Description
When a query includes a breakout by time unit (like "Day of week" or "Month of year"), the gauge visualization is still available as an option and renders in a nonsensical way. Since gauge visualizations are intended for single values rather than multiple data points broken out by category, this is confusing and provides no meaningful information to users.

## Technical Complexity

### Core Components Involved
1. **Gauge Visualization**
   - `Gauge.jsx` - Main gauge visualization implementation
   - Static validation functions `isSensible` and `checkRenderable`

2. **Visualization Type Validation**
   - `Visualization.tsx` - Main component managing visualization rendering and validation

### Implementation Analysis
The problem is in the validation logic for the gauge visualization. Currently in `Gauge.jsx`, there are two static methods for validation:

1. `isSensible`: Checks if the data has exactly one row and one column
```javascript
static isSensible({ cols, rows }) {
  return rows.length === 1 && cols.length === 1;
}
```

2. `checkRenderable`: Verifies that the column is numeric
```javascript
static checkRenderable([
  {
    data: { cols, rows },
  },
]) {
  if (!isNumeric(cols[0])) {
    throw new Error(t`Gauge visualization requires a number.`);
  }
}
```

The issue is that these checks don't specifically reject time unit breakouts. When using a time unit breakout, the data actually does have only one column (since the time unit becomes the axis), and the individual values are numeric, so both validation tests pass.

However, the gauge visualization is only meaningful for a single value, not for a series of time-based values. This is why it appears nonsensical when displaying multiple values from a time unit breakout.

### Resolution Factors

**Localization Considerations**: Low - Only requires adding a simple error message to the `checkRenderable` function.

**Testing Requirements**: Low - Simple unit test to verify that gauge visualization is disabled for time unit breakouts.

**Fix Complexity**: Low - The fix is straightforward:
1. In `checkRenderable`, add logic to check if the query uses time unit breakouts
2. If a time unit breakout is present, throw an error explaining that gauge visualizations don't work with time-based data

## Overall Assessment
This is a relatively simple bug to fix. It requires identifying time unit breakouts in the query and preventing the gauge visualization from being available in such cases.

The fix would involve:
1. Enhancing the `checkRenderable` method in `Gauge.jsx` to check for time unit breakouts
2. Adding a specific error message explaining why the visualization isn't suitable for time-based data
3. The check could look for special semantic types or check for "extract" operations in the query

This is similar to validation done in other visualizations where certain data configurations are not supported.

Estimated time to fix: 1-2 hours, including testing.