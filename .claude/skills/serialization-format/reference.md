# Serialization Format Reference

Complete YAML specification for every serializable Metabase entity type. Fields are grouped as:
- **copy** -- written to YAML verbatim
- **transform** -- converted to portable form (transformation noted in parentheses)
- **nested** -- child entities inlined as arrays
- **always skipped** -- `id`, `updated_at` are never serialized (plus model-specific skips)

Source of truth: `serdes/make-spec` in each model file.

---

## Collection

**Source**: `src/metabase/collections/models/collection.clj`
**Path**: `collections/{entity_id}_{slug}/{entity_id}_{slug}.yaml`

```yaml
# copy fields
name: Marketing Analytics                # string, required
description: Reports for the marketing team  # string or null
entity_id: M-Q4pcV0qkiyJ0kiSWECl       # nanoid, required
slug: marketing_analytics               # string, URL-friendly name
archived: false                         # boolean
archived_directly: null                 # boolean or null
type: null                              # null or "instance-analytics"
namespace: null                         # null or "transforms" or "snippets"
authority_level: null                   # null or "official"
archive_operation_id: null              # string or null
is_remote_synced: false                 # boolean
is_sample: false                        # boolean

# transform fields
created_at: '2024-08-28T09:46:18.671622Z'  # (date) ISO 8601
parent_id: null                             # (fk Collection) entity_id of parent collection, or null for root
personal_owner_id: null                     # (fk User) email or null

serdes/meta:
- id: M-Q4pcV0qkiyJ0kiSWECl
  label: marketing_analytics
  model: Collection
```

---

## Card (Question / Model)

**Source**: `src/metabase/queries/models/card.clj`
**Path**: `collections/.../cards/{entity_id}_{slug}.yaml`

```yaml
# copy fields
name: Orders by Product Category         # string, required
description: Breakdown of orders grouped by product category  # string or null
entity_id: f1C68pznmrpN1F5xFDj6d       # nanoid, required
display: table                          # visualization type: table, bar, line, pie, scalar, row, area, combo, scatter, waterfall, funnel, map, pivot, progress, gauge, number, trend, smartscalar, native, object
archived: false                         # boolean
archived_directly: false                # boolean
collection_preview: true                # boolean
collection_position: null               # integer or null
query_type: null                        # null, "query", or "native"
type: question                          # "question" or "model"
enable_embedding: false                 # boolean
embedding_params: null                  # map or null
embedding_type: null                    # null, "sdk", "standalone"
public_uuid: null                       # UUID string or null
metabase_version: v1.58.0-SNAPSHOT      # string or null
card_schema: 23                         # integer, card schema version

# transform fields
created_at: '2024-08-28T09:46:24.692002Z'  # (date) ISO 8601
database_id: Sample Database                 # (fk Database) database name
table_id:                                    # (fk Table) [db, schema, table] or null
- Sample Database
- PUBLIC
- ORDERS
source_card_id: null                        # (fk Card) entity_id or null -- for questions based on other questions
collection_id: M-Q4pcV0qkiyJ0kiSWECl       # (fk Collection) entity_id or null
dashboard_id: null                          # (fk Dashboard) entity_id or null
document_id: null                           # (fk Document) entity_id or null
creator_id: rasta@metabase.com              # (fk User) email
made_public_by_id: null                     # (fk User) email or null

# transform fields (complex)
dataset_query: {}                       # (mbql) see Dataset Query section below
parameters: []                          # (parameters) array of parameter definitions
parameter_mappings: []                  # (parameter_mappings) array
visualization_settings:                 # (visualization_settings) map with portable refs
  column_settings: null
result_metadata: null                   # (custom) array of column metadata with portable refs, or null

serdes/meta:
- id: f1C68pznmrpN1F5xFDj6d
  label: orders_by_product_category
  model: Card

# Skipped fields (not serialized):
# cache_invalidated_at, view_count, last_used_at, initially_published_at,
# dataset_query_metrics_v2_migration_backup, cache_ttl, dependency_analysis_version,
# dimensions, dimension_mappings, legacy_query
```

### Dataset Query

