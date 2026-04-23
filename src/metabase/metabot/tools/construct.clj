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

(def construct-program-schema
  "Schema for the program parameter of construct_notebook_query (legacy sexp-in-array format).
  Intentionally loose — agent-lib validates and repairs internally.

  Still consumed by `slackbot-construct-notebook-query-tool` during the migration; will be
  removed in Phase 3 once slackbot is moved to representations."
  [:map
   [:source [:map
             [:type :string]
             [:id {:optional true} [:maybe :int]]
             [:ref {:optional true} [:maybe :string]]]]
   [:operations [:sequential [:sequential :any]]]])

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
  `:referenced_entities`: the YAML query is self-describing (it carries `database: <name>` at
  the top level and full portable FK paths everywhere else), so passing a separate entity
  identifier is redundant and can disagree with the YAML. Database identity is now derived
  from the YAML's `database:` field via [[resolve-database-id-from-yaml]]."
  [:map {:closed true}
   [:reasoning {:optional true} :string]
   [:query :string]
   [:visualization {:optional true} construct-visualization-schema]])

;;; ---------------------------------------- Source resolution ----------------------------------------

(defn resolve-source-database-id
  "Resolve the database ID for a source_entity. Public only so tests can stub it.

  Still consumed by [[execute-program]] (the legacy sexp pipeline used by slackbot). The
  representations pipeline derives database-id from the YAML's `database:` field instead;
  see [[resolve-database-id-from-yaml]]."
  [{:keys [type id]}]
  (case type
    "table"                (:db_id (tools.u/get-table id :db_id))
    ("model" "question")   (:database_id (tools.u/get-card id))
    "metric"               (:database_id (tools.u/get-card id))
    (throw (ex-info (str "Unsupported source_entity type: " type)
                    {:agent-error? true :status-code 400}))))

(defn resolve-database-id-from-yaml
  "Look up a database id by name, given a parsed (string-keyed) representations query.

  Public only so tests can stub it. Three error paths, all surfaced as `:agent-error? true`
  so the tool wrapper produces a useful LLM-facing message rather than a stack trace:

    * The query has no `database:` field at the top level (or it isn't a string).
    * No application database is named `<name>`.
    * Two or more application databases share the same name. The LLM has no way to
      disambiguate by name alone, so we refuse to silently pick one.

  Returns the numeric database id on success."
  [parsed-query]
  (let [db-name (get parsed-query "database")]
    (when-not (string? db-name)
      (throw (ex-info (tru "Representations query is missing a top-level `database:` field.")
                      {:agent-error? true
                       :status-code  400
                       :error        :missing-database-name})))
    (let [ids (t2/select-pks-vec :model/Database :name db-name)]
      (case (count ids)
        0 (throw (ex-info (tru (str "Unknown database: `{0}`. Use the exact database name as "
                                    "reported by `entity_details` / metadata tools.")
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
                         :database-ids (vec (sort ids))}))))))

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

  Still used by `slackbot-construct-notebook-query-tool` during the migration.
  `construct-notebook-query-tool` now uses [[execute-representations-query]] instead."
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
    2. Look up the database id from the parsed query's top-level `database:` field
       ([[resolve-database-id-from-yaml]]) and build an application-DB-backed
       `MetadataProvider`.
    3. Run the repair pass (fill in `{}` options, missing `lib/type` markers, auto-wire
       `source-field` for implicit joins, rewrite inline `order-by` aggregations to refs).
    4. Structurally validate against the repr schema.
    5. Resolve portable FKs to numeric IDs and normalize through `lib.schema/query` against the
       metadata-provider.

  Returns a map with `:structured-output` and `:instructions` keys. Throws with an
  `:agent-error?` ex-data flag when the LLM input is invalid, so the outer tool wrapper can
  surface a helpful message to the LLM without a stack trace.

  Per `repr-plan.md` step 13, database identity is taken from the YAML alone. There is no
  `source_entity` parameter — the YAML carries everything needed."
  [yaml-string]
  (let [;; Parse first so we can derive the database-id from the YAML.
        parsed      (try
                      (repr/parse-yaml yaml-string)
                      (catch clojure.lang.ExceptionInfo e
                        (throw (ex-info (ex-message e)
                                        (assoc (ex-data e) :agent-error? true)
                                        e))))
        database-id (resolve-database-id-from-yaml parsed)
        mp          (lib-be/application-database-metadata-provider database-id)
        pmbql-query (try
                      (->> parsed
                           (repr.repair/repair mp)
                           repr/validate-query
                           (repr.resolve/resolve-query mp))
                      (catch clojure.lang.ExceptionInfo e
                        (let [d (ex-data e)]
                          (throw (ex-info (ex-message e)
                                          (assoc d :agent-error? true)
                                          e)))))
        query-id    (u/generate-nano-id)]
    {:structured-output {:query-id       query-id
                         :query          pmbql-query
                         :result-columns (result-columns-for-query pmbql-query mp)}
     :instructions      (instructions/query-created-instructions-for query-id)}))

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
      (log/error e "Failed to construct notebook query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to construct notebook query: " (or (ex-message e) "Unknown error"))}))))
