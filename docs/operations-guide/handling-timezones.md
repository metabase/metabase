# Handling timezones in Metabase

Metabase does its best to ensure proper and accurate reporting in whatever timezone you desire, but timezones are a complicated beast so it's important to abide by some recommendations listed below to ensure your reports come out as intended.

The following places where timezones are set can all impact the data you see:

- `Database` - includes global database timezone settings, specific column type settings, and even individual data values.
- `OS & JVM` - on whatever system is running Metabase the timezone settings of the Operating System as well as the Java Virtual Machine can impact your reports.
- `Metabase` - inside Metabase the reporting timezone setting (if set) will influence how your data is reported.

To ensure proper reporting it's important that timezones be set consistently in all places. Metabase recommends the following settings:

- Make sure all of your database columns are properly setup to include timezone awareness.
- Unless you have a special need it's best to set your database reporting timezone to UTC and store all of your date/time related values in UTC.
- Configure your JVM to use the same timezone you want to use for reporting, which ideally should also match the timezone of your database.
- Set the Metabase `Report Timezone` to match the timezone you want to see your reports in, again, this should match the rest of the timezone settings you've made.

Common Pitfalls:

1. Your database is using date/time columns without any timezone information. Typically when this happens your database will assume all the data is from whatever timezone the database is configured in or possible just default to UTC (check your database vendor to be sure).
2. Your JVM timezone is not the same as your Metabase `Report Timezone` choice. This is a very common issue and can be corrected by launching java with the `-Duser.timezone=<timezone>` option properly set to match your Metabase report timezone.

If you are still experiencing timezone problems, then have a look at the [timezone troubleshooting guide](../troubleshooting-guide/timezones.md).
