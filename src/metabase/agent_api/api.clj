(ns metabase.agent-api.api
  "Customer-facing Agent API for headless BI applications.
  Endpoints are versioned (e.g., /v1/search) and use standard HTTP semantics."
  (:require
   [clojure.string :as str]
   [metabase.agent-api.validation :as agent-api.validation]
   [metabase.agent-lib.core :as agent-lib]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.macros.scope :as scope]
   [metabase.api.routes.common :as api.routes.common]
   [metabase.auth-identity.core :as auth-identity]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.metabot.core :as metabot]
   [metabase.metabot.tools.construct :as metabot-construct]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.field-stats :as field-stats]
   [metabase.metabot.tools.search :as metabot-search]
   [metabase.metabot.util :as metabot.u]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.server.streaming-response :as streaming-response]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;;; --------------------------------------------------- Defaults ------------------------------------------------------

(def ^:private ^:const default-field-values-limit
  "Default number of field values to return when no limit is specified."
  30)

(def ^:private ^:const default-query-row-limit
  "Default row cap when :limit is omitted from a table query request."
  200)

(def ^:private ^:const page-size
  "Rows returned per page when paginating the combined query endpoint via continuation tokens.
   Also used as the query processor's per-call row constraint."
  200)

(def ^:private ^:const max-total-row-limit
  "Ceiling on the user-requested :limit for the combined query endpoint. Agents can paginate
   through up to this many rows across pages."
  2000)

;;; ---------------------------------------------------- Helpers ------------------------------------------------------

(defn- check-tool-result
  "Extract :structured-output from a tool result, or throw with the appropriate HTTP status code.
   Tool functions return {:structured-output ...} on success,
   {:output \"error\" :status-code 4xx/5xx} on failure.
   Defaults to 404 if no status-code is provided for backwards compatibility."
  [{:keys [structured-output output status-code]}]
  (or structured-output
      (api/check false [(or status-code 404) (or output "Not found.")])))

;;; --------------------------------------------------- Schemas ------------------------------------------------------

;; Response schemas for the Agent API.
;; - Use snake_case keys in schema definitions (JSON convention)
;; - Use :encode/api transformers to convert kebab-case data from internal functions
;; - Convert keyword enum values (like :table, :metric) to strings for JSON

(mr/def ::field-type
  "A data type for a field derived from Metabase's type hierarchy."
  [:enum :boolean :date :datetime :time :number :string])

(mr/def ::field-id
  "Field id as accepted by agent_api endpoints — either a real app-DB field id (positive integer)
  or a string alias for expression/aggregation columns."
  [:or ::lib.schema.id/field :string])

(mr/def ::field
  "A field from a table or metric. field_id is the real database field ID (integer) for concrete fields,
  or a string alias for expression/aggregation columns."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:field_id ::field-id]
   [:name :string]
   [:display_name :string]
   [:type {:optional true} [:maybe ::field-type]]
   [:description {:optional true} [:maybe :string]]
   [:base_type {:optional true} [:maybe :string]]
   [:effective_type {:optional true} [:maybe :string]]
   [:semantic_type {:optional true} [:maybe :string]]
   [:database_type {:optional true} [:maybe :string]]
   [:coercion_strategy {:optional true} [:maybe :string]]
   [:field_values {:optional true} [:maybe [:sequential :any]]]])

(mr/def ::entity-type
  "The type of queryable entity."
  [:enum :table :metric])

(mr/def ::metric-summary
  "Summary of a metric associated with a table. Includes the field_id of the default time dimension for temporal breakouts."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:type [:= :metric]]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:default_time_dimension_field_id {:optional true} [:maybe ::field-id]]])

(mr/def ::segment
  "A predefined filter condition that can be applied to queries via the segment_id in filters."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]])

(mr/def ::measure
  "A reusable aggregation expression associated with a table. Reference via measure_id in the aggregations array."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]])

(mr/def ::related-table
  "A table related to the queried entity via foreign key. The related_by field indicates the FK field name."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:type [:= :table]]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:database_id {:optional true} [:maybe :int]]
   [:database_engine {:optional true} [:maybe :string]]
   [:database_schema {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:fields {:optional true} [:maybe [:sequential ::field]]]
   [:related_by {:optional true} [:maybe :string]]])

(mr/def ::table
  "Full details of a table including its fields, related tables, metrics, and segments."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:type ::entity-type]
   [:name :string]
   [:display_name :string]
   [:database_id :int]
   [:database_engine :string]
   [:database_schema {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:fields [:sequential ::field]]
   [:related_tables {:optional true} [:maybe [:sequential ::related-table]]]
   [:metrics {:optional true} [:maybe [:sequential ::metric-summary]]]
   [:measures {:optional true} [:maybe [:sequential ::measure]]]
   [:segments {:optional true} [:maybe [:sequential ::segment]]]])

