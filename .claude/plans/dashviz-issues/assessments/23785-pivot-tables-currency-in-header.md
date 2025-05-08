# Issue #23785: Pivot tables ignore the column heading/all cells option for summarised currency columns

**URL**: https://github.com/metabase/metabase/issues/23785  
**Priority**: P3  
**Type**: Bug  
**Reporter**: cammsaul  
**Updated**: April 1, 2025

## Difficulty Score: 3/10

## Issue Description
When configuring a currency field in the data model to have the "In the column heading" option, this setting is respected for normal tables but ignored when the same data is displayed in a pivot table. In pivot tables, the currency symbol is always shown in every cell, regardless of the setting.

## Technical Complexity

### Core Components Involved
1. **PivotTable visualization component**
   - `PivotTable.tsx` - Main pivot table implementation
   - `PivotTableCell.tsx` - Cell rendering for pivot tables
   
2. **Currency Formatting**
   - `column.js` - Contains the `currency_in_header` setting definition
   - `numbers.tsx` - Handles currency formatting logic

3. **Data Flow**
   - The issue occurs during the rendering of pivot table cells for currency values

### Implementation Analysis
The issue exists because the pivot table doesn't properly respect the `currency_in_header` setting that's defined in `column.js`. The regular table implementation checks this setting in the formatting logic (in `numbers.tsx`) and responds accordingly.

Looking at the code:

1. In `column.js` around line 327, the `currency_in_header` setting is defined:
```javascript
currency_in_header: {
  title: t`Where to display the unit of currency`,
  widget: "radio",
  getProps: (_series, _vizSettings, onChange) => {
    return {
      onChange: (value) => onChange(value === true),
      options: [
        { name: t`In the column heading`, value: true },
        { name: t`In every table cell`, value: false },
      ],
    };
  },
  getDefault: getDefaultCurrencyInHeader,
  getHidden: (_column, settings, { series, forAdminSettings }) => {
    if (forAdminSettings === true) {
      return false;
    } else {
      return (
        settings["number_style"] !== "currency" ||
        series[0].card.display !== "table"
      );
    }
  },
  readDependencies: ["number_style"],
},
```

2. In `numbers.tsx`, around line 128, there's specific handling for the setting:
```javascript
// extract number portion of currency if we're formatting a cell
if (
  options["type"] === "cell" &&
  options["currency_in_header"] &&
  options["number_style"] === "currency"
) {
  const match = formatted.match(NUMBER_REGEX);
  if (match) {
    formatted = (match[1] || "").trim() + (match[2] || "").trim();
  }
}
```

3. The issue is that the PivotTable visualization doesn't properly pass this setting when formatting cells. The `BodyCell` component in `PivotTableCell.tsx` doesn't seem to pass the `currency_in_header` option when rendering values.

4. Additionally, the setting's visibility is controlled by a condition that checks if the visualization is a table:
```javascript
getHidden: (_column, settings, { series, forAdminSettings }) => {
  // ...
  return (
    settings["number_style"] !== "currency" ||
    series[0].card.display !== "table"
  );
}
```
This might also prevent the setting from being properly applied to pivot tables.

### Resolution Factors

**Localization Considerations**: Low - The bug is related to the display of currency symbols, but doesn't require changes to localization files.

**Testing Requirements**: Medium - Will need to test different currency settings and how they render in pivot tables.

**Fix Complexity**: Low - The fix likely requires adding proper handling for the `currency_in_header` setting in the pivot table cell rendering logic.

## Overall Assessment
This is a relatively straightforward UI bug with a clear reproduction path. The issue is that the pivot table visualization doesn't properly respect the `currency_in_header` setting that regular tables handle correctly. 

The fix would involve:
1. Modifying the pivot table cell rendering to check for currency format settings 
2. Updating the `getHidden` condition for the `currency_in_header` setting to include pivot tables
3. Ensuring the currency formatting logic in `numbers.tsx` is called with the proper parameters from pivot tables

Estimated time to fix: 2-3 hours, including testing and validation.