### Connecting to Snowflake

Here are some gotchas to look out for when connecting to Snowflake:

- **Account vs. Region fields**. The `Account` field requires _only_ the alphanumeric account ID. Enter the suffixes indicating region and cloud provider in the `Region ID` field below. For example, if the Snowflake account URL is `https://az12345.ca-central-1.snowflakecomputing.com` then the `Account` would be `az12345` and the `Region ID` would be `ca-central-1.aws`. 

- **The `Role` and `Schema` fields are optional**. Specifying a role will override the database user's default role. For example, if the database user is `REPORTER` with default role `REPORTER`, but the user also has access to role `REPORTERPRODUCT`, then filling in `REPORTERPRODUCT` in the `Role` field will ensure that the `REPORTERPRODUCT` role is used instead of the user's default `REPORTER` role. If no schema is passed, then all schema available to that user and role will be listed as folders in the Metabase UI.

- **All other fields must be entered in upper case**. Excluding the password.