(mr/def ::metric
  "A metric with its queryable dimensions and segments. The default_time_dimension_field_id is the field_id of the recommended time dimension for temporal breakouts."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:type [:= :metric]]
   [:name :string]
   [:description {:optional true} [:maybe :string]]
   [:default_time_dimension_field_id {:optional true} [:maybe ::field-id]]
   [:verified {:optional true} [:maybe :boolean]]
   [:queryable_dimensions {:optional true} [:maybe [:sequential ::field]]]
   [:segments {:optional true} [:maybe [:sequential ::segment]]]])

(mr/def ::statistics
  "Statistical summary of a field's values computed during database sync. Includes counts, percentages, numeric summaries (min/max/avg/quartiles/sd), and date ranges."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:distinct_count {:optional true} [:maybe :int]]
   [:percent_null   {:optional true} [:maybe number?]]
   [:min            {:optional true} [:maybe number?]]
   [:max            {:optional true} [:maybe number?]]
   [:avg            {:optional true} [:maybe number?]]
   [:q1             {:optional true} [:maybe number?]]
   [:q3             {:optional true} [:maybe number?]]
   [:sd             {:optional true} [:maybe number?]]
   [:percent_json   {:optional true} [:maybe number?]]
   [:percent_url    {:optional true} [:maybe number?]]
   [:percent_email  {:optional true} [:maybe number?]]
   [:percent_state  {:optional true} [:maybe number?]]
   [:average_length {:optional true} [:maybe number?]]
   [:earliest       {:optional true} [:maybe :string]]
   [:latest         {:optional true} [:maybe :string]]])

(mr/def ::field-values
  "Statistics and sample values for a specific field."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:field_id {:optional true} [:maybe ::field-id]]
   [:statistics {:optional true} [:maybe ::statistics]]
   [:values {:optional true} [:maybe [:sequential :any]]]])

(mr/def ::search-result-item
  "A table or metric returned from search."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:id :int]
   [:type [:enum "table" "metric"]]
   [:name :string]
   [:display_name {:optional true} [:maybe :string]]
   [:description {:optional true} [:maybe :string]]
   [:database_id {:optional true} [:maybe :int]]
   [:database_schema {:optional true} [:maybe :string]]
   [:verified {:optional true} [:maybe :boolean]]
   [:updated_at {:optional true} [:maybe :any]]
   [:created_at {:optional true} [:maybe :any]]])

(mr/def ::search-response
  "Search results containing tables and metrics matching the query."
  [:map {:encode/api #(update-keys % metabot.u/safe->snake_case_en)}
   [:data [:sequential ::search-result-item]]
   [:total_count :int]])

;;; --------------------------------------------------- Endpoints ----------------------------------------------------

(api.macros/defendpoint :get "/v1/ping" :- [:map [:message :string]]
  "Health check endpoint for the Agent API."
  {:scope :unchecked}
  []
  {:message "pong"})

(api.macros/defendpoint :get "/v1/table/:id" :- ::table
  "Get details for a table by ID."
  {:scope metabot/agent-table-read
   :tool  {:name "get_table"
           :description "Get details about a table including its fields, related tables, and metrics."}}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [with-fields with-field-values with-related-tables with-metrics with-measures with-segments]
    :or   {with-fields true, with-field-values false, with-related-tables true,
           with-metrics true, with-measures false, with-segments false}}
   :- [:map
       [:with-field-values   {:optional true} [:maybe :boolean]]
       [:with-fields         {:optional true} [:maybe :boolean]]
       [:with-related-tables {:optional true} [:maybe :boolean]]
       [:with-metrics        {:optional true} [:maybe :boolean]]
       [:with-measures       {:optional true} [:maybe :boolean]]
       [:with-segments       {:optional true} [:maybe :boolean]]]]
  (check-tool-result
   (entity-details/get-table-details
    {:entity-type          :table
     :entity-id            id
     :with-fields?         with-fields
     :with-field-values?   with-field-values
     :with-related-tables? with-related-tables
     :with-metrics?        with-metrics
     :with-measures?       with-measures
     :with-segments?       with-segments})))

(api.macros/defendpoint :get "/v1/table/:id/field/:field-id/values" :- ::field-values
  "Get statistics and sample values for a table field."
  {:scope metabot/agent-table-read
   :tool  {:name "get_table_field_values"
           :description "Get sample values and statistics for a field in a table."}}
  [{:keys [id field-id]} :- [:map
                             [:id       ms/PositiveInt]
                             [:field-id {:tool/description "Field identifier in the format '<prefix><entity-id>-<field-index>', e.g. 't123-0' for a table field."}
                              ms/NonBlankString]]]
  (check-tool-result
   (field-stats/field-values
    {:entity-type "table"
     :entity-id   id
     :field-id    field-id
     :limit       (or (request/limit) default-field-values-limit)})))

