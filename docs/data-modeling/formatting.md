---
title: Formatting defaults
summary: Configure how dates, numbers, currencies, and text display in Metabase at global, field, and question levels.
redirect_from:
  - /docs/latest/administration-guide/19-formatting-settings
---

# Formatting defaults

People all around the world use Metabase, and everyone has different preferences for how dates, times, numbers, and currencies should be formatted and displayed. Metabase lets you to customize these formatting options at three different levels:

1. **Global**. Set global defaults in Admin -> Settings -> [Localization](../configuring-metabase/localization.md).
2. **Field**. Set field (column) defaults in Admin -> Table Metadata. Field defaults override global defaults.
3. **Question**. Set formatting defaults for individual questions in the visualization settings of that question. Question defaults override global and field defaults.

## Field formatting

_Admin settings > Table Metadata > Database > Table > Field > Formatting_

You can override the global defaults for a specific field by going to the `Table Metadata` section of the Admin Panel. Select the database and table of the field in question, then click scroll down to the **Formatting**.

## Formatting options depend on the data type and the semantic type

The options you'll see here will depend on the field's data type and it's [semantic type](./semantic-types.md).

## Text formatting options

_Admin settings > Table Metadata > Database > Table > Field > Formatting_

Options depend on the [semantic type](./semantic-types.md) you select for the field.

### Align

Whether to display the values in the middle, left, or right in table cells.

### Display As

If you have text, like an image URL, you may need to change the semantic type before Metabase will offer you the option to display the text as an image.

- Text (display "as is").
- Email link (i.e., if you have a `mailto` link).
- Image. Metabase will display links to images as images in tables.
- Automatic. Metabase will detect the string based on its format.
- Link. You can optionally change the text that you want to display in the **Link text** input field. For example, if you set the **Link URL** for an "Adjective" column to:

```
https://www.google.com/search?q={% raw %}{{adjective}}{% endraw %}
```

When someone clicks on the value "askew" in the "Adjective" column, they'll be taken to the Google search URL:

```
https://www.google.com/search?q=askew
```

## Dates and times

_Admin settings > Table Metadata > Database > Table > Field > Formatting_

Options depend on the [semantic type](./semantic-types.md) you select for the field.

### Align

Whether to display the values in the middle, left, or right in table cells.

### Display as

- **Text** (display "as is").
- **Link** (display the date/time as a clickable link).

### Date style

Choose how dates are displayed. Options include formats like:

- January 31, 2018
- 31/1/2018
- 2018/1/31
- And other regional date formats

### Abbreviate days and months

Check this option to use abbreviated forms for days and months (e.g., "Jan" instead of "January", "Mon" instead of "Monday").

### Show the time

This lets you choose if this time field should be displayed by default without the time; with hours and minutes; with hours, minutes, and seconds; or additionally with milliseconds.

- **Off** - Display only the date without time
- **HH:MM** - Display hours and minutes
- **HH:MM:SS** - Display hours, minutes, and seconds
- **HH:MM:SS.MS** - Display hours, minutes, seconds, and milliseconds

### Time style

Choose between 12-hour and 24-hour time format:

- **12-hour clock** (e.g., 5:24 PM)
- **24-hour clock** (e.g., 17:24)

## Numbers

_Admin settings > Table Metadata > Database > Table > Field > Formatting_

Options depend on the [semantic type](./semantic-types.md) you select for the field.

### Align

Whether to display the values in the middle, left, or right in table cells.

### Show a mini bar chart

Only applies to table visualizations. Displays a bar for each value to show large or small it is relative to the other values in the column.

### Display as

- **Automatic** - Metabase will automatically detect the best display format
- **Text** - Display the number as plain text
- **Link** - Display the number as a clickable link

### Style

Lets you choose to display the number as a plain number, a percent, in scientific notation, or as a currency.

- **Normal** - Display as a regular number
- **Percent** - Display as a percentage
- **Scientific notation** - Display in scientific format (e.g., 1.23e+4)
- **Currency** - Display with currency formatting

### Currency label style

For fields with Style set to "Currency", choose how to display the currency label. For example, for Canadian dollars:

- **Symbol**: `CA$` 
- **Local symbol**: `$`
- **Code**: `CAD`
- **Name**: `Canadian dollars`

### Where to display the unit of currency

For currency fields, choose where to show the currency symbol:

- **In the column heading** - Show the currency symbol in the table header
- **In every table cell** - Show the currency symbol next to each value

### Separator style

This gives you various options for how commas and periods are used to separate the number (e.g., 100,000.00, 100.000,00, 100 000.00).

### Number of decimal places

Forces the number to be displayed with exactly this many decimal places.

### Multiply by a number

Multiplies this number by whatever you type here. Useful for unit conversions or scaling values.

### Add a prefix

Lets you put a symbol, word, etc. before this number (e.g., "$" for currency).

### Add a suffix

Lets you put a symbol, word, etc. after this number (e.g., "dollars", "%", "units").

### Currency

Currency field formatting settings include all the same options as in the global formatting section, as well as all the options that Number fields have.

See [Currency formatting options](../questions/visualizations/table.md#currency-formatting-options).

## Question-level formatting

You can also override all formatting settings in any specific saved question or dashboard card by clicking on the gear to open the visualization options. To reset any overridden setting to the default, just click on the rotating arrow icon next to the setting's label. This will reset the setting to the field-level setting if there is one; otherwise it will be reset to the global default.

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