Structured (MBQL) query:
```yaml
dataset_query:
  database: Sample Database              # database name (not numeric ID)
  query:
    source-table:                        # [db, schema, table] reference
    - Sample Database
    - PUBLIC
    - ORDERS
    filter:                              # optional MBQL filter clause
    - >
    - - field
      - - Sample Database               # field references use [db, schema, table, field]
        - PUBLIC
        - ORDERS
        - TOTAL
      - null
    - 50
    aggregation:                         # optional aggregation
    - - count
    breakout:                            # optional breakout dimensions
    - - field
      - - Sample Database
        - PUBLIC
        - PRODUCTS
        - CATEGORY
      - source-field:
        - Sample Database
        - PUBLIC
        - ORDERS
        - PRODUCT_ID
    order-by:                            # optional ordering
    - - desc
      - - aggregation
        - 0
    limit: 10                            # optional row limit
  type: query
```

Native (SQL) query:
```yaml
dataset_query:
  database: Sample Database
  native:
    query: |-
      SELECT p.CATEGORY, COUNT(*) AS order_count, SUM(o.TOTAL) AS revenue
      FROM ORDERS o
      JOIN PRODUCTS p ON o.PRODUCT_ID = p.ID
      WHERE o.CREATED_AT >= {{start_date}}
      GROUP BY p.CATEGORY
      ORDER BY revenue DESC
    template-tags:
      start_date:
        display-name: Start Date
        id: cacf4ea0-5d41-4be0-9c8b-a6c861545ff4
        name: start_date
        type: date
  type: native
```

### Result Metadata

Array of column descriptors. Field references and IDs use portable [db, schema, table, field] form:
```yaml
result_metadata:
- active: true
  base_type: type/BigInteger             # Metabase base type
  database_type: BIGINT                  # database-native type name
  description: null
  display_name: ID
  effective_type: type/BigInteger
  semantic_type: type/PK                 # semantic type (type/PK, type/FK, type/Name, etc.)
  name: ID
  position: 0
  source: fields
  visibility_type: normal
  field_ref:                             # portable field reference
  - field
  - - Sample Database
    - PUBLIC
    - ORDERS
    - ID
  - null
  id:                                    # portable field path
  - Sample Database
  - PUBLIC
  - ORDERS
  - ID
  table_id:                              # portable table path
  - Sample Database
  - PUBLIC
  - ORDERS
```

---

## Dashboard

**Source**: `src/metabase/dashboards/models/dashboard.clj`
**Path**: `collections/.../dashboards/{entity_id}_{slug}.yaml`

```yaml
# copy fields
name: My Dashboard                      # string, required
description: null                       # string or null
entity_id: Q_jD-f-9clKLFZ2TfUG2h       # nanoid, required
archived: false                         # boolean
archived_directly: false                # boolean
auto_apply_filters: true                # boolean
collection_position: null               # integer or null
position: null                          # integer or null
enable_embedding: false                 # boolean
embedding_params: null                  # map or null
embedding_type: null                    # null, "sdk", "standalone"
show_in_getting_started: false          # boolean
caveats: null                           # string or null
points_of_interest: null                # string or null
public_uuid: null                       # UUID or null
width: fixed                            # "fixed" or "full"

# transform fields
created_at: '2024-08-28T09:46:24.726993Z'  # (date)
initially_published_at: null                # (date) or null
collection_id: M-Q4pcV0qkiyJ0kiSWECl       # (fk Collection) entity_id or null
creator_id: rasta@metabase.com              # (fk User) email
made_public_by_id: null                     # (fk User) email or null
parameters: []                              # (parameters) array of parameter definitions

# nested entities
tabs: []                                    # array of DashboardTab
dashcards: []                               # array of DashboardCard (see below)

serdes/meta:
- id: Q_jD-f-9clKLFZ2TfUG2h
  label: my_dashboard
  model: Dashboard
```

### DashboardTab (nested in Dashboard)

```yaml
tabs:
- entity_id: abc123nanoidhere1234   # nanoid
  name: Overview                    # string
  position: 0                       # integer, ordering
  created_at: '2024-08-28T...'      # (date)
  dashboard_id: Q_jD-f-9clKLFZ2TfUG2h  # (parent-ref) dashboard entity_id
```

### DashboardCard (nested in Dashboard)

```yaml
dashcards:
- entity_id: UkpFcfUZMZt9ehChwnrAO    # nanoid
  row: 0                               # integer, grid row position
  col: 0                               # integer, grid column position
  size_x: 4                            # integer, width in grid units
  size_y: 4                            # integer, height in grid units
  inline_parameters: []                # array
  created_at: '2024-08-28T...'         # (date)
  card_id: f1C68pznmrpN1F5xFDj6d      # (fk Card) entity_id or null
  action_id: null                      # (fk Action) entity_id or null
  dashboard_tab_id: null               # (fk DashboardTab) entity_id or null
  parameter_mappings: []               # (parameter_mappings)
  visualization_settings:              # (visualization_settings)
    column_settings: null
  series:                              # nested DashboardCardSeries
  - card_id: OMuZ0wHe2O5Z_59-cLmn4    # (fk Card) entity_id
    position: 0                        # integer
  serdes/meta:
  - id: Q_jD-f-9clKLFZ2TfUG2h
    model: Dashboard
  - id: UkpFcfUZMZt9ehChwnrAO
    model: DashboardCard
```

