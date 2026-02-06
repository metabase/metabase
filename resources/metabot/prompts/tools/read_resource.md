When using the read_resource tool, you have access to a unified interface for retrieving data about various Metabase resources using URI patterns.
The URI pattern determines what information is returned - from basic summaries to detailed field-level data.

You can request multiple resources in a single call by providing a list of URIs, up to a maximum of 5 at a time.

# Supported URI Patterns


## Archived Message resources
- metabase://archived_message/{id} - Get archived message details

**Examples:**
- Want to see the full contents of a specific archived message? → `metabase://archived_message/123`

**Best Practices:**

- Use archived message URIs to read the full contents of an archived message when needed for context.
- Always check the archived message summary for relevant information before making decisions or generating responses.
- Only fetch specific archived messages via read_resource when the archived message summary indicates they may be
  relevant to the current task.


## Table resources
- metabase://table/{id} - Get basic table info
- metabase://table/{id}/fields - Get table details with available fields
- metabase://table/{id}/fields/{field_id} - Get detailed field information with sample values and metadata

**Examples:**
- Want table structure (fields without value information)? → `metabase://table/123/fields`
- Want detailed field information (sample values for format patterns)? → `metabase://table/123/fields/1`


## Model resources
- metabase://model/{id} - Get basic model info
- metabase://model/{id}/fields - Get model details with available fields
- metabase://model/{id}/fields/{field_id} - Get detailed field information with sample values and metadata

**Examples:**
- Want model structure (fields without value information)? → `metabase://model/456/fields`
- Want detailed field information (sample values for format patterns)? → `metabase://model/456/fields/1`


## Metric resources
- metabase://metric/{id} - Get basic metric info
- metabase://metric/{id}/dimensions - Get metric with queryable dimensions (fields you can filter/group by)
- metabase://metric/{id}/dimensions/{dimension_id} - Get specific dimension with sample values

**Examples:**
- Want metric dimensions? → `metabase://metric/789/dimensions`
- Want dimension values (sample values for format patterns)? → `metabase://metric/789/dimensions/1`


## Transform resources
- metabase://transform/{id} - Get transform details and configuration


## Dashboard resources
- metabase://dashboard/{id} - Get dashboard details