(api.macros/defendpoint :get "/v1/metric/:id" :- ::metric
  "Get details for a metric by ID."
  {:scope metabot/agent-metric-read
   :tool  {:name "get_metric"
           :description "Get details about a metric including its queryable dimensions."}}
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [with-default-temporal-breakout with-field-values with-queryable-dimensions with-segments]
    :or   {with-default-temporal-breakout true, with-field-values false,
           with-queryable-dimensions true, with-segments false}}
   :- [:map
       [:with-default-temporal-breakout {:optional true} [:maybe :boolean]]
       [:with-field-values              {:optional true} [:maybe :boolean]]
       [:with-queryable-dimensions      {:optional true} [:maybe :boolean]]
       [:with-segments                  {:optional true} [:maybe :boolean]]]]
  (check-tool-result
   (entity-details/get-metric-details
    {:metric-id                       id
     :with-default-temporal-breakout? with-default-temporal-breakout
     :with-field-values?              with-field-values
     :with-queryable-dimensions?      with-queryable-dimensions
     :with-segments?                  with-segments})))

(api.macros/defendpoint :get "/v1/metric/:id/field/:field-id/values" :- ::field-values
  "Get statistics and sample values for a metric field."
  {:scope metabot/agent-metric-read
   :tool  {:name "get_metric_field_values"
           :description "Get sample values and statistics for a field in a metric."}}
  [{:keys [id field-id]} :- [:map
                             [:id       ms/PositiveInt]
                             [:field-id {:tool/description "Field identifier in the format '<prefix><entity-id>-<field-index>', e.g. 'c456-2' for a metric field."}
                              ms/NonBlankString]]]
  (check-tool-result
   (field-stats/field-values
    {:entity-type "metric"
     :entity-id   id
     :field-id    field-id
     :limit       (or (request/limit) default-field-values-limit)})))

