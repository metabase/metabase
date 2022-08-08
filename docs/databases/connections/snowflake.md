---
title: Snowflake
redirect_from:
  - /docs/latest/administration-guide/databases/snowflake
---

# Snowflake

## Schemas

Here you can specify which schemas you want to sync and scan. Options are:

- All
- Only these...
- All except...

For the **Only these** and **All except** options, you can input a comma-separated list of values to tell Metabase which schemas you want to include (or exclude). For example:

```
foo,bar,baz
```

You can use the `*` wildcard to match multiple schemas.

Let's say you have three schemas: foo, bar, and baz.

- If you have **Only these...** set, and enter the string `b*`, you'll sync with bar and baz.
- If you have **All except...** set, and enter the string `b*`, you'll just sync foo.

Note that only the `*` wildcard is supported; you can't use other special characters or regexes.

## Snowflake gotchas

Here are some gotchas to look out for when connecting to Snowflake:

- **Account**. The `Account` field requires the alphanumeric account ID _with_ the region that your Snowflake cluster is running on. For example, if you're running Snowflake on AWS and your account URL is `https://az12345.ca-central-1.snowflakecomputing.com`, then the `Account` would be `az12345.ca-central-1.aws` (note the `.aws` suffix). There are some regions that don't need this suffix, so please [refer to the official Snowflake documentation](https://docs.snowflake.com/en/user-guide/admin-account-identifier.html#locator-formats-by-cloud-platform-and-region) for this

- **The `Role` and `Schema` fields are optional**. Specifying a role will override the database user's default role. For example, if the database user is `REPORTER` with default role `REPORTER`, but the user also has access to role `REPORTERPRODUCT`, then filling in `REPORTERPRODUCT` in the `Role` field will ensure that the `REPORTERPRODUCT` role is used instead of the user's default `REPORTER` role. If no schema is passed, then all schema available to that user and role will be listed as folders in the Metabase UI.

- **All other fields must be entered in upper case**. Excluding the password.
