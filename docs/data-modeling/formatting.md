---
title: Formatting defaults
redirect_from:
  - /docs/latest/administration-guide/19-formatting-settings
---

# Formatting defaults

There are Metabase users around the world, each with different preferences for how dates, times, numbers, and currencies should be formatted and displayed. Metabase allows you to customize these formatting options at three different levels:

1. **Global**. Set global defaults in the [Localization](../configuring-metabase/localization.md) section in Admin -> Settings -> Localization.
2. **Field**. Set field (column) defaults in Admin -> Table Metadata. Field defaults override global defaults.
3. **Question**. Set formatting defaults for individual questions in the visualization settings of that question. Question defaults override global and field defaults.

## Field-level formatting

You can override the global defaults for a specific field by going to the `Table Metadata` section of the Admin Panel, selecting the database and table of the field in question, and clicking the gear icon on the far right of the screen next to that field to go to its options page, then clicking on the `Formatting` tab.

The options you'll see here will depend on the field's type. They're generally the same options as in the global formatting settings, with a few additions:

### Dates and Times

- `Show the time:` this lets you choose if this time field should be displayed by default without the time; with hours and minutes; with hours, minutes, and seconds; or additionally with milliseconds.

### Numbers

- `Show a mini bar chart:` only applies to table visualizations. Displays a bar for each value to show large or small it is relative to the other values in the column.
- `Style:` lets you choose to display the number as a plain number, a percent, in scientific notation, or as a currency.
- `Separator style:` this gives you various options for how commas and periods are used to separate the number.
- `Number of decimal places:` forces the number to be displayed with exactly this many decimal places.
- `Multiply by a number:` multiplies this number by whatever you type here.
- `Add a prefix/suffix:` lets you put a symbol, word, etc. before or after this number.

### Currency

Currency field formatting settings include all the same options as in the global formatting section, as well as all the options that Number fields have.

See [Currency formatting options](../questions/visualizations/table.md#currency-formatting-options).

## Question-level formatting

Lastly, you can override all formatting settings in any specific saved question or dashboard card by clicking on the gear to open up the visualization options. To reset any overridden setting to the default, just click on the rotating arrow icon next to the setting's label. This will reset the setting to the field-level setting if there is one; otherwise it will be reset to the global default.

Formatting options vary depending on the type of visualization:

- [Combo chart](../questions/visualizations/combo-chart.md)
- [Detail](../questions/visualizations/detail.md)
- [Funnel](../questions/visualizations/funnel.md)
- [Gauge](../questions/visualizations/gauge.md)
- [Line, Bar, and area charts](../questions/visualizations/line-bar-and-area-charts.md)
- [Maps](../questions/visualizations/map.md)
- [Numbers](../questions/visualizations/numbers.md)
- [Pie or donut chart](../questions/visualizations/pie-or-donut-chart.md)
- [Pivot table](../questions/visualizations/pivot-table.md)
- [Progress bar](../questions/visualizations/progress-bar.md)
- [Scatter plot or bubble chart](../questions/visualizations/scatterplot-or-bubble-chart.md)
- [Tables](../questions/visualizations/table.md)
- [Trend](../questions/visualizations/trend.md)
- [Waterfall chart](../questions/visualizations/waterfall-chart.md)
