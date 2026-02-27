---
title: Languages and localization
redirect_from:
  - /docs/latest/administration-guide/localization
---

# Languages and localization

_Admin > Settings > Localization_

Admins can update the localization settings for the instance:

1. Click the **grid** icon in the upper right.
2. Select **Admin**.
3. In the **Settings** tab, click on **Localization** in the left sidebar.

These localization settings allow you to set global language and formatting defaults for dates, times, numbers, and currencies.

People can also override these localization options for specific fields or questions. For more info, see [Formatting](../data-modeling/formatting.md).

## Instance settings

### Set default instance language

_Admin > Settings > Localization > Instance settings > Instance language_

You can set the default language (also called the "instance language") across your Metabase UI, system [emails](./email.md), [dashboard subscriptions](../dashboards/subscriptions.md), and [alerts](../questions/alerts.md).

People can override these settings in their personal [account settings](../people-and-groups/account-settings.md).

To set the instance-wider language:

1. Go to **Admin > Settings > Localization**.
2. Under **Instance language**, pick the language for your instance.

   See [List of supported languages](#supported-languages). Some translations are created by the Metabase community, and might not be perfect.

### Set default instance timezone

_Admin > Settings > Localization > Instance settings > Report timezone_

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

To set report timezone:

1. Go to **Admin > Settings > Localization**.
2. Under **Report timezone**, pick the default report timezone.

### First day of the week

_Admin > Settings > Localization > Instance settings > First day of the week_

If you need to, you can change the first day of the week for your instance (the default is Sunday).

Setting the first day of the week affects how the [query builder](../questions/query-builder/editor.md) filters or groups by week. People can, however, use the `week` function to override this default when filtering or grouping by week of year. See [using a different first week of the year](../questions/query-builder/expressions/week.md#using-a-different-first-week-of-the-year).

This setting doesn't affect [SQL queries](../questions/native-editor/writing-sql.md).

## Dates and times display settings

You can configure how dates and times look by default in your instance.

Note that people can also override these localization options for specific fields or questions. For more info, see [Formatting](../data-modeling/formatting.md).

To configure default date and time format settings:

1. Go to **Admin > Settings > Localization**.
2. Under **Dates and times**, configure your settings:
   - **Date style:** the way dates should be displayed in tables, axis labels, and tooltips.
   - **Date separators:** you can choose between slashes (`2022/12/14`), dashes (`2022-12-14`), and dots (`2022.12.14`).
   - **Abbreviate names of days and months:** whenever a date is displayed with the day of the week and/or the month written out, turning this setting on will display e.g. "January" as "Jan" or "Monday" as "Mon".
   - **Time style:** choose to display the time using either a 12 or 24-hour clock (e.g., 3:00 PM or 15:00).

## Number display settings

_Admin > Settings > Localization_

Some people use commas to separate thousands places, and others use periods. You can configure which camp you belong to.

Note that people can also override these localization options for specific fields or questions. For more info, see [Formatting](../data-modeling/formatting.md).

To configure default separator settings:

1. Go to **Admin > Settings > Localization**.
2. Under **Number**, configure the **Separator style**.

## Currency display settings

_Admin > Settings > Localization_

You can choose how should currency fields be displayed by default (you can to configure _which_ fields should be displayed as currency in table metadata or in question formatting setting, see [Formatting](../data-modeling/formatting.md) )

Note that people can also override these localization options for specific fields or questions.

To configure default currency settings:

1. Go to **Admin > Settings > Localization**.
2. Under **Currency**, configure currency settings:

   - **Unit of currency:** if you do most of your business in a particular currency, you can specify that here.
   - **Currency label style:** whether you want to have your currencies labeled with a symbol, a code (like "USD"), or its full name.

## Localizing embedded Metabase

You can translate both Metabase UI elements (like button labels) and content (like dashboard names) in guest embeds. See [Setting the language for guest embeds](../embedding/guest-embedding.md) and [Translating embedded dashboards and questions](../embedding/translations.md).

## Supported languages

Thanks to our amazing user community, Metabase has been translated into many different languages. Due to [the way we collect translations](#translations), languages may be added or removed during major releases depending on translation coverage.

Supported languages include:

| Language               | Code    |
| ---------------------- | ------- |
| English                | `en`    |
| Albanian               | `sq`    |
| Arabic                 | `ar`    |
| Arabic (Saudi Arabia)  | `ar-SA` |
| Bulgarian              | `bg`    |
| Catalan                | `ca`    |
| Chinese (Hong Kong)    | `zh-HK` |
| Chinese (Simplified)   | `zh-CN` |
| Chinese (Taiwanese)    | `zh-TW` |
| Czech                  | `cs`    |
| Dutch                  | `nl`    |
| Farsi/Persian          | `fa`    |
| Finnish                | `fi`    |
| French                 | `fr`    |
| German                 | `de`    |
| Hebrew                 | `he`    |
| Hungarian              | `hu`    |
| Indonesian             | `id`    |
| Italian                | `it`    |
| Japanese               | `ja`    |
| Korean                 | `ko`    |
| Latvian                | `lv`    |
| Malay                  | `ms`    |
| Norwegian Bokmål       | `nb`    |
| Polish                 | `pl`    |
| Portuguese (Brazilian) | `pt-BR` |
| Russian                | `ru`    |
| Serbian                | `sr`    |
| Slovak                 | `sk`    |
| Spanish                | `es`    |
| Swedish                | `sv`    |
| Turkish                | `tr`    |
| Ukrainian              | `uk`    |
| Vietnamese             | `vi`    |

The locale codes are relevant for setting the language in [guest embeds](../embedding/guest-embedding.md).

> While Metabase can support languages that read right to left, the Metabase UI is designed around languages that read left to right.

## Translations

Our community contributes to Metabase translations on our [Crowdin project](https://crowdin.com/project/metabase-i18n).

If you'd like to help make Metabase available in a language you're fluent in, we'd love your help!

For a new language to be added to Metabase, it must reach 100%. Once it does, we add it in the next major or minor release of Metabase. All _existing_ languages in Metabase _must stay at 100%_ to continue being included in the next _major_ version of Metabase. This rule ensures that no one encounters a confusing mishmash of English and another language when using Metabase.

We understand that this is a high bar, so we commit to making sure that before each major release, any additions or changes to text in the product are completed at least 10 calendar days before the release ships, at which point we notify all translators that a new release will be happening soon.

Note that while we only remove languages in major releases, we are happy to add them back for minor releases, so it's always a good time to jump in and start translating.

### Contributing to translations for Metabase

If you'd like to help make Metabase available in a language you're fluent in, we'd love your help! Check out our [Crowdin project](https://crowdin.com/project/metabase-i18n).
