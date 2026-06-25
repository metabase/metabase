(ns metabase.metabot.tools.construct
  "Notebook query construction tool wrappers."
  (:require
   [metabase.agent-lib.representations :as repr]
   [metabase.agent-lib.representations.repair :as repr.repair]
   [metabase.agent-lib.representations.resolve :as repr.resolve]
   [metabase.api.common :as api]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.content-store :as shared.content-store]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.tools.util :as tools.u]
   [metabase.models.serialization.resolve :as serdes.resolve]
   [metabase.models.serialization.resolve.mp :as resolve.mp]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Schema ------------------------------------------------

(def ^:private construct-visualization-schema
  [:map {:closed true}
   [:chart_type :string]])

(def ^:private construct-notebook-query-json-schema
  "Hand-authored JSON Schema for the `:query` argument, attached to the deliberately open,
  property-less malli `:map` via a `:json-schema` override. It does not participate in validation —
  it only replaces the schema we hand the LLM. Malli would otherwise emit an empty-`properties`
  object, which weaker models (e.g. gpt-4.1-mini) read as \"this object has no fields\" and answer
  with `{}`; the structured `:required`/`:properties` here stop that, and the prose carries the
  per-clause shape JSON Schema can't express well."
  {:type        "object"
   :description (str "An MBQL 5 query as a JSON **object** (never a quoted string) matching "
                     "`metabase.lib.schema/external-query`. The FIRST stage MUST contain exactly one of `source-table` "
                     "(a portable FK `[\"<db-name>\", \"<schema-or-null>\", \"<table-name>\"]`) or `source-card` "
                     "(an entity_id string) — the target database is inferred from it; there is no top-level "
                     "`database` field. Every clause is `[\"<op>\", {<options>}, ...args]` with a mandatory "
                     "(possibly empty) options map at position 1, and every field reference is `[\"field\", {}, "
                     "[\"<db>\", \"<schema>\", \"<table>\", \"<field>\"]]`. Minimal example — count of orders by "
                     "month: `{\"lib/type\": \"mbql/query\", \"stages\": [{\"lib/type\": \"mbql.stage/mbql\", "
                     "\"source-table\": [\"Sample Database\", \"PUBLIC\", \"ORDERS\"], \"aggregation\": "
                     "[[\"count\", {}]], \"breakout\": [[\"field\", {\"temporal-unit\": \"month\"}, "
                     "[\"Sample Database\", \"PUBLIC\", \"ORDERS\", \"CREATED_AT\"]]]}]}`. Load the "
                     "`construct-notebook-query-*` skills for the full operator catalog, joins, expressions, "
                     "and multi-stage rules.")
   :required    ["lib/type" "stages"]
   :properties  {"lib/type" {:type        "string"
                             :const       "mbql/query"
                             :description "Must be the literal string `mbql/query`."}
                 "stages"   {:type        "array"
                             :minItems    1
                             :description (str "Non-empty array of query stages. The FIRST stage must carry the "
                                               "source (`source-table` or `source-card`); later stages read from "
                                               "the previous one.")
                             :items
                             {:type       "object"
                              :properties {"lib/type"     {:type "string" :const "mbql.stage/mbql"}
                                           "source-table" {:type        "array"
                                                           :minItems    3
                                                           :maxItems    3
                                                           :items       {:type "string"}
                                                           :description "Portable FK `[<db-name>, <schema-or-null>, <table-name>]`."}
                                           "source-card"  {:type        "string"
                                                           :description "entity_id of a saved question/model used as the source."}
                                           ;; Each clause is itself a `["<op>", {opts}, ...args]` array; the inner
                                           ;; `items {}` (any) keeps the shape open while satisfying the API's
                                           ;; requirement that every `array` schema declare `items`.
                                           "aggregation"  {:type "array" :items {:type "array" :items {}}}
                                           "breakout"     {:type "array" :items {:type "array" :items {}}}
                                           "filters"      {:type "array" :items {:type "array" :items {}}}
                                           "fields"       {:type "array" :items {:type "array" :items {}}}
                                           "order-by"     {:type "array" :items {:type "array" :items {}}}
                                           "joins"        {:type "array" :items {:type "object"}}
                                           "expressions"  {:type "object"}}}}}})

