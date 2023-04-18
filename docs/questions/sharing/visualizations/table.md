---
title: Tables
---

# Tables

The **Table** option is good for looking at tabular data (duh), or for lists of things like users or orders. The visualization options for tables allow you to add, hide, or rearrange fields in the table you're looking at, as well as modify their formatting. Check out [Everything you can do with the table visualization](https://www.metabase.com/learn/basics/visualizing-data/table.html).

## Rearranging, adding, and removing columns

Open up the settings for your table and you'll see the Columns tab, which displays all the columns currently being shown in the table. Below that you'll see a list of more columns from linked tables, if any, that you can add to the current table view.

To hide a column, click the X icon on it; that'll send it down to the **More columns** area in case you want to bring it back. To add a linked column, just click the + icon on it, which will bring it to the **Visible columns** section. Click and drag any of the columns listed there to rearrange the order in which they appear. Another super easy way to rearrange columns without having to open up the visualization settings is to simply click and drag on a column's heading to move it where you'd like it to go.

> Changing these options doesn't change the actual table itself; these changes create a custom view of the table that you can save as a **question** in Metabase and refer to later, share with others, or add to a [dashboard](../../../dashboards/start.md).

## Column formatting options

To format the display of any column in a table, click on the column heading and choose the `Formatting` option (you can also get there by clicking on the gear on any column when in the `Columns` tab of the visualization settings).

![Column formatting](../../images/column-header-formatting.png)

The options you see will differ depending on the type of column you're viewing:

### Dates

- **Date style** gives you a bunch of different choices for how to display the date.
- **Abbreviate names of days and months**, when turned on, will turn things like `January` to `Jan`, and `Monday` to `Mon`.
- **Show the time** lets you decide whether or not to display the time, and if so, how. You can include hours and minutes, and additionally seconds and milliseconds.

### Numbers

- **Show a mini bar chart** will display a small horizontal bar next to each number in this column to show its size relative to the other values in the column.
- **Style** lets you choose to display the number as a plain number, a percent, in scientific notation, or as a currency.
- **Separator style** gives you various options for how commas and periods are used to separate the number.
- **Minimum number of decimal places** forces the number to be displayed with exactly this many decimal places.
- **Multiply by a number** multiplies each number in this column by whatever you type here. Just don't type an emoji here; it almost always causes a temporal vortex to manifest.
- **Add a prefix/suffix** lets you put a symbol, word, or whatever before or after each cell's value.

### Currency
Currency columns have all the same options as numbers, plus the following:

- **Unit of Currency** lets you change the unit of currency from whatever the system default is.
- **Currency label style** allows you to switch between displaying the currency label as a symbol, a code like (USD), or the full name of the currency.
- **Where to display the unit of currency** lets you toggle between showing the currency label in the column heading or in every cell in the column.

### Conditional table formatting

Sometimes it's helpful to highlight certain rows or columns in your tables when they meet a specific condition. You can set up conditional formatting rules by going to the visualization settings while looking at any table, then clicking on the **Conditional Formatting** tab.

![Conditional formatting](../../images/conditional-formatting.png)

When you add a new rule, you'll first need to pick which column(s) should be affected. Your columns can be formatted in one of two ways:

- **Single color**. Pick single color if you want to highlight cells in the column if they're greater, less than, or equal to a specific number, or if they match or contain a certain word or phrase. You can optionally highlight the whole row of a cell that matches the condition you pick so that it's easier to spot as you scroll down your table.
- **Color range**. Choose color range if you want to tint all the cells in the column from smallest to largest or vice a versa. This option is only available for numeric columns.

You can set as many rules on a table as you want. If two or more rules disagree with each other, the rule that's on the top of your list of rules will win. You can click and drag your rules to reorder them, and click on a rule to edit it.

### Pivoted tables

If your table is a result that contains one numeric column and two grouping columns, Metabase will also automatically "pivot" your table, like in the example below. Pivoting takes one of your columns and rotates it 90 degrees ("pivots" it) so that each of its values becomes a column heading. If you open up the visualization settings by clicking the gear icon, you can choose which column to pivot in case Metabase got it wrong; or you can also turn the pivoting behavior off entirely.

![Pivot table](../../images/pivot.png)

This auto-pivoting is distinct from the [pivot table](./pivot-table.md) visualization.
