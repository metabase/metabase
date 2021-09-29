### Connecting to Snowflake

Here are some gotchas to look out for when connecting to Snowflake:

- **Account**. The `Account` field requires the alphanumeric account ID _with_ the region that your Snowflake cluster is running on. For example, if you're running Snowflake on AWS and your account URL is `https://az12345.ca-central-1.snowflakecomputing.com`, then the `Account` would be `az12345.ca-central-1.aws` (note the `.aws` suffix).

- **The `Role` and `Schema` fields are optional**. Specifying a role will override the database user's default role. For example, if the database user is `REPORTER` with default role `REPORTER`, but the user also has access to role `REPORTERPRODUCT`, then filling in `REPORTERPRODUCT` in the `Role` field will ensure that the `REPORTERPRODUCT` role is used instead of the user's default `REPORTER` role. If no schema is passed, then all schema available to that user and role will be listed as folders in the Metabase UI.

- **All other fields must be entered in upper case**. Excluding the password.
