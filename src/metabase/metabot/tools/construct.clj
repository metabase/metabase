(ns metabase.metabot.tools.construct
  "Notebook query construction tool wrappers."
  (:require
   [metabase.agent-lib.core :as agent-lib]
   [metabase.agent-lib.representations :as repr]
   [metabase.agent-lib.representations.repair :as repr.repair]
   [metabase.agent-lib.representations.resolve :as repr.resolve]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.charts.create :as create-chart-tools]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-representations :as llm-rep]
   [metabase.metabot.tools.util :as tools.u]
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

(def ^:private construct-notebook-query-args-schema
  "Args schema for `construct_notebook_query` in representations mode.

  The `query` parameter is a **YAML string** in the canonical MBQL 5 representations format
  (see `resources/metabot/prompts/tools/construct_notebook_query.md`). We keep it at the plain
  `:string` type rather than parsing the shape here — parsing and structural validation happen
  inside `execute-representations-query`. Keeping the schema flat (just `:string`) also
  sidesteps the MCP `flatten-root-schema` pitfalls hit by more elaborate `:and`/`:fn` wrappers.

  Per `repr-plan.md` step 13, this schema intentionally does NOT include `:source_entity` or
  `:referenced_entities`: the YAML query is self-describing, so passing a separate entity
  identifier is redundant and can disagree with the YAML. Database identity is derived from
  the first stage's `source-table:` / `source-card:` — see [[resolve-database-id-from-first-stage]]."
  [:map {:closed true}
   [:reasoning {:optional true} :string]
   [:query :string]
   [:visualization {:optional true} construct-visualization-schema]])

;;; ---------------------------------------- Source resolution ----------------------------------------

(defn resolve-source-database-id
  "Resolve the database ID for a source_entity. Public only so tests can stub it.

  Still consumed by [[execute-program]] (the legacy sexp pipeline used by slackbot). The
  representations pipeline derives database-id from the first stage's source instead;
  see [[resolve-database-id-from-first-stage]]."
  [{:keys [type id]}]
  (case type
    "table"                (:db_id (tools.u/get-table id :db_id))
    ("model" "question")   (:database_id (tools.u/get-card id))
    "metric"               (:database_id (tools.u/get-card id))
    (throw (ex-info (str "Unsupported source_entity type: " type)
                    {:agent-error? true :status-code 400}))))

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

  Note: the `database:` field at the top level of the YAML is intentionally NOT consulted.
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

;;; --------------------------- Legacy sexp-pipeline scaffolding (step 15 delete) ---------------------------
;;;
;;; Everything from here down to (and including) `execute-program` is sexp-only: it's used
;;; solely by the HTTP `/v2/construct-query` endpoint in `metabase.agent-api.api`. That
;;; endpoint migrates in `repr-plan.md` step 15; at that point this entire block goes away
;;; along with `construct-program` from the endpoint body schema.
;;;
;;; The repr pipeline (`execute-representations-query`, `resolve-database-id-from-first-stage`,
;;; `resolve-source-database-id`, the result-column helpers, the main tool) lives above and
;;; below this block.
;;; -----------------------------------------------------------------------------------------

(defn- source-entity->model-str
  "Map source_entity type to the model string used by agent-lib evaluation context."
  [type]
  (case type
    "table"      "table"
    "model"      "dataset"
    "question"   "card"
    "metric"     "metric"
    type))

(defn program-source->source-entity
  "Convert a structured-program `:source` map (using agent-lib model strings: `table`,
  `card`, `dataset`, `metric`) into the `source-entity` shape consumed by
  [[execute-program]] (using metabot type strings: `table`, `question`, `model`,
  `metric`). Throws if the source isn't one of the four database-resolved types
  (e.g. `context` or nested `program` sources are rejected)."
  [{:keys [type id] :as source}]
  (let [entity-type (case type
                      "table"   "table"
                      "card"    "question"
                      "dataset" "model"
                      "metric"  "metric"
                      (throw (ex-info (str "Unsupported program source type: " (pr-str type))
                                      {:agent-error? true
                                       :status-code  400
                                       :source       source})))]
    {:type entity-type :id id}))

