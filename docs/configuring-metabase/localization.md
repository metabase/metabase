---
title: Languages and localization
---

# Languages and localization

## Supported languages

Thanks to our amazing user community, Metabase has been translated into many different languages. Due to [the way we collect translations](#policy-for-adding-and-removing-translations), languages may be added or removed during major releases depending on translation coverage.

The languages you can currently pick from are:

- English (default)
- Bulgarian
- Catalan
- Chinese (simplified)
- Chinese (traditional)
- Czech
- Dutch
- Farsi/Persian
- French
- German
- Indonesian
- Italian
- Japanese
- Norwegian Bokmål
- Polish
- Portuguese
- Russian
- Serbian
- Slovak
- Spanish
- Swedish
- Turkish
- Ukrainian
- Vietnamese

## Policy for adding and removing translations

Our community contributes to Metabase translations on our [POEditor project][metabase-poe]. If you'd like to help make Metabase available in a language you're fluent in, we'd love your help!

For a new translation to be added to Metabase, it must reach 100%. Once it does, we add it in the next major or minor release of Metabase. All _existing_ translations in Metabase _must stay at 100%_ to continue being included in the next _major_ version of Metabase. This rule ensures that no one encounters a confusing mishmash of English and another language when using Metabase.

We understand that this is a high bar, so we commit to making sure that before each major release, any additions or changes to text in the product are completed at least 10 calendar days before the release ships, at which point we notify all translators that a new release will be happening soon.

Note that while we only remove languages in major releases, we are happy to add them back for minor releases, so it's always a good time to jump in and start translating.

[metabase-poe]: https://poeditor.com/join/project/ynjQmwSsGh

## Localization

The **Localization** settings allow you to set global defaults for your Metabase instance. Localization settings include options for:

- **Language**
- **Date and time**
- **Numbers**
- **Currency**

The **Localization** settings can be found in the **Admin Panel** under the **Settings** tab.

### Instance language

The default language for all users across the Metabase UI, system emails, pulses, and alerts. Users can pick a different language from their own account settings page.

### First day of the week

If you need to, you can change the first day of the week for your instance (the default is Sunday). Setting the first day of the week affects things like grouping by week and filtering in questions built using the [query builder](../questions/query-builder/introduction.md). This setting doesn't affect [SQL queries](../questions/native-editor/writing-sql.md).

### Localization options

**Dates and Times**

- `Date style:` the way dates should be displayed in tables, axis labels, and tooltips.
- `Date separators:` you can choose between slashes, dashes, and dots here.
- `Abbreviate names of days and months:` whenever a date is displayed with the day of the week and/or the month written out, turning this setting on will display e.g. `January` as `Jan` or `Monday` as `Mon`.
- `Time style:` this lets you choose between a 12-hour or 24-hour clock to display the time by default where applicable.

**Numbers**

- `Separator style:` some folks use commas to separate thousands places, and others use periods. Here's where you can indicate which camp you belong to.

**Currency**

- `Unit of currency:` if you do most of your business in a particular currency, you can specify that here.
- `Currency label style:` whether you want to have your currencies labeled with a symbol, a code (like `USD`), or its full name.
- `Where to display the unit of currency:` this pertains specifically to tables, and lets you choose if you want the currency labels to appear only in the column heading, or next to each value in the column.