(def ^:private construct-notebook-query-args-schema
  "Args schema for `construct_notebook_query`.

  `:query` is a JSON object matching the canonical portable MBQL 5 wire format
  ([[metabase.lib.schema/external-query]]). The structural shape (stages, clauses, portable
  FKs, etc.) is documented for the LLM at
  `resources/metabot/prompts/tools/construct_notebook_query.md`.

  Validation against `::external-query` happens at the entry-point boundaries (HTTP defendpoint
  via the string-transformer, `execute-representations-query` post-repair via
  `lib.normalize/normalize ::lib.schema/query`); the args schema here only asserts `:query`
  is map-shaped so the LLM-input forgiveness layer in repair has a chance to fix common
  shortcuts (missing `{}` options, etc.). Per `repr-plan.md` step 13, this schema deliberately
  omits `:source_entity` and `:referenced_entities` — the query body is self-describing."
  [:map {:closed true}
   [:reasoning {:optional true} :string]
   ;; Validation stays a fully open, property-less `:map` (the repair layer fixes LLM shortcuts); the
   ;; `:json-schema` override only changes what the LLM sees. See [[construct-notebook-query-json-schema]].
   [:query [:map {:json-schema construct-notebook-query-json-schema}]]
   [:visualization {:optional true} construct-visualization-schema]
   [:title :string]])

;;; ---------------------------------------- Source resolution ----------------------------------------

(defn- first-stage-source-table-fk
  "Pull the portable `[db schema table]` FK out of `stages[0].source-table`, or `nil`
  if not present / wrong shape."
  [parsed-query]
  (let [fk (get-in parsed-query ["stages" 0 "source-table"])]
    (when (and (vector? fk)
               (= 3 (count fk))
               (string? (nth fk 0)))
      fk)))

