## Setting default formatting

There are lots of Metabase users around the world, each with different preferences for how dates, times, numbers, and currencies should be formatted and displayed. Metabase allows you to customize these formatting options at three different levels:

1. Global formatting defaults in the Admin Panel
2. Field-level formatting overrides in the Data Model section
3. Question-level overrides in visualization settings

### Global formatting defaults
Here are the formatting options available to you from the `Formatting` tab of the `Settings` section in the Admin Panel:

**Dates and Times**
* `Date style:` the way dates should be displayed in tables, axis labels, and tooltips.
* `Date separators:` you can choose between slashes, dashes, and dots here.
* `Abbreviate names of days and months:` whenever a date is displayed with the day of the week and/or the month written out, turning this setting on will display e.g. `January` as `Jan` or `Monday` as `Mon`.
* `Time style:` this lets you choose between a 12-hour or 24-hour clock to display the time by default where applicable.

**Numbers**
* `Separator style:` some folks use commas to separate thousands places, and others use periods. Here's where you can indicate which camp you belong to.

**Currency**
* `Unit of currency:` if you do most of your business in a particular currency, you can specify that here.
* `Currency label style:` whether you want to have your currencies labeled with a symbol, a code (like `USD`), or its full name.
* `Where to display the unit of currency:` this pertains specifically to tables, and lets you choose if you want the currency labels to appear only in the column heading, or next to each value in the column.

### Field-level formatting
You can override the global defaults for a specific field by going to the `Data Model` section of the Admin Panel, selecting the database and table of the field in question, and clicking the gear icon on the far right of the screen next to that field to go to its options page, then clicking on the `Formatting` tab.

The options you'll see here will depend on the field's type. They're generally the same options as in the global formatting settings, with a few additions:

**Dates and Times**
* `Show the time:` this lets you choose if this time field should be displayed by default without the time; with hours and minutes; with hours, minutes, and seconds; or additionally with milliseconds.

**Numbers**
* `Show a mini bar chart:` this only applies to situations where this number is displayed in a table, and if it's on it will show a bar next to each value in this column to show how large or small it is relative to the other values in the column.
* `Style:` lets you choose to display the number as a plain number, a percent, in scientific notation, or as a currency.
* `Separator style:` this gives you various options for how commas and periods are used to separate the number.
* `Minimum number of decimal places:` forces the number to be displayed with exactly this many decimal places.
* `Multiply by a number:` multiplies this number by whatever you type here.
* `Add a prefix/suffix:` lets you put a symbol, word, etc. before or after this number.

**Currency**
Currency field formatting settings include all the same options as in the global formatting section, as well as all the options that Number fields have.

### Question-level formatting
Lastly, you can override all formatting settings in any specific saved question or dashboard card by clicking on the gear to open up the visualization options. To reset any overridden setting to the default, just click on the rotating arrow icon next to the setting's label. This will reset the setting to the field-level setting if there is one; otherwise it will be reset to the global default.

---

## Next: caching query results
Metabase makes it easy to [automatically cache results](14-caching.md) for queries that take a long time to run.