---

## Database

**Source**: `src/metabase/warehouses/models/database.clj`
**Path**: `databases/{name}/{name}.yaml`

Databases use their **name** as identifier (not entity_id).

```yaml
# copy fields
name: Sample Database                   # string, required -- also the identifier
description: null                       # string or null
engine: h2                              # database engine: h2, postgres, mysql, bigquery, redshift, snowflake, etc.
dbms_version: null                      # map or null
auto_run_queries: true                  # boolean
refingerprint: null                     # boolean or null
is_full_sync: true                      # boolean
is_on_demand: false                     # boolean
is_sample: false                        # boolean
is_audit: false                         # boolean
is_attached_dwh: false                  # boolean
metadata_sync_schedule: 0 5 * * * ? *  # cron expression
cache_field_values_schedule: 0 0 23 * * ? *  # cron expression
settings: {}                            # engine-specific settings map
caveats: null                           # string or null
points_of_interest: null                # string or null
timezone: null                          # string or null
provider_name: null                     # string or null
uploads_enabled: false                  # boolean
uploads_schema_name: null               # string or null
uploads_table_prefix: null              # string or null

# transform fields
created_at: '2024-08-28T14:38:42.753121Z'  # (date)
creator_id: null                            # (fk User) email or null
router_database_id: null                    # (fk Database) name or null
initial_sync_status: complete               # (custom) "complete", "incomplete", or "aborted"

# NOTE: `details` (connection config with credentials) is only exported in
# certain modes. It is typically excluded for security reasons.

serdes/meta:
- id: Sample Database                   # database name as id
  model: Database
```

---

## Table

**Source**: `src/metabase/warehouse_schema/models/table.clj`
**Path**: `databases/{db}/schemas/{schema}/tables/{table}/{table}.yaml` or `databases/{db}/tables/{table}/{table}.yaml`

Tables use `[database, schema, table_name]` as identifier.

```yaml
# copy fields
name: ORDERS                            # string, required
display_name: Orders                    # string
description: null                       # string or null
entity_type: entity/TransactionTable    # entity type classification or null
active: true                            # boolean
is_upload: false                        # boolean
field_order: database                   # "database", "alphabetical", "custom", "smart"
visibility_type: null                   # null, "hidden", "technical", "cruft"
show_in_getting_started: false          # boolean
initial_sync_status: complete           # string
points_of_interest: null                # string or null
caveats: null                           # string or null
schema: PUBLIC                          # string or null (null for schemaless databases)
database_require_filter: null           # boolean or null
is_writable: null                       # boolean or null
data_authority: unconfigured            # string
data_source: null                       # string or null
owner_email: null                       # string or null
is_published: false                     # boolean

# transform fields
created_at: '2024-08-28T14:38:42.774331Z'  # (date)
archived_at: null                           # (date) or null
deactivated_at: null                        # (date) or null
data_layer: null                            # (optional-kw) keyword or null
db_id: Sample Database                       # (fk Database) database name
collection_id: null                         # (fk Collection) entity_id or null
transform_id: null                          # (fk Transform) entity_id or null
owner_user_id: null                         # (fk User) email or null

serdes/meta:
- id: Sample Database
  model: Database
- id: PUBLIC                             # omitted if schema is null
  model: Schema
- id: ORDERS
  model: Table
```

---

## Field

**Source**: `src/metabase/warehouse_schema/models/field.clj`
**Path**: `databases/{db}/[schemas/{schema}/]tables/{table}/fields/{field}.yaml`

Fields use `[database, schema, table, field_name]` as identifier.

