# Issue #55725: Trend visualization using extraction time units (e.g. Day of Week) has confusing error message

**URL**: https://github.com/metabase/metabase/issues/55725  
**Priority**: P3  
**Type**: Bug  
**Reporter**: randommm  
**Updated**: April 1, 2025

## Difficulty Score: 3/10

## Issue Description
When users try to create a trend visualization with an extraction time unit breakout (like "Day of Week" or "Month of Year"), they receive a confusing error message stating they need to "Group only by a time field" - even though they are already grouping by a time field. Additionally, when these visualizations are sent as subscriptions, they are displayed incorrectly with the breakout being misrepresented.

## Technical Complexity

### Core Components Involved
1. **SmartScalar (Trend) Visualization**
   - `SmartScalar.jsx` - Main trend visualization component
   - `compute.js` - Logic for calculating trend data and comparisons

2. **Insights Generation**
   - Code that determines valid time series for trend visualization
   - Validation logic in `checkRenderable` method

### Implementation Analysis
The issue occurs in the validation logic for trend visualization. Looking at the `SmartScalar.jsx` file, we can see the `checkRenderable` method that validates whether a trend visualization can be rendered:

```javascript
checkRenderable([{ data: { insights } }]) {
  if (!insights || insights.length === 0) {
    throw new ChartSettingsError(
      t`Group only by a time field to see how this has changed over time`,
    );
  }
}
```

This validation depends on the presence of "insights" in the data. The problem is that when using extraction time units (like "Day of Week"), the system doesn't generate proper insights data. This is because extraction units don't represent a true time series progression - they represent categorical data derived from time.

The real issue is in how time field extraction is handled. In the `getCurrentMetricData` function in `compute.js`, we can see:

```javascript
const dimensionColIndex = cols.findIndex((col) => {
  return isDate(col) || isAbsoluteDateTimeUnit(col.unit);
});
```

This checks if a column is a date or has an absolute date time unit, but it doesn't properly handle extraction time units like "day-of-week" or "month-of-year" which are relative rather than absolute.

The error message is misleading because users *are* grouping by a time field, just not in a way the trend visualization can understand or properly utilize.

### Resolution Factors

**Localization Considerations**: Low - Only requires changing one error message string.

**Testing Requirements**: Medium - Need to test with various extraction time units to ensure proper error message.

**Fix Complexity**: Low to Medium - The fix would involve:
1. Enhancing detection of extraction time units
2. Providing a more specific error message for this case
3. Fixing the subscription visualization issue

## Overall Assessment
This is a usability bug of moderate difficulty. The core issue is that the error message is confusing because it doesn't accurately describe what's wrong - the user *is* grouping by a time field, but the specific type of time grouping (extraction units) isn't suitable for trend visualization.

The fix would involve:
1. Enhancing the detection of extraction time units in the `checkRenderable` method
2. Providing a more specific error message like "Trend visualization requires a time series with progressive dates, not a time part extraction like 'Day of Week'"
3. Fixing the subscription visualization to either properly display the extraction unit data or show the same error as the frontend

The solution requires understanding how time extraction units are handled in the visualization pipeline, but doesn't involve complex architectural changes.

Estimated time to fix: 2-4 hours, including testing with various time units.