---
title: Languages and localization
redirect_from:
  - /docs/latest/administration-guide/localization
---

# Languages and localization

The **Localization** settings allow you to set global defaults for your Metabase instance. You can find **Localization** under **Admin settings** > **Settings**.

## Default language

Here you can set the default language (also called the "instance language") across your Metabase UI, system [emails](./email.md), [dashboard subscriptions](../dashboards/subscriptions.md), and [alerts](../questions/sharing/alerts.md). People can pick a different language from their own [account settings](../people-and-groups/account-settings.md).

## Supported languages

Thanks to our amazing user community, Metabase has been translated into many different languages. Due to [the way we collect translations](#translations), languages may be added or removed during major releases depending on translation coverage.

The languages you can currently pick from are:

- English (default)
- Albanian
- Arabic
- Bulgarian
- Catalan
- Chinese (simplified)
- Chinese (traditional)
- Czech
- Dutch
- Farsi/Persian
- Finnish
- French
- German
- Indonesian
- Italian
- Japanese
- Korean
- Latvian
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

> While Metabase can support languages that read right to left, the Metabase UI is designed around languages that read left to right.

## Translations

Our community contributes to Metabase translations on our [POEditor project](https://poeditor.com/join/project/ynjQmwSsGh). If you'd like to help make Metabase available in a language you're fluent in, we'd love your help!

For a new language to be added to Metabase, it must reach 100%. Once it does, we add it in the next major or minor release of Metabase. All _existing_ languages in Metabase _must stay at 100%_ to continue being included in the next _major_ version of Metabase. This rule ensures that no one encounters a confusing mishmash of English and another language when using Metabase.

We understand that this is a high bar, so we commit to making sure that before each major release, any additions or changes to text in the product are completed at least 10 calendar days before the release ships, at which point we notify all translators that a new release will be happening soon.

Note that while we only remove languages in major releases, we are happy to add them back for minor releases, so it's always a good time to jump in and start translating.

## Report timezone

Use **report timezone** to set a default display time zone for dates and times in Metabase. The report timezone setting is a display setting only, so changing the report timezone won't affect the time zone of any data in your database.

Report timezone doesn't apply to `timestamp without time zone` data types, including the output of [`convertTimezone`](../questions/query-builder/expressions/converttimezone.md) expressions. For example:

| Raw timestamp in your database           | Data type                     | Report time zone | Displayed as           |
| ---------------------------------------- | ----------------------------- | ---------------- | ---------------------- |
| `2022-12-28T12:00:00 AT TIME ZONE 'CST'` | `timestamp with time zone`    | 'Canada/Eastern' | Dec 28, 2022, 7:00 AM  |
| `2022-12-28T12:00:00-06:00`              | `timestamp with offset`       | 'Canada/Eastern' | Dec 28, 2022, 7:00 AM  |
| `2022-12-28T12:00:00`                    | `timestamp without time zone` | 'Canada/Eastern' | Dec 28, 2022, 12:00 AM |

Report timezone is only supported for the following databases:
   - BigQuery
   - Druid
   - MySQL
   - Oracle
   - PostgreSQL
   - Presto
   - Redshift
   - Vertica

## First day of the week

If you need to, you can change the first day of the week for your instance (the default is Sunday). Setting the first day of the week affects things like grouping by week and filtering in questions built using the [query builder](../questions/query-builder/introduction.md). This setting doesn't affect [SQL queries](../questions/native-editor/writing-sql.md).

## Localization options

**Localization options** allow you to set global default display formats for dates, times, numbers, and currencies.

You can also override these localization options for specific fields or questions. For more info, see [Formatting](../data-modeling/formatting.md).

### Dates and times

- **Date style:** the way dates should be displayed in tables, axis labels, and tooltips.
- **Date separators:** you can choose between slashes (`2022/12/14`), dashes (`2022-12-14`), and dots (`2022.12.14.`).
- **Abbreviate names of days and months:** whenever a date is displayed with the day of the week and/or the month written out, turning this setting on will display e.g. "January" as "Jan" or "Monday" as "Mon".
- **Time style:** choose to display the time using either a 12 or 24-hour clock (e.g., 3:00 PM or 15:00).

### Numbers

- **Separator style:** some people use commas to separate thousands places, and others use periods. Here's where you can indicate which camp you belong to.

### Currency

- **Unit of currency:** if you do most of your business in a particular currency, you can specify that here.
- **Currency label style:** whether you want to have your currencies labeled with a symbol, a code (like "USD"), or its full name.
- **Where to display the unit of currency:** this pertains specifically to tables, and lets you choose if you want the currency labels to appear only in the column heading, or next to each value in the column.