```yaml
# copy fields
name: PRODUCT_ID                        # string, required
display_name: Product ID                # string
description: null                       # string or null
active: true                            # boolean
visibility_type: normal                 # "normal", "details-only", "hidden", "sensitive", "retired"
database_type: INTEGER                  # database-native type string
base_type: type/Integer                 # Metabase base type
effective_type: type/Integer            # effective type (after coercion)
semantic_type: type/FK                  # semantic type: type/PK, type/FK, type/Name, type/Email, type/Category, type/City, etc., or null
database_is_auto_increment: false       # boolean
database_required: false                # boolean
json_unfolding: false                   # boolean
coercion_strategy: null                 # string or null (e.g., "Coercion/UNIXSeconds->DateTime")
preview_display: true                   # boolean
position: 2                             # integer
custom_position: 0                      # integer
database_position: 2                    # integer
has_field_values: null                  # null, "none", "list", "search", "auto-list"
settings: null                          # map or null
caveats: null                           # string or null
points_of_interest: null                # string or null
nfc_path: null                          # array or null (JSON column path for nested fields)
database_default: null                  # string or null
database_indexed: null                  # boolean or null
database_is_generated: null             # boolean or null
database_is_nullable: null              # boolean or null
database_is_pk: null                    # boolean or null
database_partitioned: null              # boolean or null

# transform fields
created_at: '2024-08-28T14:38:42.774331Z'  # (date)
table_id:                                    # (fk Table) [db, schema, table]
- Sample Database
- PUBLIC
- ORDERS
fk_target_field_id: null                     # (fk Field) [db, schema, table, field] or null
parent_id: null                              # (fk Field) [db, schema, table, field] or null -- for nested/JSON fields

# nested
dimensions: []                               # array of Dimension entities

serdes/meta:
- id: Sample Database
  model: Database
- id: PUBLIC
  model: Schema
- id: ORDERS
  model: Table
- id: PRODUCT_ID
  model: Field
```

### Foreign Key Example

```yaml
# Field ORDERS.PRODUCT_ID referencing PRODUCTS.ID
fk_target_field_id:
- Sample Database
- PUBLIC
- PRODUCTS
- ID
semantic_type: type/FK
```

---

## FieldValues

**Source**: `src/metabase/warehouse_schema/models/field_values.clj`
**Path**: `databases/.../fields/{field_name}___fieldvalues.yaml`

```yaml
# copy fields
values:                                 # array of values
- Doohickey
- Gadget
- Gizmo
- Widget
human_readable_values: []               # array of display names (parallel to values)
has_more_values: false                  # boolean
hash_key: null                          # string or null

# transform fields
created_at: '2024-08-28T14:38:42.774331Z'  # (date)
last_used_at: '2024-08-28T14:38:42.774331Z' # (date)
type: full                                   # (kw) "full", "sandbox", or "linked-filter"

serdes/meta:
- id: Sample Database
  model: Database
- id: PUBLIC
  model: Schema
- id: PRODUCTS
  model: Table
- id: CATEGORY
  model: Field
- id: '0'
  model: FieldValues
```

---

## FieldUserSettings

**Source**: `src/metabase/warehouse_schema/models/field_user_settings.clj`
**Path**: `databases/.../fields/{field_name}___fieldusersettings.yaml`

User-customized field display settings that override the synced field metadata.

```yaml
# copy fields (all nullable -- only non-null values override the field's defaults)
semantic_type: null
description: Some custom Description
display_name: null
visibility_type: null
has_field_values: null
effective_type: null
coercion_strategy: null
caveats: null
points_of_interest: null
nfc_path: null
json_unfolding: null
settings: null

# transform fields
created_at: '2025-06-13T12:52:06.383265Z'  # (date)
fk_target_field_id: null                     # (fk Field) [db, schema, table, field] or null

serdes/meta:
- id: Sample Database
  model: Database
- id: PUBLIC
  model: Schema
- id: PRODUCTS
  model: Table
- id: CATEGORY
  model: Field
- id: '1'
  model: FieldUserSettings
```

---

## Dimension

**Source**: `src/metabase/warehouse_schema/models/dimension.clj`
**Inline**: nested inside Field's `dimensions` array

```yaml
dimensions:
- name: My Dimension                    # string
  type: internal                        # "internal" or "external"
  entity_id: abc123nanoid               # nanoid
  created_at: '2024-08-28T...'          # (date)
  human_readable_field_id: null         # (fk Field) [db, schema, table, field] or null
  field_id: [db, schema, table, field]  # (parent-ref)
```

---

## Segment

**Source**: `src/metabase/segments/models/segment.clj`
**Path**: `databases/.../tables/{table}/segments/{entity_id}_{slug}.yaml`

