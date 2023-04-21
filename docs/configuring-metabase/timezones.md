---
title: Timezones
redirect_from:
  - /docs/latest/operations-guide/handling-timezones
---

# Timezones

Metabase does its best to ensure proper and accurate reporting in whatever timezone you want. But timezones are mysterious creatures.

## Time zone settings

The following places where timezones are set can all impact the data you see:

- `Database` - includes global database timezone settings, specific column type settings, and even individual data values.
- `OS & JVM` - on whatever system is running Metabase the timezone settings of the Operating System as well as the Java Virtual Machine can impact your reports.
- `Metabase` - inside Metabase the reporting timezone setting (if set) will influence how your data is reported.
- `Metabase Cloud` - the timezone on the server that hosts your Metabase Cloud instance.

## Recommended settings

To ensure proper reporting it's important that timezones be set consistently in all places. Metabase recommends the following settings:

- Make sure all of your database columns are properly setup to include [time zone awareness](#data-types).
- Unless you have a special need it's best to set your database reporting time zone to UTC and store all of your date/time related values in UTC.
- Configure your JVM to use the same timezone you want to use for reporting, which ideally should also match the timezone of your database.
- Set the Metabase `Report Timezone` to match the timezone you want to see your reports in, again, this should match the rest of the timezone settings you've made.
- If you want to change your Metabase Cloud timezone, please [contact support](https://www.metabase.com/help-premium).

## Data types

You can make your database columns time zone aware by storing them as specific data types, such as:

| Data type                     | Description                               | Example                                              |
| ----------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| `timestamp with time zone`    | Knows about location.                     | `2022-12-28T12:00:00 AT TIME ZONE 'America/Toronto'` |
| `timestamp with offset`       | Knows about the time difference from UTC. | `2022-12-28T12:00:00-04:00`                          |
| `timestamp without time zone` | No time zone info.                        | `2022-12-28T12:00:00`                                |

The exact data type will depend on your database. Some Metabase features only work with specific data types:

- [Report timezone setting](../configuring-metabase/localization.md#report-timezone)
- [`converttimezone` custom expression](../questions/query-builder/expressions/converttimezone.md)

## Common pitfalls

1. Your database is using date/time columns without any timezone information. Typically when this happens your database will assume all the data is from whatever timezone the database is configured in or possible just default to UTC (check your database vendor to be sure).
2. Your JVM timezone is different from your Metabase `Report Timezone` choice. This is a very common issue and can be corrected by launching java with the `-Duser.timezone=<timezone>` option properly set to match your Metabase report timezone.

If you are still experiencing timezone problems, then have a look at the [timezone troubleshooting guide](../troubleshooting-guide/timezones.md).