(def ^:private metabase-uri-source-table-pattern
  "Matches values the LLM sometimes writes into `source-table:` by confusing the Metabase
  `metabase://<entity-type>/<id>` URIs (which appear in prompts as a way to read entities)
  with a query source handle. Examples we've observed: `metabase://metric/76`,
  `metabase://table/123`, `metabase://model/42`, `metabase://question/9`.

  The regex is deliberately permissive — we catch anything starting with `metabase://` so
  the error message is always the directive one instead of falling through to the generic
  `:missing-source-in-first-stage` message."
  #"^metabase://([^/]+)/(\d+)")

(defn- detect-metabase-uri-source-table!
  "If `stages[0].source-table` is a `metabase://<type>/<id>` URI string, throw a targeted
  agent-error explaining how to use the referenced entity correctly (typically: the LLM
  meant to reference a metric — metrics are aggregations, not sources — but wrote the URI
  as a source). No-op on well-formed sources."
  [parsed-query]
  (let [raw (get-in parsed-query ["stages" 0 "source-table"])]
    (when (string? raw)
      (when-let [[_ entity-type entity-id] (re-find metabase-uri-source-table-pattern raw)]
        (let [hint (case entity-type
                     "metric"
                     (str "Metrics are aggregations, not sources. To use metric " entity-id
                          ", put its `base_table_portable_fk` (from `entity_details` on the metric) "
                          "into `source-table:` and reference the metric as "
                          "`aggregation: [[metric, {}, \"<portable_entity_id>\"]]`.")
                     ("question" "model" "card")
                     (str "To reference saved " entity-type " " entity-id
                          " as a query source, put its `portable_entity_id` (a 21-char "
                          "string from `entity_details`) into `source-card:` — not a URI.")
                     "table"
                     (str "Use the portable FK `[<db-name>, <schema>, <table-name>]` from "
                          "`entity_details` in `source-table:` — not a URI.")
                     (str "`source-table:` accepts a portable FK `[<db-name>, <schema>, <table-name>]` "
                          "or, via `source-card:`, a saved-card `portable_entity_id`."))]
          (throw (ex-info (tru "`source-table:` does not accept URIs like `{0}`. {1}"
                               raw hint)
                          {:agent-error? true
                           :status-code  400
                           :error        :uri-in-source-table
                           :source-table raw
                           :entity-type  entity-type
                           :entity-id    entity-id})))))))

(defn- first-stage-source-card-eid
  "Pull the `source-card:` entity_id string from `stages[0]`, or `nil` if not present."
  [parsed-query]
  (let [eid (get-in parsed-query ["stages" 0 "source-card"])]
    (when (string? eid) eid)))

(def ^:private permission-aware-content-store
  "ContentStore for agent query construction. Alias for
  [[shared.content-store/default-store]] — the chokepoint wrapper applies `api/read-check` to
  every lookup whenever `api/*current-user-id*` is bound, symmetrically across all five
  ContentStore methods. The unchecked underlying store gates non-NanoID entity-id values to
  avoid a full-table scan via `find-by-identity-hash`."
  shared.content-store/default-store)

(defn- check-first-stage-source-table-query-permissions!
  "Ensure the current user can query the table named by `stages[0].source-table`.

  The metadata provider intentionally exposes database metadata without applying user data
  permissions. Before any repair pass can inspect fields/FKs on the requested source table,
  resolve the portable table FK and run the normal API query permission check."
  [metadata-provider parsed-query]
  (when-let [table-fk (first-stage-source-table-fk parsed-query)]
    (let [resolver (resolve.mp/import-resolver metadata-provider permission-aware-content-store)
          table-id (serdes.resolve/import-table-fk resolver table-fk)]
      (api/query-check :model/Table table-id)
      nil)))

(defn resolve-database-id-from-first-stage
  "Resolve the application database id from the first stage's source.

  Public only so tests can stub it. Strategy:

    * If `stages[0].source-table` is a portable FK `[db schema table]`, look up the database
      by that `db` name. Unknown / ambiguous names surface `:unknown-database` / `:ambiguous-database-name`
      agent-errors.
    * Otherwise, if `stages[0].source-card` is an entity_id string, look up the card by entity_id
      and use its `:database_id`. Unknown entity_id surfaces `:unknown-card`.
    * Otherwise, surface `:missing-source-in-first-stage`.

  All error paths are raised with `:agent-error? true` so the tool wrapper can relay a clean
  message to the LLM instead of a stack trace.

  Note: the `database:` field at the top level of the query is intentionally NOT consulted.
  It's a spec-mandated but redundant field (the source already identifies the database); a
  repair pass stamps it after we've resolved the id via this function. See `repr-plan.md`
  step 14 follow-up."
  [parsed-query]
  (detect-metabase-uri-source-table! parsed-query)
  (if-let [table-fk (first-stage-source-table-fk parsed-query)]
    (let [db-name (nth table-fk 0)
          ids     (t2/select-pks-vec :model/Database :name db-name)]
      (case (count ids)
        0 (throw (ex-info (tru (str "Unknown database: `{0}`. Use the exact database name as "
                                    "reported by `entity_details` / metadata tools (it appears "
                                    "as the first element of every portable FK, e.g. "
                                    "`source-table: [<db-name>, <schema>, <table>]`).")
                               db-name)
                          {:agent-error? true
                           :status-code  400
                           :error        :unknown-database
                           :database     db-name}))
        1 (first ids)
        (throw (ex-info (tru (str "Multiple databases share the name `{0}` (ids: {1}). The "
                                  "agent has no way to disambiguate; ask the user to rename "
                                  "one of the databases or use a more specific identifier.")
                             db-name (pr-str (vec (sort ids))))
                        {:agent-error? true
                         :status-code  400
                         :error        :ambiguous-database-name
                         :database     db-name
                         :database-ids (vec (sort ids))}))))
    (if-let [eid (first-stage-source-card-eid parsed-query)]
      (if-let [card (tools.u/get-card-by-entity-id eid)]
        (:database_id card)
        (throw (ex-info (tru (str "No saved question or model found with entity_id {0}. Do not invent "
                                  "or guess entity_ids: call `entity_details` with `entity-type: question` "
                                  "or `entity-type: model` and the card''s numeric id first, then copy the "
                                  "exact `portable_entity_id` from the response into `source-card:`.")
                             (pr-str eid))
                        {:agent-error? true
                         :status-code  400
                         :error        :unknown-card
                         :entity-id    eid})))
      (throw (ex-info (tru (str "First stage must have either `source-table:` (as a portable FK "
                                "`[<db-name>, <schema>, <table>]`) or `source-card:` (as an "
                                "entity_id string). Neither was found in `stages[0]`."))
                      {:agent-error? true
                       :status-code  400
                       :error        :missing-source-in-first-stage})))))

;;; ---------------------------------------- Result columns ----------------------------------------

(defn- result-columns-for-query
  "Generate result columns from a MBQL 5 query for LLM consumption."
  [mbql5-query metadata-provider]
  (let [query (lib/query metadata-provider mbql5-query)
        cols  (lib/returned-columns query)]
    (mapv #(tools.u/->result-column query %) cols)))

;;; ---------------------------------------- Query execution ----------------------------------------

(defn- as-agent-input-error
  "Wrap `e` as an agent-input error.

  Tool callers look at `:agent-error?` to decide whether to relay the message to the LLM.
  HTTP callers additionally need a status code; default representation/repair failures to
  400 so individual repair passes don't all have to repeat `:status-code 400` in ex-data.
  Existing statuses are preserved (notably permission 403s, which callers should normally
  avoid wrapping in the first place)."
  [^clojure.lang.ExceptionInfo e]
  (let [base   (assoc (or (ex-data e) {}) :agent-error? true)
        data   (cond-> base
                 (nil? (:status-code base)) (assoc :status-code 400))]
    (ex-info (ex-message e) data e)))

(defn execute-representations-query
  "Execute a notebook query in the canonical portable MBQL 5 representations format.

  `external-query` is a keyword-keyed Clojure map matching [[metabase.lib.schema/external-query]]
  — what the JSON middleware decodes from the HTTP body, or what the MCP tool layer hands in
  after schema-coercion. Strict shape validation against `::external-query` is the
  responsibility of the entry-point (defendpoint / mu/defn) — this function trusts the input
  shape and concentrates on the LLM-friendly repair passes.

  Pipeline:
    1. Boundary-validate the keyword-keyed input against `::lib.schema/external-query`
       ([[repr/validate-external-query]]). Catches structural issues — missing `stages`,
       typo'd stage keys (e.g. `aggreagation` vs `aggregation`), wrong top-level `lib/type`,
       etc. — that the loose `:map` wire schema doesn't catch.
    2. Convert to the string-keyed portable form the repair pipeline operates on.
    3. Resolve the database id from the first stage's `source-table:` / `source-card:`
       ([[resolve-database-id-from-first-stage]]) and build an application-DB-backed
       `MetadataProvider`.
    4. Run the repair pass (fill in `{}` options, missing `lib/type` markers, stamp the
       top-level `database:`, auto-wire `source-field` for implicit joins, rewrite inline
       `order-by` aggregations to refs, etc.).
    5. Sanity-check the post-repair shape against the portable repair schema.
    6. Resolve portable FKs to numeric IDs and normalize through `lib.schema/query` against the
       metadata-provider.
    7. Export that final numeric pMBQL back to the portable form for the LLM-facing
       `:query-json` / `query-content` output.

  Returns a map with `:structured-output` and `:instructions` keys. Throws with an
  `:agent-error?` ex-data flag when the LLM input is invalid, so the outer tool wrapper can
  surface a helpful message to the LLM without a stack trace.

  Per `repr-plan.md` step 13, there is no `source_entity` parameter — the query body carries
  everything needed. Per the step-14 follow-up, there is also no top-level `database:` in the
  LLM-facing contract: the database is derived from the first stage's source, and a repair
  pass stamps `database:` into the portable form before lib.schema / resolve need it."
  [external-query]
  (let [parsed      (try
                      ;; Step 1 — convert to the string-keyed portable form the repair pipeline
                      ;; operates on.
                      ;; Step 2 — boundary check that every stage's top-level keys are known.
                      ;; Catches LLM-authored typos (e.g. `aggreagation` for `aggregation`)
                      ;; that `lib.schema` does not enforce — `::lib.schema.mbql-stage/mbql` is
                      ;; not a closed map, so unknown stage keys would otherwise be silently
                      ;; dropped at resolve / lib.normalize time.
                      (let [portable (repr/external-query->portable external-query)]
                        (repr/assert-known-stage-keys! portable)
                        portable)
                      (catch clojure.lang.ExceptionInfo e
                        (throw (as-agent-input-error e))))
        database-id (resolve-database-id-from-first-stage parsed)
        mp          (lib-be/application-database-metadata-provider database-id)]
    ;; Permission checks happen before repair/resolve so the metadata-provider-backed pipeline
    ;; never inspects table/card metadata that the current user cannot use.
    (check-first-stage-source-table-query-permissions! mp parsed)
    ;; Everything after the MP is built can surface LLM-input errors (lib.schema validation
    ;; in resolve, missing-column complaints from lib/query in `result-columns-for-query`,
    ;; etc.). Wrap the whole rest of the pipeline in a single `:agent-error?` relay so any of
    ;; them reach the tool wrapper with the flag set.
    (try
      (let [repaired      (repr.repair/repair mp parsed permission-aware-content-store)
            _validated    (repr/validate-query repaired)
            pmbql-query   (repr.resolve/resolve-query mp repaired permission-aware-content-store)
            exported-repr (repr.resolve/export-query mp pmbql-query permission-aware-content-store)
            _validated'   (repr/validate-query exported-repr)
            query-id      (u/generate-nano-id)]
        {:structured-output {:query-id       query-id
                             :query          pmbql-query
                             :query-json     exported-repr
                             :result-columns (result-columns-for-query pmbql-query mp)}
         :instructions      (instructions/query-created-instructions-for query-id)})
      (catch clojure.lang.ExceptionInfo e
        ;; Permission failures are not LLM-input repair errors. Preserve the original 403 so
        ;; HTTP callers get the standard forbidden response instead of an agent-error payload.
        (if (= 403 (:status-code (ex-data e)))
          (throw e)
          (throw (as-agent-input-error e)))))))

;;; ---------------------------------------- Chart helpers ----------------------------------------

(defn- chart-type->keyword
  [chart-type]
  (cond
    (keyword? chart-type) chart-type
    (string? chart-type)  (keyword chart-type)
    :else                 chart-type))

(defn- query-json->llm-content
  "Render the portable repr-form `query-json` map as the JSON code block embedded inside
  `<query>` for the LLM. The wire format is `::lib.schema/external-query` JSON; we serialize
  with pretty-printing and a triple-backtick fence so the LLM sees the same syntactic frame it
  would in a tool description or assistant turn."
  [query-json]
  (when (map? query-json)
    (str "```json\n"
         (json/encode query-json {:pretty true})
         "\n```")))

(defn- structured->query-data
  "Convert tool structured output to a map suitable for [[llm-shape/query->xml]].

  `:query-content` is the **canonical portable representations JSON** for the final pMBQL
  query we actually constructed: repaired and resolved to numeric IDs, normalized by lib,
  then exported back to portable FK paths/entity_ids. By feeding the LLM this final portable
  form (rather than legacy-MBQL JSON or a pre-resolve approximation) on the next turn it can
  reference exactly the field paths and aggregation UUIDs that will execute.

  See repr-plan.md step 18."
  [{:keys [query-id query query-json result-columns]}]
  (let [legacy-query (when (and (map? query) (:lib/type query))
                       #_{:clj-kondo/ignore [:discouraged-var]}
                       (lib/->legacy-MBQL query))]
    {:query-type    "notebook"
     :query-id      query-id
     :database_id   (:database legacy-query)
     :query-content (query-json->llm-content query-json)
     :result        (when (seq result-columns)
                      {:result_columns result-columns})}))

(defn- structured->chart-xml
  "Render the full chart XML for the construct_notebook_query tool result."
  [structured chart-id chart-type]
  (llm-shape/visualization->xml
   {:chart-id               chart-id
    :queries                [(structured->query-data structured)]
    :visualization_settings {:chart_type (if chart-type (name chart-type) "table")}}))

;;; ---------------------------------------- Main tool ----------------------------------------

(mu/defn ^{:tool-name "construct_notebook_query"
           :scope     scope/agent-notebook-create}
  construct-notebook-query-tool
  "Construct and visualize a notebook query from a metric, model, or table.

  Accepts an MBQL 5 query as a JSON object matching `::lib.schema/external-query`, plus a
  short, human-friendly `title` shown above the resulting chart. See
  `resources/metabot/prompts/tools/construct_notebook_query.md` for the prompt contract."
  [{:keys [_reasoning query visualization title]} :- construct-notebook-query-args-schema]
  (try
    (let [normalized-visualization (some-> visualization (update-keys (comp keyword u/->kebab-case-en name)))
          chart-type              (or (chart-type->keyword (:chart-type normalized-visualization))
                                      :table)
          query-result            (execute-representations-query query)
          structured              (or (:structured-output query-result) (:structured_output query-result))]
      (if (and structured (:query-id structured) (:query structured))
        (let [chart-result (create-chart-tools/create-chart
                            {:query-id      (:query-id structured)
                             :chart-type    chart-type
                             :queries-state {(:query-id structured) (:query structured)}})
              results-url  (:results-url chart-result)
              full-structured (assoc structured
                                     :result-type   :query
                                     :chart-id      (:chart-id chart-result)
                                     :chart-type    (:chart-type chart-result)
                                     :chart-link    (:chart-link chart-result)
                                     :chart-content (:chart-content chart-result))
              instruction-text
              (let [link (te/link "Chart" "metabase://chart/" (:chart-id chart-result))]
                (te/lines
                 "Your query and chart have been created successfully."
                 ""
                 "Next steps to present the chart to the user:"
                 (str "- Always provide a direct link using: `" link "` where Chart is a meaningful link text")
                 "- If creating multiple charts, present all chart links"))
              chart-xml (structured->chart-xml structured (:chart-id chart-result) chart-type)]
          {:output (str "<result>\n" chart-xml "\n</result>\n"
                        "<instructions>\n" instruction-text "\n</instructions>")
           :data-parts        (when results-url
                                [(streaming/viz-part
                                  {:inline?   (shared/inline-viz-capable?)
                                   :entity-id (:chart-id chart-result)
                                   :query-id  (:query-id structured)
                                   :query     (links/->legacy-mbql (:query structured))
                                   :display   chart-type
                                   :title     title
                                   :link      results-url})])
           :structured-output full-structured
           :instructions      instruction-text})
        ;; query-result may already have :output (error) or only :structured-output
        (if-let [s (or (:structured-output query-result) (:structured_output query-result))]
          (let [query-xml        (llm-shape/query->xml (structured->query-data s))
                instruction-text (instructions/query-created-instructions-for (:query-id s))]
            (assoc query-result
                   :output (str "<result>\n" query-xml "\n</result>\n"
                                "<instructions>\n" instruction-text "\n</instructions>")))
          query-result)))
    (catch Exception e
      (if (:agent-error? (ex-data e))
        ;; Expected agent-facing signal (bad LLM input: unknown table, unknown schema,
        ;; URI-in-source-table, …). Log at debug only — no stacktrace — since the message
        ;; is the tool's result and the LLM is expected to self-correct on the next turn.
        (do
          (log/debug e "construct_notebook_query returned agent-error to the LLM")
          {:output (ex-message e)})
        ;; Genuine unexpected failure — keep full stacktrace.
        (do
          (log/error e "Failed to construct notebook query")
          {:output (str "Failed to construct notebook query: " (or (ex-message e) "Unknown error"))})))))