```yaml
# copy fields
name: Large Orders                       # string, required
description: Orders with total over $100  # string or null
entity_id: TNdMrOCMHrQc_UtvCbTC5       # nanoid
archived: false                         # boolean
points_of_interest: null                # string or null
caveats: null                           # string or null
show_in_getting_started: false          # boolean

# transform fields
created_at: '2024-08-28T14:28:03.451106Z'  # (date)
table_id:                                    # (fk Table) [db, schema, table]
- Sample Database
- PUBLIC
- ORDERS
creator_id: rasta@metabase.com                   # (fk User) email
definition:                                  # (mbql) portable filter definition
  database: Sample Database
  query:
    filter:
    - >
    - - field
      - - Sample Database
        - PUBLIC
        - ORDERS
        - TOTAL
      - null
    - 100
    source-table:
    - Sample Database
    - PUBLIC
    - ORDERS
  type: query

serdes/meta:
- id: TNdMrOCMHrQc_UtvCbTC5
  label: large_orders
  model: Segment
```

---

## Measure

**Source**: `src/metabase/measures/models/measure.clj`
**Path**: `databases/.../tables/{table}/measures/{entity_id}_{slug}.yaml`

```yaml
# copy fields
name: Total Revenue                      # string, required
description: null                       # string or null
entity_id: 0SHLtATxX8wbutAOlZAtM       # nanoid
archived: false                         # boolean

# transform fields
created_at: '2025-12-16T20:33:13.171335Z'  # (date)
table_id:                                    # (fk Table) [db, schema, table]
- Sample Database
- PUBLIC
- ORDERS
creator_id: rasta@metabase.com                   # (fk User) email
definition:                                  # (mbql) portable aggregation definition
  database: Sample Database
  query:
    aggregation:
    - - sum
      - - field
        - - Sample Database
          - PUBLIC
          - ORDERS
          - TOTAL
        - base-type: type/Float
    source-table:
    - Sample Database
    - PUBLIC
    - ORDERS
  type: query

serdes/meta:
- id: 0SHLtATxX8wbutAOlZAtM
  label: total_revenue
  model: Measure
```

---

## Action

**Source**: `src/metabase/actions/models.clj`
**Path**: `collections/.../actions/{entity_id}_{slug}.yaml` or `actions/{entity_id}_{slug}.yaml`

Actions have a `type` field that determines which nested sub-entity is populated.

```yaml
# copy fields
name: My Action                         # string, required
description: null                       # string or null
entity_id: hYWoE-l1BpOqmvYedqP2g       # nanoid
archived: false                         # boolean
public_uuid: null                       # UUID or null

# transform fields
created_at: '2024-08-28T14:29:47.386823Z'  # (date)
type: implicit                               # (kw) "implicit", "http", or "query"
creator_id: rasta@metabase.com                   # (fk User) email
made_public_by_id: crowberto@metabase.com    # (fk User) email or null -- another user who shared it
model_id: aqpA3mIKUnfzYUlwjuGwT             # (fk Card) entity_id of the source model
parameters: []                               # (parameters)
parameter_mappings: []                       # (parameter_mappings)

# nested -- exactly one is populated depending on type
implicit:                                    # for type: implicit
- kind: row/update                           # "row/create", "row/update", "row/delete"
http: []                                     # for type: http -- HTTPAction fields
query: []                                    # for type: query -- QueryAction fields

serdes/meta:
- id: hYWoE-l1BpOqmvYedqP2g
  label: my_action
  model: Action
```

---

## Timeline

**Source**: `src/metabase/timeline/models/timeline.clj`
**Path**: `collections/.../timelines/{entity_id}_{slug}.yaml`

```yaml
# copy fields
name: Populated Timeline                # string, required
description: null                       # string or null
entity_id: jqbQYdaqb_vXFlZnjvshP       # nanoid
archived: false                         # boolean
default: false                          # boolean
icon: star                              # "star", "cake", "mail", "warning", "bell", "cloud"

# transform fields
created_at: '2024-08-28T14:31:56.940526Z'  # (date)
collection_id: p8Zq2ud7JlSoSBXdJWIaW      # (fk Collection) entity_id
creator_id: rasta@metabase.com                  # (fk User) email

# nested
events:
- name: First Event                     # string
  description: null                     # string or null
  icon: star                            # icon name
  archived: false                       # boolean
  time_matters: true                    # boolean
  timestamp: '2020-04-11T00:00:00Z'    # ISO 8601
  timezone: US/Pacific                  # timezone string
  created_at: '2024-08-28T...'         # (date)
  creator_id: rasta@metabase.com           # (fk User) email
  serdes/meta:
  - id: null
    label: first_event
    model: TimelineEvent

serdes/meta:
- id: jqbQYdaqb_vXFlZnjvshP
  label: populated_timeline
  model: Timeline
```

