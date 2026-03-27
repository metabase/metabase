These token_usage schemas also live in the ai-service repository at

https://github.com/metabase/ai-service/tree/main/snowplow/schemas/com.metabase/token_usage/jsonschema

If you update the schema here, make sure to update it there as well.

The schemas are duplicated because each repository has its own setup for running snowplow micro locally, and those
require the schemas to be present in the local filesystem for validation.
