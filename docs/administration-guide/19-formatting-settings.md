## Setting default formatting for your data

There are Metabase users around the world, each with different preferences for how dates, times, numbers, and currencies should be formatted and displayed. Metabase allows you to customize these formatting options at three different levels:

1. **Global**. Set global defaults in the [Localization](localization.md) section in Admin -> Settings -> Localization.
2. **Field**.  Set field (column) defaults in Admin -> Data Model. Field defaults override global defaults.
3. **Question**. Set formatting defaults for individual questions in the visualization settings of that question. Question defaults override global and field defaults.

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