---

## NativeQuerySnippet

**Source**: `src/metabase/native_query_snippets/models/native_query_snippet.clj`
**Path**: `snippets/{entity_id}_{slug}.yaml` or `snippets/{collection_id}_{slug}/{entity_id}_{slug}.yaml`

```yaml
# copy fields
name: Snippet 2                         # string, required
description: null                       # string or null
entity_id: WyQWnT23PF-SfbYLROllJ       # nanoid
archived: false                         # boolean
content: 1 = 1                          # string, the SQL snippet body
template_tags: {}                       # map of template tag definitions

# transform fields
created_at: '2024-08-28T14:36:15.328717Z'  # (date)
collection_id: null                          # (fk Collection) entity_id or null
creator_id: rasta@metabase.com                   # (fk User) email

serdes/meta:
- id: WyQWnT23PF-SfbYLROllJ
  label: snippet_2
  model: NativeQuerySnippet
```

---

## Glossary

**Source**: `src/metabase/glossary/models/glossary.clj`
**Path**: `glossary/{term}.yaml`

Glossary uses `term` as its identifier.

```yaml
# copy fields
term: foobar                            # string, required -- also the identifier
definition: It's foobar2000 actually    # string

# transform fields
created_at: '2025-09-18T13:38:26.721389Z'  # (date)
updated_at: '2025-09-18T13:38:26.721389Z'  # (date)
creator_id: internal@metabase.com            # (fk User) email

serdes/meta:
- id: foobar
  model: Glossary
```

---

## Metabot

**Source**: `src/metabase/metabot/models/metabot.clj`
**Path**: `collections/.../metabots/{entity_id}.yaml`

```yaml
# copy fields
name: Metabot                           # string, required
description: Metabot instance for internal users.  # string or null
entity_id: metabotmetabotmetabot        # nanoid
use_verified_content: false             # boolean

# transform fields
created_at: '2025-05-28T17:49:20.649159Z'  # (date)
updated_at: '2025-05-28T17:49:20.649159Z'  # (date)
collection_id: null                          # (fk Collection) entity_id or null

# nested
prompts: []                                  # array of MetabotPrompt

serdes/meta:
- id: metabotmetabotmetabot
  model: Metabot
```

### MetabotPrompt (nested)

```yaml
prompts:
- entity_id: abc123nanoid               # nanoid
  prompt: Answer questions about our data  # string
  created_at: '2025-05-28T...'          # (date)
  updated_at: '2025-05-28T...'          # (date)
  model: question                       # (kw) "question", "dashboard", etc.
  card_id: null                         # (fk Card) entity_id or null
  metabot_id: metabotmetabotmetabot     # (parent-ref)
```

---

## Channel

**Source**: `src/metabase/channel/models/channel.clj`
**Path**: `collections/channels/{name}_{slug}.yaml`

```yaml
# copy fields
name: My HTTP channel                   # string, required
description: null                       # string or null
type: channel/http                      # string
details: {}                             # map of channel config
active: true                            # boolean

# transform fields
created_at: '2024-08-28T...'            # (date)

serdes/meta:
- id: My HTTP channel
  label: my_http_channel
  model: Channel
```

---

## Document

**Source**: `src/metabase/documents/models/document.clj`
**Path**: `collections/.../documents/{entity_id}_{slug}.yaml`

```yaml
# copy fields
name: Test Document                     # string, required
entity_id: FLTBqagEX0mNl33ZZvFDa       # nanoid
archived: false                         # boolean
archived_directly: false                # boolean
content_type: application/json+vnd.prose-mirror  # string
collection_position: null               # integer or null

# transform fields
created_at: '2025-08-11T16:53:06.890467Z'  # (date)
updated_at: '2025-08-11T16:53:06.454259Z'  # (date)
collection_id: JS5JHDitDkWEtTt1-N7zr       # (fk Collection) entity_id
creator_id: rasta@metabase.com               # (fk User) email
document:                                    # (custom) ProseMirror document structure
  content:
  - attrs:
      id:
      - id: _DexsxY2EQdmhwMZU4BCs          # entity_id of embedded card
        model: Card
    type: cardEmbed
  - attrs:
      entityId:
      - id: 1z82DAj_YUJAsCZZaacxK
        model: Card
      model: card
    type: smartLink
  type: doc

serdes/meta:
- id: FLTBqagEX0mNl33ZZvFDa
  label: test_document
  model: Document
```