(defn- coerce-query-list
  "Defensive coercion for `/v1/search`'s query arguments. Some MCP clients (notably
   Codex) serialize array args through a string layer, so a caller that intended to
   send `[\"orders\"]` may actually send `\"[\\\"orders\\\"]\"`. Accept either shape:
   an array is returned as-is; a string that parses as a JSON array of non-blank
   strings is unwrapped; any other string is treated as a single-element query."
  [v]
  (cond
    (nil? v)        nil
    (sequential? v) v
    (string? v)     (or (try
                          (let [parsed (json/decode+kw v)]
                            (when (and (sequential? parsed)
                                       (every? #(and (string? %) (not (str/blank? %))) parsed))
                              parsed))
                          (catch Exception _ nil))
                        [v])
    :else           v))

(api.macros/defendpoint :post "/v1/search" :- ::search-response
  "Search for tables and metrics.

  Supports both term-based and semantic search queries. Results are ranked using
  Reciprocal Rank Fusion when both query types are provided."
  {:scope metabot/agent-search
   :tool  {:name "search"
           :description (str "Search for tables and metrics in Metabase. "
                             "Use term_queries for keyword search or semantic_queries for natural language search. "
                             "Both arguments are arrays of strings, for example term_queries: [\"orders\", \"revenue\"].")
           :annotations {:read-only? true}}}
  [_route-params
   _query-params
   {term-queries     :term_queries
    semantic-queries :semantic_queries}
   :- [:map
       [:term_queries {:optional true
                       :tool/description "Keyword search queries as an array of strings, for example [\"orders\", \"revenue\"]."}
        [:maybe [:or [:sequential ms/NonBlankString] ms/NonBlankString]]]
       [:semantic_queries {:optional true
                           :tool/description "Natural-language search queries as an array of strings, for example [\"how much revenue did we make\"]."}
        [:maybe [:or [:sequential ms/NonBlankString] ms/NonBlankString]]]]]
  (let [results (metabot-search/search
                 {:term-queries     (or (coerce-query-list term-queries) [])
                  :semantic-queries (or (coerce-query-list semantic-queries) [])
                  :entity-types     ["table" "metric"]
                  :limit            (or (request/limit) 50)})]
    {:data        results
     :total_count (count results)}))

;;; ------------------------------------------------ Construct Query -------------------------------------------------

(mr/def ::program-request
  "Request body for /v2/construct-query and /v2/query.
  An agent-lib structured program with `:source` and `:operations`. The top-level
  `:source` must reference a database entity (`table`, `card`, `dataset`, or
  `metric`); `context` and nested `program` sources are rejected at the HTTP
  boundary by [[evaluate-program-for-execution]] because they require an
  in-process evaluation context."
  agent-lib/program-schema)

(mr/def ::construct-query-response
  "Response containing a base64-encoded MBQL query for use with /v1/execute."
  [:map
   [:query ms/NonBlankString]])

(def ^:private allowed-program-source-types
  "Top-level program source types that the HTTP boundary accepts. `context` and
  nested `program` sources require an in-process evaluation context and are
  rejected here."
  #{"table" "card" "dataset" "metric"})

(def ^:private construct-query-tool-description
  "User-facing description for the `construct_query` MCP tool. Tuned to give the
  LLM enough structure to produce valid programs without reproducing the full
  reference — covers the program shape, canonical operator names, reference forms,
  and a few worked examples spanning the common patterns."
  (str
   "Construct a Metabase MBQL query from a structured program. The body is the program itself — no envelope — shaped:\n"
   "`{\"source\": {...}, \"operations\": [...]}`\n"
   "Returns `{\"query\": \"<base64>\"}` — pass the string to `execute_query`.\n"
   "\n"
   "IMPORTANT: field IDs must come from entity-detail endpoints (`/v1/table/{id}`, `/v1/metric/{id}`). "
   "Do not invent IDs. The backend repairs minor mistakes (aliases, casing, over-wrapping) before validation, "
   "but the canonical names below always work.\n"
   "\n"
   "## Workflow\n"
   "1. Use `search_entities` / entity-detail tools to find the table/metric/model and its fields.\n"
   "2. Call `construct_query` with the program. You get back `{\"query\": \"<base64>\"}`.\n"
   "3. Pass that string to `execute_query` or `visualize_query`.\n"
   "Never embed IDs you did not read from a metadata endpoint — invented IDs will fail at execution.\n"
   "\n"
   "## Source\n"
   "One of `{\"type\": T, \"id\": N}`:\n"
   "- `table` — a database table\n"
   "- `card` — a saved question\n"
   "- `dataset` — a model (model card id)\n"
   "- `metric` — a metric (supplies its own aggregation and time dimension; extra aggregates usually unnecessary)\n"
   "\n"
   "## Top-level operations (applied in order)\n"
   "Each operation is `[\"op\", arg, ...]`:\n"
   "- `[\"filter\", clause]` — add a filter\n"
   "- `[\"aggregate\", agg-clause]` — add an aggregation\n"
   "- `[\"breakout\", ref-or-bucketed]` — add a grouping dimension\n"
   "- `[\"expression\", \"Name\", expr]` — define a named computed column (reference later with `expression-ref`)\n"
   "- `[\"with-fields\", [refs...]]` — restrict returned columns\n"
   "- `[\"order-by\", ref]` or `[\"order-by\", ref, \"asc\"|\"desc\"]` — sort\n"
   "- `[\"limit\", N]` — cap rows\n"
   "- `[\"join\", join-clause]` — join another entity\n"
   "- `[\"append-stage\"]` — start a new query stage (needed to filter on aggregated values)\n"
   "- `[\"with-page\", {\"page\": N, \"items\": M}]` — paginate\n"
   "\n"
   "## References (used as arguments inside operations)\n"
   "- `[\"field\", N]` — database field by id. Do NOT put options in a third slot (no `[\"field\", id, {...}]`); wrap instead\n"
   "- `[\"expression-ref\", \"Name\"]` — a named expression defined earlier\n"
   "- `[\"aggregation-ref\", N]` — the Nth `aggregate` defined earlier (0-based). REQUIRED when sorting by an aggregated value\n"
   "- `[\"measure\", N]` — a pre-defined measure on the source entity\n"
   "- `[\"with-temporal-bucket\", ref, unit]` — temporal bucketing. `unit` is one of: `minute` `hour` `day` `week` `month` `quarter` `year`. Also `day-of-week`, `hour-of-day`, etc. (extraction aliases)\n"
   "- `[\"with-binning\", ref, {\"strategy\": \"num-bins\"|\"bin-width\"|\"default\", ...}]` — numeric binning. E.g. `{\"strategy\": \"num-bins\", \"num-bins\": 10}`\n"
   "\n"
   "## Filter operators\n"
   "`=`, `!=`, `<`, `<=`, `>`, `>=`, `between`, `in`, `not-in`, `is-null`, `not-null`, `is-empty`, `not-empty`, "
   "`contains`, `does-not-contain`, `starts-with`, `ends-with`, `time-interval`, `and`, `or`, `not`, `segment`.\n"
   "Examples: `[\"=\", [\"field\", 101], \"active\"]`, `[\"between\", [\"field\", 305], \"2024-01-01\", \"2024-12-31\"]`, "
   "`[\"in\", [\"field\", 302], [10, 20, 30]]`, `[\"time-interval\", [\"field\", 305], -7, \"day\"]`.\n"
   "\n"
   "## Aggregation operators\n"
   "`count`, `sum`, `avg`, `min`, `max`, `distinct`, `median`, `stddev`, `var`, `percentile`, "
   "`count-where`, `sum-where`, `distinct-where`, `share`, `cum-count`, `cum-sum`. "
   "Examples: `[\"count\"]`, `[\"sum\", [\"field\", 302]]`, `[\"count-where\", [\"=\", [\"field\", 101], \"completed\"]]`.\n"
   "\n"
   "## Temporal helpers (for use in `expression` or as grouping)\n"
   "`get-year`, `get-quarter`, `get-month`, `get-week`, `get-day`, `get-day-of-week`, `get-hour`, `get-minute`, "
   "`datetime-add`, `datetime-diff`, `datetime-subtract`, `now`, `today`, `relative-datetime`, `absolute-datetime`, "
   "`with-temporal-bucket`, `convert-timezone`.\n"
   "\n"
   "## Examples\n"
   "Top 5 customers by revenue:\n"
   "```\n"
   "{\"source\": {\"type\": \"table\", \"id\": 42},\n"
   " \"operations\": [[\"aggregate\", [\"sum\", [\"field\", 302]]],\n"
   "                [\"breakout\", [\"field\", 101]],\n"
   "                [\"order-by\", [\"aggregation-ref\", 0], \"desc\"],\n"
   "                [\"limit\", 5]]}\n"
   "```\n"
   "Monthly revenue from a metric (metric supplies the aggregation):\n"
   "```\n"
   "{\"source\": {\"type\": \"metric\", \"id\": 10},\n"
   " \"operations\": [[\"breakout\", [\"with-temporal-bucket\", [\"field\", 305], \"month\"]],\n"
   "                [\"order-by\", [\"with-temporal-bucket\", [\"field\", 305], \"month\"], \"asc\"]]}\n"
   "```\n"
   "Filter on an aggregated value (requires `append-stage`):\n"
   "```\n"
   "{\"source\": {\"type\": \"table\", \"id\": 42},\n"
   " \"operations\": [[\"aggregate\", [\"sum\", [\"field\", 302]]],\n"
   "                [\"breakout\", [\"field\", 101]],\n"
   "                [\"append-stage\"],\n"
   "                [\"filter\", [\">\", [\"aggregation-ref\", 0], 1000]]]}\n"
   "```\n"
   "Named expression referenced later:\n"
   "```\n"
   "{\"source\": {\"type\": \"table\", \"id\": 42},\n"
   " \"operations\": [[\"expression\", \"Discount\", [\"-\", [\"field\", 302], [\"field\", 303]]],\n"
   "                [\"aggregate\", [\"sum\", [\"expression-ref\", \"Discount\"]]]]}\n"
   "```\n"
   "Previous-period comparison with `offset` (stay in the SAME stage — do NOT add `append-stage`):\n"
   "```\n"
   "{\"source\": {\"type\": \"table\", \"id\": 42},\n"
   " \"operations\": [[\"aggregate\", [\"sum\", [\"field\", 302]]],\n"
   "                [\"aggregate\", [\"offset\", [\"sum\", [\"field\", 302]], -1]],\n"
   "                [\"breakout\", [\"with-temporal-bucket\", [\"field\", 305], \"month\"]]]}\n"
   "```\n"
   "\n"
   "## Rules & common pitfalls\n"
   "Stage boundaries (most common source of errors):\n"
   "- Filtering on an aggregated value REQUIRES `append-stage` between the aggregate/breakout and the filter "
   "(see the \"filter on aggregated value\" example). Without it, `aggregation-ref` resolution fails in the same stage.\n"
   "- Defining an `expression` that uses `aggregation-ref` also REQUIRES `append-stage` first.\n"
   "- EXCEPTION: `offset` (previous-period comparison) stays in the same stage as its base aggregation and breakout — do NOT add `append-stage` for it.\n"
   "\n"
   "Refs & shapes:\n"
   "- Aggregation helpers take field refs, not bare IDs: `[\"sum\", [\"field\", 201]]`, never `[\"sum\", 201]`.\n"
   "- To sort by an aggregated value, use `[\"aggregation-ref\", N]` — not the original expression.\n"
   "- Do NOT put options in a third slot of `field` (no `[\"field\", id, {...}]`). Wrap instead: `[\"with-temporal-bucket\", [\"field\", id], \"month\"]` or `[\"with-binning\", [\"field\", id], {...}]`.\n"
   "- `case` takes `[[condition, value], ...]` branches and an optional bare fallback as the THIRD arg — do not wrap it as `{\"default\": ...}`. Omit the third arg when there is no fallback.\n"
   "- JSON objects appear only where a helper explicitly calls for one (e.g. `with-page`, `with-binning`). Everywhere else, use operator tuples.\n"
   "\n"
   "Joins & related tables:\n"
   "- If the source table's detail response already surfaces a related table's fields, use those field refs directly — no explicit join needed.\n"
   "- Reach for `join` + `with-join-conditions` only for custom aliases, self-joins, explicit joined-field selection, or when direct related-field refs are unavailable.\n"
   "- If an explicit join returns a permission error, the underlying table is not accessible — surface the error, do not retry with implicit refs.\n"
   "\n"
   "Metrics & dates:\n"
   "- A `metric` source already provides its own aggregation and time dimension. Add only the additional breakouts/filters you need.\n"
   "- When the user asks for an exact year (e.g. 2024), use `[\"=\", [\"field\", year_field], 2024]` or a `between` with explicit dates — not relative filters like `time-interval`.\n"))

(defn- evaluate-program-to-live-query
  "Resolve a program's source entity, evaluate the program via agent-lib, and return
  the live lib query (with lib metadata attached)."
  [program]
  (let [source-type (get-in program [:source :type])]
    (api/check (contains? allowed-program-source-types source-type)
               [400 (str "top-level program source must be one of: "
                         (str/join ", " (sort allowed-program-source-types)))]))
  (let [source-entity (metabot-construct/program-source->source-entity (:source program))
        result        (metabot-construct/execute-program source-entity nil program)]
    (get-in result [:structured-output :query])))

(defn- evaluate-program-for-execution
  "Evaluate a program and return a plain MBQL 5 query map suitable for serialization
  into a continuation token and execution by the QP."
  [program]
  (lib/prepare-for-serialization (evaluate-program-to-live-query program)))

(api.macros/defendpoint :post "/v2/construct-query" :- ::construct-query-response
  "Construct an MBQL query from a structured agent-lib program.

  The body is the program itself: a JSON object with `source` (identifying the
  table/card/dataset/metric to query) and `operations` (an array of operator
  tuples). Returns a base64-encoded MBQL query that can be executed via
  /v1/execute. See the agent_api reference for the full program syntax."
  {:scope metabot/agent-query-construct
   :tool  {:name "construct_query"
           :description construct-query-tool-description
           :annotations {:read-only? true :idempotent? true}}}
  [_route-params
   _query-params
   program :- ::program-request]
  (let [query (evaluate-program-for-execution program)]
    {:query (-> query json/encode u/encode-base64)}))

;;; ------------------------------------------------- Combined Query -------------------------------------------------

(defn- generate-continuation-token
  "Build a base64-encoded continuation token carrying the query and next-page pagination info.
   :limit is the user's total row cap across all pages, not the per-page size."
  [query-map total-limit page]
  (-> {:query      query-map
       :pagination {:limit total-limit :page (inc page)}}
      json/encode
      u/encode-base64))

(defn- decode-continuation-token
  "Decode a base64-encoded continuation token into {:query ... :pagination ...}.
   The token is client-supplied, so sanity-check the pagination ints to turn
   garbage into a 400 rather than a downstream 500. This is robustness, not a
   security boundary — a caller can always issue a fresh program to run any
   query they want."
  [token]
  (let [decoded (-> token u/decode-base64 json/decode+kw)
        {:keys [limit page]} (:pagination decoded)]
    (api/check (and (int? limit) (pos? limit))
               [400 "Invalid continuation token: limit must be a positive integer"])
    (api/check (and (int? page) (pos? page))
               [400 "Invalid continuation token: page must be a positive integer"])
    decoded))

(defn- total-row-limit
  "The user's requested :limit, defaulted when absent and capped at the combined
   endpoint's hard maximum. This is the app-level total-row budget enforced across
   paginated responses; each page's QP-level cap comes from `:page.items`, which
   `remaining-page-rows` clamps to respect this total."
  [live-query]
  (min (or (lib/current-limit live-query) default-query-row-limit)
       max-total-row-limit))

(defn- rows-before-page
  "Total rows consumed by the pages preceding `page`. Single source of truth for
   the page-size * (page - 1) arithmetic used by both sizing and pagination-exit."
  [page]
  (* (dec page) page-size))

(defn- remaining-page-rows
  "Rows to request for this page, respecting the user's total cap.
   Returns at most page-size, and never more than remaining rows under the cap."
  [total-limit page]
  (max 0 (min page-size (- total-limit (rows-before-page page)))))

(defn- more-pages-available?
  "True when this page was filled to its requested size *and* the total cap still
   has room for more rows — i.e. we should emit a continuation token."
  [page total-limit rows-returned items]
  (and (= rows-returned items)
       (< (rows-before-page (inc page)) total-limit)))

(defn- apply-page-to-query
  "Set `:page` on the last stage of a serialized MBQL 5 query map. Operates on the
  plain-map form because the continuation-token path only has that shape available —
  rehydrating to a live lib query here would require a metadata provider we don't
  currently plumb through the token."
  [query-map page items]
  (let [stages   (:stages query-map)
        last-idx (dec (count stages))]
    (assoc-in query-map [:stages last-idx :page] {:page page :items items})))

(defn- prepare-agent-query
  "Apply standard Agent API query preparation: middleware defaults and execution info."
  [query]
  (-> query
      (update-in [:middleware :js-int-to-string?] (fnil identity true))
      qp/userland-query-with-default-constraints
      (update :info merge {:executed-by api/*current-user-id*
                           :context     :agent})))

(defn- prepare-combined-query
  "Apply the tighter row cap used by the combined query endpoint. Each page is bounded
   by page-size; the user's total-limit is enforced separately via pagination."
  [query]
  (assoc (prepare-agent-query query)
         :constraints {:max-results           page-size
                       :max-results-bare-rows page-size}))

(mr/def ::query-request
  "Request body for /v2/query. Accepts either a structured program or a continuation_token."
  [:multi {:dispatch (fn [m]
                       (if (:continuation_token m) :continuation :program))}
   [:continuation [:map [:continuation_token ms/NonBlankString]]]
   [:program      ::program-request]])

(defn- initial-page-state
  "Normalize the two /v2/query entry points into a single {:query :total-limit :page}
   shape. A fresh program evaluates the user's program and computes a total-row budget
   from its `:limit`; a continuation token carries that state from a prior response."
  [body]
  (if-let [token (:continuation_token body)]
    (let [{:keys [query pagination]} (decode-continuation-token token)]
      {:query query :total-limit (:limit pagination) :page (:page pagination)})
    (let [live-query (evaluate-program-to-live-query body)]
      {:query       (lib/prepare-for-serialization live-query)
       :total-limit (total-row-limit live-query)
       :page        1})))

(api.macros/defendpoint :post "/v2/query"
  :- (streaming-response/streaming-response-schema ::query-response)
  "Execute a structured program and stream the results, with continuation-token pagination.

  Accepts either a program (same shape as /v2/construct-query) or a
  `continuation_token` from a previous response. Returns results with column
  metadata and an optional `continuation_token` for fetching the next page."
  {:scope "agent:query"
   :tool  {:name "query"
           :description (str "Execute a Metabase query from a structured program and return "
                             "results with column metadata. If more rows are available, the "
                             "response includes a continuation_token — pass it back to get the "
                             "next page.\n\n"
                             "The body is either a structured program (see construct_query) or "
                             "{\"continuation_token\": \"...\"} from a previous response.")}}
  [_route-params
   _query-params
   body :- ::query-request]
  (let [{:keys [query total-limit page]} (initial-page-state body)
        items           (remaining-page-rows total-limit page)
        mbql5-with-page (apply-page-to-query query page items)]
    (qp.streaming/streaming-response
     [rff :api]
      (qp/process-query
       (prepare-combined-query mbql5-with-page)
       (qp.streaming/transforming-query-response
        rff
        (fn [result]
          (assoc result :continuation_token
                 (when (more-pages-available? page total-limit (:row_count result) items)
                   (generate-continuation-token query total-limit page)))))))))

;;; ------------------------------------------------- Execute Query --------------------------------------------------

(mr/def ::execute-query-request
  "Request schema for /v1/execute. Accepts a base64-encoded MBQL query."
  [:map
   [:query {:tool/description "A base64-encoded query string returned by /v1/construct-query. Do not construct this value manually."}
    ms/NonBlankString]])

(mr/def ::column-metadata
  "Metadata for a single result column."
  [:map
   [:name           :string]
   [:base_type      :string]
   [:effective_type {:optional true} [:maybe :string]]
   [:display_name   :string]])

(mr/def ::execute-query-response
  "Response from query execution. The HTTP status is always 202 because results are streamed —
   check the `status` field to determine success or failure."
  [:map
   [:status       [:enum :completed :failed]]
   [:data         {:optional true}
    [:map
     [:cols [:sequential ::column-metadata]]
     [:rows [:sequential [:sequential :any]]]]]
   [:row_count    {:optional true} :int]
   [:running_time {:optional true} :int]
   [:error        {:optional true} :string]])

(mr/def ::query-response
  "Extends ::execute-query-response with an optional continuation_token for pagination."
  [:merge ::execute-query-response
   [:map [:continuation_token {:optional true} [:maybe :string]]]])

(api.macros/defendpoint :post "/v1/execute"
  :- (streaming-response/streaming-response-schema ::execute-query-response)
  "Execute an MBQL query and return results.

  Accepts a base64-encoded MBQL query (as returned by /v1/construct-query) and executes it,
  returning results with column metadata.

  Response format:
  - On success: {:data {:cols [...] :rows [...]} :row_count N :status :completed :running_time M}
  - On failure: {:status :failed :error \"message\" ...}

  Standard userspace query limits are enforced (2000 rows for simple queries, 10000 for aggregated)."
  {:scope metabot/agent-query-execute
   :tool  {:name "execute_query"
           :description "Execute a previously constructed query and return the results with column metadata, row count, and execution time."}}
  [_route-params
   _query-params
   {encoded-query :query} :- ::execute-query-request]
  (let [query (-> encoded-query
                  u/decode-base64
                  json/decode+kw)]
    (qp.streaming/streaming-response [rff :api]
      (qp/process-query (prepare-combined-query query) rff))))

;;; ------------------------------------------------- Authentication -------------------------------------------------
;;
;; The Agent API supports two authentication modes:
;;
;; 1. **Session-based**: Client exchanges JWT at `/auth/sso` endpoint to get a session token,
;;    then passes it via `X-Metabase-Session` header. The standard Metabase session middleware
;;    handles validation and expiration checking automatically.
;;
;; 2. **Stateless JWT**: Client passes a JWT via `Authorization: Bearer <jwt>` header.
;;    The JWT is validated using the configured shared secret and max-age settings.
;;    Good for simple integrations and one-off API calls.

(defn- extract-bearer-token
  "Extract the token from a Bearer authorization header."
  [auth-header]
  (when (and auth-header (str/starts-with? (u/lower-case-en auth-header) "bearer "))
    (str/trim (subs auth-header 7))))

(defn- error-response
  "Create a 401 error response with structured JSON body."
  [error-type message]
  {:status  401
   :headers {"Content-Type" "application/json"}
   :body    {:error   error-type
             :message message}})

;;; -------------------------------------------- Stateless JWT Authentication --------------------------------------------

(defn- authenticate-with-jwt
  "Authenticate a request using a stateless JWT. Returns `{:user <user>}` on success, or
   `{:error <type> :message <msg>}` on failure. Does NOT create a session.

   Uses auth-identity/authenticate to validate the JWT, which reuses the same implementation as the /auth/sso endpoint
   and handles all settings validation.

   When the JWT contains a `\"scope\"` claim, the result includes `:scopes` — a parsed set of scope strings — so that
   [[enforce-authentication]] can attach it to the request for downstream scope enforcement."
  [token]
  (let [result (auth-identity/authenticate :provider/jwt {:token token})]
    (if (:success? result)
      ;; JWT is valid - look up user from the email extracted by the JWT provider
      ;; The provider uses jwt-attribute-email setting to extract the email from claims
      (if-let [user (when-let [email (get-in result [:user-data :email])]
                      (t2/select-one :model/User :%lower.email (u/lower-case-en email) :is_active true))]
        (let [scope-entry (-> result :jwt-data (find :scope))]
          (cond-> {:user user}
            scope-entry
            (assoc :scopes (or (scope/parse-scopes (val scope-entry)) #{}))))
        ;; Don't reveal whether the user exists or not - use same error as invalid JWT
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."})
      ;; Authentication failed - map error to agent API format
      (case (:error result)
        :jwt-not-enabled {:error   "jwt_not_configured"
                          :message "JWT authentication is not configured. Set the JWT shared secret in admin settings."}
        ;; Default: use generic invalid JWT message (don't leak details)
        {:error   "invalid_jwt"
         :message "Invalid or expired JWT token."}))))

;;; -------------------------------------------------- Middleware ----------------------------------------------------

(defn- enforce-authentication
  "Middleware that ensures requests are authenticated.

   Ensures `:token-scopes` is present on authenticated requests.

   - For **session-authenticated** requests (where `:metabase-user-id` is already set by
     upstream middleware), preserves any pre-existing `:token-scopes` value if present,
     otherwise defaults to `#{::scope/unrestricted}` for unrestricted access.
   - For **JWT-authenticated** requests, derives `:token-scopes` from the JWT when a
     `\"scope\"` claim is present, falls back to any pre-existing `:token-scopes` on the
     request, and finally defaults to `#{::scope/unrestricted}` for unscoped JWTs.

   This ensures downstream scope enforcement never has to special-case nil within the
   agent API."
  [handler]
  (fn [{:keys [headers metabase-user-id token-scopes] :as request} respond raise]
    (cond
      ;; Already authenticated via X-Metabase-Session or synthetic request (e.g. MCP dispatch).
      ;; Preserve existing :token-scopes when present (MCP sets them on the synthetic request).
      metabase-user-id
      (handler (cond-> request
                 (not token-scopes) (assoc :token-scopes #{::scope/unrestricted}))
               respond raise)

      ;; Not authenticated via session - check for Bearer JWT
      :else
      (let [auth-header  (get headers "authorization")
            bearer-token (extract-bearer-token auth-header)]
        (cond
          ;; No authorization header and no session
          (nil? auth-header)
          (respond (error-response "missing_authorization"
                                   "Authentication required. Use X-Metabase-Session header or Authorization: Bearer <jwt>."))

          ;; Authorization header present but not Bearer format
          (nil? bearer-token)
          (respond (error-response "invalid_authorization_format"
                                   "Authorization header must use Bearer scheme: Authorization: Bearer <jwt>"))

          ;; Validate JWT
          :else
          (let [result (authenticate-with-jwt bearer-token)]
            (if-let [user (:user result)]
              (do
                (when (and (:scopes result) token-scopes (not= (:scopes result) token-scopes))
                  (log/warn "JWT scopes" (:scopes result)
                            "differ from pre-existing token-scopes" token-scopes))
                (request/with-current-user (:id user)
                  (handler (assoc request :token-scopes (or (:scopes result)
                                                            token-scopes
                                                            #{::scope/unrestricted}))
                           respond raise)))
              (respond (error-response (:error result) (:message result))))))))))

(def +auth
  "Agent API authentication middleware. Supports both session-based and stateless JWT authentication."
  (api.routes.common/wrap-middleware-for-open-api-spec-generation enforce-authentication))

(def +agent-api-enabled
  "Wrap routes so they may only be accessed when the Agent API is enabled."
  agent-api.validation/+agent-api-enabled)

;;; ---------------------------------------------------- Routes ------------------------------------------------------

(def ^{:arglists '([request respond raise])} routes
  "`/api/agent/` routes."
  (api.macros/ns-handler *ns* +auth))