(defn- source-metadata-for
  "Resolve the lib metadata object for a source entity."
  [type id metadata-provider]
  (case type
    "table"              (lib.metadata/table metadata-provider id)
    ("model" "question") (lib.metadata/card metadata-provider id)
    "metric"             (lib.metadata/card metadata-provider id)
    nil))

(defn- surrounding-tables-for
  "Derive surrounding tables from a source query's visible columns."
  [metadata-provider source-metadata source-id]
  (try
    (let [query (lib/query metadata-provider source-metadata)]
      (->> (lib/visible-columns query)
           (keep :table-id)
           distinct
           (remove #{source-id})
           (mapv (fn [tid] {:id tid}))))
    (catch Exception _ [])))

(defn- available-measure-ids
  "Return the set of measure IDs available on a source entity, or empty set."
  [metadata-provider source-metadata]
  (try
    (->> (lib/available-measures (lib/query metadata-provider source-metadata))
         (keep :id)
         set)
    (catch Exception _ #{})))

(defn- build-evaluation-context
  "Build the EvaluationContext for agent-lib from source_entity and referenced_entities."
  [{:keys [type id]} referenced-entities metadata-provider]
  (let [model-str      (source-entity->model-str type)
        source-metadata (source-metadata-for type id metadata-provider)
        surrounding     (surrounding-tables-for metadata-provider source-metadata id)
        measure-ids     (available-measure-ids metadata-provider source-metadata)]
    {:source-entity       {:model model-str :id id}
     :referenced-entities (or (mapv (fn [{:keys [type id]}]
                                      {:model (source-entity->model-str type) :id id})
                                    referenced-entities)
                              [])
     :surrounding-tables  surrounding
     :measure-ids         measure-ids
     :source-metadata     source-metadata}))

;;; ---------------------------------------- Result columns ----------------------------------------

(defn- result-columns-for-query
  "Generate result columns from a pMBQL query for LLM consumption."
  [pmbql-query metadata-provider]
  (let [query (lib/query metadata-provider pmbql-query)
        cols  (lib/returned-columns query)]
    (mapv #(tools.u/->result-column query %) cols)))

;;; ---------------------------------------- Query execution ----------------------------------------

(defn execute-program
  "Execute a legacy sexp-in-array structured program via agent-lib.

  Post-step-14: the only remaining caller is the HTTP `/v2/construct-query` endpoint in
  `metabase.agent-api.api`. Will be deleted in step 15 along with the endpoint migration."
  [source-entity referenced-entities program]
  (let [database-id (resolve-source-database-id source-entity)
        mp          (lib-be/application-database-metadata-provider database-id)
        context     (build-evaluation-context source-entity referenced-entities mp)
        pmbql-query (agent-lib/evaluate-program program mp context)
        query-id    (u/generate-nano-id)]
    {:structured-output {:query-id       query-id
                         :query          pmbql-query
                         :result-columns (result-columns-for-query pmbql-query mp)}
     :instructions      (instructions/query-created-instructions-for query-id)}))

(defn execute-representations-query
  "Execute a notebook query in the canonical MBQL 5 YAML representations format.

  Pipeline:
    1. Parse the YAML string into a portable Clojure data structure.
    2. Resolve the database id from the first stage's `source-table:` / `source-card:`
       ([[resolve-database-id-from-first-stage]]) and build an application-DB-backed
       `MetadataProvider`.
    3. Run the repair pass (fill in `{}` options, missing `lib/type` markers, stamp the
       top-level `database:`, auto-wire `source-field` for implicit joins, rewrite inline
       `order-by` aggregations to refs, etc.).
    4. Structurally validate against the repr schema.
    5. Resolve portable FKs to numeric IDs and normalize through `lib.schema/query` against the
       metadata-provider.

  Returns a map with `:structured-output` and `:instructions` keys. Throws with an
  `:agent-error?` ex-data flag when the LLM input is invalid, so the outer tool wrapper can
  surface a helpful message to the LLM without a stack trace.

  Per `repr-plan.md` step 13, there is no `source_entity` parameter — the YAML carries
  everything needed. Per the step-14 follow-up, there is also no top-level `database:` in the
  LLM-facing contract: the database is derived from the first stage's source, and a repair
  pass stamps `database:` into the parsed YAML before lib.schema / resolve need it."
  [yaml-string]
  (let [;; Parse first so we can derive the database-id from the YAML.
        parsed      (try
                      (repr/parse-yaml yaml-string)
                      (catch clojure.lang.ExceptionInfo e
                        (throw (ex-info (ex-message e)
                                        (assoc (ex-data e) :agent-error? true)
                                        e))))
        database-id (resolve-database-id-from-first-stage parsed)
        mp          (lib-be/application-database-metadata-provider database-id)]
    ;; Everything after the MP is built can surface LLM-input errors (lib.schema validation
    ;; in resolve, missing-column complaints from lib/query in `result-columns-for-query`,
    ;; etc.). Wrap the whole rest of the pipeline in a single `:agent-error?` relay so any of
    ;; them reach the tool wrapper with the flag set.
    (try
      (let [pmbql-query (->> parsed
                             (repr.repair/repair mp)
                             repr/validate-query
                             (repr.resolve/resolve-query mp))
            query-id    (u/generate-nano-id)]
        {:structured-output {:query-id       query-id
                             :query          pmbql-query
                             :result-columns (result-columns-for-query pmbql-query mp)}
         :instructions      (instructions/query-created-instructions-for query-id)})
      (catch clojure.lang.ExceptionInfo e
        (throw (ex-info (ex-message e)
                        (assoc (ex-data e) :agent-error? true)
                        e))))))

;;; ---------------------------------------- Chart helpers ----------------------------------------

(defn- chart-type->keyword
  [chart-type]
  (cond
    (keyword? chart-type) chart-type
    (string? chart-type)  (keyword chart-type)
    :else                 chart-type))

(defn- structured->query-data
  "Convert tool structured output to a map suitable for [[llm-rep/query->xml]].
  Converts the MBQL 5 query to legacy MBQL, JSON-encodes it, and wraps result columns."
  [{:keys [query-id query result-columns]}]
  (let [legacy-query (when (and (map? query) (:lib/type query))
                       #_{:clj-kondo/ignore [:discouraged-var]}
                       (lib/->legacy-MBQL query))]
    {:query-type    "notebook"
     :query-id      query-id
     :database_id   (:database legacy-query)
     :query-content (when legacy-query (json/encode legacy-query))
     :result        (when (seq result-columns)
                      {:result_columns result-columns})}))

(defn- structured->chart-xml
  "Render the full chart XML for the construct_notebook_query tool result."
  [structured chart-id chart-type]
  (llm-rep/visualization->xml
   {:chart-id               chart-id
    :queries                [(structured->query-data structured)]
    :visualization_settings {:chart_type (if chart-type (name chart-type) "table")}}))

;;; ---------------------------------------- Main tool ----------------------------------------

(mu/defn ^{:tool-name "construct_notebook_query"
           :scope     scope/agent-notebook-create}
  construct-notebook-query-tool
  "Construct and visualize a notebook query from a metric, model, or table.

  Accepts an MBQL 5 query in the canonical representations YAML format. See
  `resources/metabot/prompts/tools/construct_notebook_query.md` for the prompt contract."
  [{:keys [_reasoning query visualization]} :- construct-notebook-query-args-schema]
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
              navigate-url (get-in chart-result [:reactions 0 :url])
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
           :data-parts        (when navigate-url
                                [(streaming/navigate-to-part navigate-url)])
           :structured-output full-structured
           :instructions      instruction-text})
        ;; query-result may already have :output (error) or only :structured-output
        (if-let [s (or (:structured-output query-result) (:structured_output query-result))]
          (let [query-xml        (llm-rep/query->xml (structured->query-data s))
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