---

## Transform

**Source**: `src/metabase/models/transforms/transform.clj`
**Path**: `collections/.../transforms/{entity_id}_{slug}.yaml`

Transforms can be SQL-based (native query) or Python-based.

### SQL Transform

```yaml
# copy fields
name: Monthly Revenue by Category         # string, required
description: Aggregates order revenue by product category per month  # string or null
entity_id: 2s5mb75iacOqq2eE2yj3a           # nanoid
owner_email: null                            # string or null

# transform fields
created_at: '2025-11-17T08:24:54.09039Z'   # (date)
creator_id: rasta@metabase.com               # (fk User) email
owner_user_id: rasta@metabase.com            # (fk User) email or null
collection_id: M-Q4pcV0qkiyJ0kiSWECl        # (fk Collection) entity_id or null
source_database_id: Sample Database          # (fk Database) database name

source:                                      # (mbql) source definition
  query:
    database: Sample Database                # database name
    native:
      query: |-                              # SQL query string
        SELECT
          DATE_TRUNC('month', o.CREATED_AT) AS month,
          p.CATEGORY,
          COUNT(*) AS order_count,
          SUM(o.TOTAL) AS revenue
        FROM ORDERS o
        JOIN PRODUCTS p ON o.PRODUCT_ID = p.ID
        GROUP BY 1, 2
        ORDER BY 1 DESC, revenue DESC
    type: native
  type: query
  # optional incremental strategy
  source-incremental-strategy:
    checkpoint-filter: created_at_hour       # column name for checkpoint
    type: checkpoint                         # "checkpoint"

target:                                      # (mbql) target table definition
  database: Sample Database                  # database name
  name: monthly_revenue_by_category          # target table name
  schema: mb_transforms                      # target schema
  type: table                                # "table" or "table-incremental"
  # optional incremental target strategy
  target-incremental-strategy:
    type: append                             # "append"

# nested
tags:                                        # array of TransformTransformTag
- entity_id: 3osWOaYZ7HQQuGtkYTb3m
  position: 0
  tag_id: dUW7nvQHQBdA0Rx0gJckI             # (fk TransformTag) entity_id
  serdes/meta:
  - id: 3osWOaYZ7HQQuGtkYTb3m
    model: TransformTransformTag

serdes/meta:
- id: 2s5mb75iacOqq2eE2yj3a
  label: monthly_revenue_by_category
  model: Transform
```

### Python Transform

```yaml
name: Top Products by Revenue
entity_id: zFnxb5NVlyAZCg5Ok_cw7
# ... same top-level fields as SQL transform ...

source:
  body: |                                    # Python source code
    import pandas as pd

    def transform(orders, products):
        df = orders.merge(products, left_on="PRODUCT_ID", right_on="ID", suffixes=("", "_product"))
        result = df.groupby("CATEGORY").agg(
            order_count=("ID", "count"),
            total_revenue=("TOTAL", "sum")
        ).reset_index().sort_values("total_revenue", ascending=False)
        return result
  query: null                                # null for Python transforms
  source-database: 1                         # numeric DB id (not portable)
  source-tables:                             # map of parameter name -> table ref
    orders:
      database_id: 1
      schema: PUBLIC
      table: ORDERS
      table_id: 5
    products:
      database_id: 1
      schema: PUBLIC
      table: PRODUCTS
      table_id: 1
  type: python                               # "python" instead of "query"

target:
  database: Sample Database
  name: top_products_by_revenue
  schema: mb_transforms
  type: table
```

### Structured (MBQL) Transform

```yaml
source:
  query:
    database: Sample Database
    query:
      source-table:
      - Sample Database
      - PUBLIC
      - ORDERS
    type: query
  type: query
```

---

## TransformTag

**Source**: `src/metabase/models/transforms/transform_tag.clj`
**Path**: `transforms/transform_tags/{entity_id}_{slug}.yaml`

```yaml
# copy fields
entity_id: wYLcUPbtF7jVPO0duGGHR       # nanoid
built_in_type: hourly                   # "hourly", "daily", "weekly", "monthly", or null

# transform fields
name: hourly                            # (str) tag name
created_at: '2025-08-15T21:53:23.597822Z'  # (date)

serdes/meta:
- id: wYLcUPbtF7jVPO0duGGHR
  label: hourly
  model: TransformTag
```

---

## TransformJob

**Source**: `src/metabase/models/transforms/transform_job.clj`
**Path**: `transforms/transform_jobs/{entity_id}_{slug}.yaml`

```yaml
# copy fields
entity_id: lXIFa2SUrXLgaLZJx33oU       # nanoid
built_in_type: weekly                   # "hourly", "daily", "weekly", "monthly", or null
schedule: 0 0 0 ? * 1 *                # cron expression
ui_display_type: cron/builder           # "cron/builder" or "cron/custom"

# transform fields
name: Weekly job                        # (str)
description: Executes weekly transforms # (str)
created_at: '2025-09-23T12:20:31.215628Z'  # (date)

# nested
job_tags: []                            # array of TransformJobTransformTag

serdes/meta:
- id: lXIFa2SUrXLgaLZJx33oU
  label: weekly_job
  model: TransformJob
```

---

## PythonLibrary

**Source**: `enterprise/backend/src/metabase_enterprise/transforms_python/models/python_library.clj`
**Path**: `python-libraries/{entity_id}.yaml`

Shared Python code that can be imported in Python transforms via `import common`.

```yaml
# copy fields
path: common.py                         # string, file path/name
source: |-                              # string, Python source code
  import pandas as pd

  def filter_by_name(df, name):
      return df[df['name'].str.contains(name, case=False, na=False)]
entity_id: cWWH9qJPvHNB3rP2vLZrK       # nanoid

# transform fields
created_at: '2025-09-30T15:34:24.838781Z'  # (date)

serdes/meta:
- id: cWWH9qJPvHNB3rP2vLZrK
  model: PythonLibrary
```

---

## Settings

**Path**: `settings.yaml` (root level, flat map)

Not a regular entity -- a sorted map of all Metabase settings:

```yaml
aggregated-query-row-limit: null
application-colors: null
application-font: null
custom-geojson: null
enable-embedding: null
enable-nested-queries: null
metabot-enabled?: null
report-timezone: null
site-locale: en
site-name: My Company
unaggregated-query-row-limit: null
```

---

## Model Categories

### Top-level (extracted as individual files)
Card, Collection, Dashboard, Database, Table, Field, FieldValues, FieldUserSettings, Action, Channel, Document, Glossary, Measure, Metabot, NativeQuerySnippet, PythonLibrary, Segment, Setting, Timeline, Transform, TransformJob, TransformTag

### Inlined (nested inside parent entity, not separate files)
DashboardCard, DashboardCardSeries, DashboardTab, Dimension, MetabotPrompt, TimelineEvent, TransformTransformTag, TransformJobTransformTag

### Not serialized
User, Session, Permissions, PermissionsGroup, Activity, ViewLog, QueryExecution, TaskHistory, and other internal/transient models. Users are referenced by email address only.

---

## Common Metabase Types

### Base Types
`type/Text`, `type/Integer`, `type/BigInteger`, `type/Float`, `type/Decimal`, `type/Boolean`, `type/DateTime`, `type/Date`, `type/Time`, `type/JSON`, `type/Array`, `type/UUID`

### Semantic Types
`type/PK`, `type/FK`, `type/Name`, `type/Title`, `type/Description`, `type/Comment`, `type/Email`, `type/URL`, `type/ImageURL`, `type/AvatarURL`, `type/Category`, `type/Enum`, `type/City`, `type/State`, `type/ZipCode`, `type/Country`, `type/Latitude`, `type/Longitude`, `type/Number`, `type/Currency`, `type/Income`, `type/Discount`, `type/Price`, `type/GrossMargin`, `type/Cost`, `type/Quantity`, `type/Score`, `type/Percentage`, `type/CreationDate`, `type/CreationTimestamp`, `type/JoinDate`, `type/JoinTimestamp`, `type/CancelationDate`, `type/Birthdate`, `type/Source`, `type/Product`, `type/User`, `type/Subscription`, `type/Share`, `type/Owner`, `type/Company`, `type/Author`

### Entity Types (for Tables)
`entity/TransactionTable`, `entity/ProductTable`, `entity/UserTable`, `entity/EventTable`, `entity/CompanyTable`, `entity/SubscriptionTable`, `entity/GenericTable`

### Display Types (for Cards)
`table`, `bar`, `line`, `pie`, `scalar`, `row`, `area`, `combo`, `scatter`, `waterfall`, `funnel`, `map`, `pivot`, `progress`, `gauge`, `number`, `trend`, `smartscalar`, `native`, `object`
