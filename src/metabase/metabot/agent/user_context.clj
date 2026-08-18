(ns metabase.metabot.agent.user-context
  "User context enrichment and formatting for agent system messages.

  Handles formatting of viewing context (what the user is currently looking at),
  recent views, user time formatting, and SQL dialect extraction from context."
  (:require
   [clojure.string :as str]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.metadata-perms :as metabot.perms]
   [metabase.metabot.query-analyzer :as query-analyzer]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.shared.llm-representations :as llm-rep]
   [metabase.metabot.util :as metabot.u]
   [metabase.models.interface :as mi]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.time OffsetDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

;;; Time Formatting

(defn format-current-time
  "Format user's current time from context.
  Expects :current_user_time (preferred) or :current_time_with_timezone in context as ISO-8601 string."
  [context]
  (try
    (cond
      (string? (:current_user_time context))
      (:current_user_time context)

      (string? (:current_time_with_timezone context))
      (let [offset-time (OffsetDateTime/parse (:current_time_with_timezone context))
            formatter DateTimeFormatter/ISO_LOCAL_DATE_TIME]
        (.format formatter offset-time))

      (string? (:current_time context))
      (:current_time context)

      :else
      (.format DateTimeFormatter/ISO_LOCAL_DATE_TIME (OffsetDateTime/now)))
    (catch Exception e
      (log/error e "Error formatting current time")
      (.format DateTimeFormatter/ISO_LOCAL_DATE_TIME (OffsetDateTime/now)))))

;;; SQL Dialect Extraction

(declare normalize-context-type native-query-item? effective-context-type)

(defn extract-sql-dialect
  "Extract SQL dialect name from context.

  Looks for dialect in native SQL editor context (:sql_engine field).
  Handles both explicit `type: \"native\"` items and `type: \"adhoc\"` items
  whose inner dataset-query type is `\"native\"`.

  Returns lowercase dialect name suitable for loading dialect instructions."
  [context]
  (when-let [viewing (:user_is_viewing context)]
    (some (fn [item]
            (some-> item :sql_engine u/lower-case-en))
          viewing)))

;;; Context Normalization

(defn- normalize-context-type
  "Normalize context :type to lowercase string."
  [type-val]
  (cond
    (keyword? type-val) (name type-val)
    (string? type-val) type-val
    (nil? type-val) nil
    :else (str type-val)))

(defn- native-query-item?
  "True when the viewing-context item represents a native SQL query.

  The frontend sends `type: \"adhoc\"` for *both* notebook (MBQL) and native SQL
  queries. We distinguish them by inspecting the query: a dataset-query with
  `{:type \"native\"}` (or `:native`) is a native SQL query, as is an MBQL 4 (legacy) or MBQL 5
  query with a single native stage."
  [item]
  (let [query (:query item)]
    (or (= "native" (normalize-context-type (:type query)))
        ;; MBQL 4/MBQL 5: normalize and use lib to detect native queries
        (when (and (map? query) (:database query))
          (try
            (lib/native-only-query? (lib-be/normalize-query query))
            (catch Exception _ false))))))

(defn- effective-context-type
  "Return the effective context type for a viewing-context item.

  Handles the fact that the frontend sends `type: \"adhoc\"` for both notebook
  and native SQL queries by inspecting the inner dataset-query type."
  [item]
  (normalize-context-type (:type item)))

;;; Entity Formatting

(defn- fully-qualified-name
  "Build fully qualified table name (schema.table) when schema is available."
  [{:keys [name database_schema]}]
  (if (not-empty database_schema)
    (str database_schema "." name)
    name))

(defn- format-simple-entity
  [entity]
  (te/lines
   (te/field (:type entity) (str (fully-qualified-name entity) " (ID: " (or (:id entity) "-") ")"))
   (te/field "Description" (:description entity))
   (te/field "Fields" (some->> (:fields entity) (map :name) (str/join ", ")))))

(defn- dispatch-format-entity [entity] (effective-context-type entity))
(defmulti format-entity "Format an entity for LLM representation." {:arglists '([entity])} dispatch-format-entity)

(defmethod format-entity :default [entity]
  (log/warn "Unknown viewing context type:" (:type entity))
  "")

;; For saved entities (table, model, question, metric, dashboard), the frontend only sends
;; type + id. We fetch full details from the DB using entity-details and render them via
;; llm-representations, mirroring what the Python AI service did via HTTP callbacks.

(defn- fetch-and-format
  "Fetch entity details and format with llm-rep. Falls back to format-simple-entity on failure,
  except a 403, which renders nothing."
  [entity preamble details-fn format-fn]
  (try
    (let [{:keys [structured-output]} (details-fn)]
      (if structured-output
        (te/lines preamble (format-fn structured-output))
        (format-simple-entity entity)))
    (catch Exception e
      (if (= 403 (:status-code (ex-data e)))
        (do (log/debugf "Omitting viewing-context entity the current user cannot read: %s %s"
                        (:type entity) (:id entity))
            nil)
        (do (log/error "Error fetching entity details for viewing context"
                       {:type (:type entity) :id (:id entity)}
                       (ex-message e))
            (format-simple-entity entity))))))

(defmethod format-entity "table"
  [entity]
  (fetch-and-format entity
                    "The user is currently looking at the rows of a table:"
                    #(entity-details/get-table-details {:entity-type :table
                                                        :entity-id (:id entity)
                                                        :with-field-values? false
                                                        :with-metrics? false
                                                        :with-measures? true
                                                        :with-segments? true})
                    llm-rep/table->xml))

(defmethod format-entity "model"
  [entity]
  (fetch-and-format entity
                    "The user is currently looking at the rows of a model:"
                    #(entity-details/get-table-details {:entity-type :model
                                                        :entity-id (:id entity)
                                                        :with-field-values? false
                                                        :with-metrics? false
                                                        :with-measures? true
                                                        :with-segments? true})
                    llm-rep/model->xml))

(defn- format-chart-config-ids
  "Format chart config IDs for a viewing context item.
  Returns a string describing available chart config IDs, or nil if no chart configs are present."
  [{:keys [id chart_configs]}]
  (when (seq chart_configs)
    (if (= 1 (count chart_configs))
      (str id)
      (str/join ", " (map-indexed (fn [idx _] (str id "-" idx)) chart_configs)))))

(defn- native-query-details
  "Extract query details from legacy or modern native query."
  [query]
  {:database-id (:database query)
   :query-str   (metabot.u/extract-sql-content query)})

(defn- format-native-query
  "Format viewing `item`"
  [item]
  (let [{:keys [database-id query-str]} (native-query-details (:query item))]
    (te/lines
     "The user is currently in the SQL editor."
     (when (:id item)
       (te/field "Query ID" (:id item)))
     (te/field "Current SQL query" (te/code query-str "sql"))
     (te/field "Database ID" database-id)
     (te/field "Database SQL engine" (:sql_engine item))
     (when-some [error (:error item)]
       (te/field "Query error" (te/code error)))
     (when-let [config-ids (format-chart-config-ids item)]
       (te/field "Chart Config IDs (for analyze_chart tool)" config-ids))
     (te/field "Tables used" (some->> (:used_tables item)
                                      (map format-entity)
                                      te/lines)))))

(defmethod format-entity "question"
  [entity]
  (if (native-query-item? entity)
    (format-native-query entity)
    (fetch-and-format entity
                      "The user is currently looking at the results of a report:"
                      #(entity-details/get-report-details {:report-id (:id entity)
                                                           :with-field-values? false})
                      llm-rep/question->xml)))

(defmethod format-entity "metric"
  [entity]
  (fetch-and-format entity
                    "The user is currently looking at the details of a metric:"
                    #(entity-details/get-metric-details {:metric-id (:id entity)
                                                         :with-field-values? false})
                    llm-rep/metric->xml))

(defmethod format-entity "dashboard"
  [entity]
  (fetch-and-format entity
                    "The user is currently looking at the details of a dashboard:"
                    #(entity-details/get-dashboard-details {:dashboard-id (:id entity)})
                    llm-rep/dashboard->xml))

;;; Viewing Context Formatting

;; Format adhoc query (notebook editor) viewing context.
(defmethod format-entity "adhoc"
  [item]
  (if (native-query-item? item)
    (format-native-query item)
    (te/lines "The user is currently in the notebook editor viewing a query."
              (te/field "Query ID" (:id item))
              (te/field "Database ID" (get-in item [:query :database]))
              (when-let [config-ids (format-chart-config-ids item)]
                (te/field "Chart Config IDs (for analyze_chart tool)" config-ids))
              (te/field "Tables used" (some->> (:used_tables item)
                                               (map format-entity)
                                               te/lines)))))

;;; The transform-source rendering below hands a client-supplied query to the LLM. Before rendering it,
;;; permission-check every app-DB id the query names — a table id, a field id (which names a column on a
;;; table the query may never list as a source), or a card id — so the prompt never reasons over data the
;;; caller cannot reach. The three vectors below enumerate the id-bearing map keys such a
;;; query can carry.

(def ^:private exported-table-id-keys
  "Map keys the export path rewrites into a portable `[db schema table]` path."
  [:source-table :source_table])

(def ^:private exported-card-id-keys
  "Map keys the export path rewrites into a Card `entity_id`."
  [:source-card :source_card :card-id :card_id])

(def ^:private exported-field-id-keys
  "Map keys the export path rewrites into a portable `[db schema table field]` path.

  `:source-field` is the one a walker over `:field` clause slots misses: it names a column on a table the
  query never lists as a source, so `[:field {:source-field <secret>} <readable>]` used to render the
  secret column's fully-qualified name into the prompt."
  [:source-field :metabase.models.visualization-settings/param-mapping-source])

(defn- exported-entity-ids
  "`{:table #{} :card #{} :field #{}}` — the app-DB ids in `normalized` that the export path can turn into
  names.

  Runs on the *normalized* query because that is what the export path runs on too. That correspondence is
  what makes the gate complete, and is why it does not try to recognise raw client shapes: an id
  normalization drops (`{:source-table \"77\"}`) cannot be exported either, and one it rewrites
  (`\"card__7\"` into `:source-card 7`) arrives here in its canonical form."
  [normalized]
  (let [ids (fn [ks node] (into #{} (comp (map #(get node %)) (filter pos-int?)) ks))]
    (reduce
     (fn [acc node]
       (cond
         (map? node)
         (-> acc
             (update :table into (ids exported-table-id-keys node))
             (update :card  into (ids exported-card-id-keys node))
             (update :field into (ids exported-field-id-keys node)))

         (and (vector? node) (not (map-entry? node)))
         (case (keyword (first node))
           ;; `[:field opts id]` (MBQL 5), `[:field id opts]` (legacy), `[:field id]`, `[:field-id id]` —
           ;; the export path accepts every one of those shapes, so check both slots rather than guessing.
           (:field :field-id) (update acc :field into (filter pos-int?) [(nth node 1 nil) (nth node 2 nil)])
           ;; `[:metric opts id]` (MBQL 5) and `[:metric id]` (legacy) — a metric id is a Card id. The
           ;; export path normalizes the clause before matching it, so both slots are checked here for
           ;; the same reason `:field` checks both: which one holds the id is not ours to guess.
           :metric            (update acc :card into (filter pos-int?) [(nth node 1 nil) (nth node 2 nil)])
           acc)

         :else acc))
     {:table #{} :card #{} :field #{}}
     (tree-seq coll? seq normalized))))

(defn- native-stage?
  [normalized]
  (boolean (some #(and (map? %) (= :mbql.stage/native (:lib/type %)))
                 (tree-seq coll? seq normalized))))

(defn- native-sql-table-ids
  "Table ids the query analyzer positively recognises in `normalized`'s native SQL.

  Not about the export: a native stage carries no ids to resolve, and the SQL body is the client's own
  input echoed back. It is about not reasoning over a transform that selects from a table the caller
  cannot query. Only tables the analyzer matched to a real row count — its fuzzy name matches are
  guesses, and an analyzer that cannot answer at all (unsupported driver, unparseable SQL) is not
  evidence of a restricted table, so neither denies on its own."
  [normalized]
  (try
    (into #{}
          (comp (keep #(or (:table-id %) (:id %))) (filter pos-int?))
          (:tables (query-analyzer/tables-for-native normalized :all-drivers-trusted? true)))
    (catch Exception e
      (log/debugf "Could not analyze a viewing-context native query for permission gating: %s"
                  (ex-message e))
      #{})))

(defn- sandbox-visible-fields?
  "Whether every field in `field-id->table-id` survives its own table's column sandbox.

  A column sandbox hides columns of a table the caller may otherwise query, so
  [[metabot.perms/queryable-table-ids]] passing says nothing about them. A field id sandboxed away has
  to drop the whole query. Same bar `entity-details/permission-filter-columns` and
  `field-stats/check-column-table-perms!` apply to the columns they return."
  [field-id->table-id]
  (let [restricted (metabot.perms/sandbox-restricted-fields (set (vals field-id->table-id)))]
    (every? (fn [[field-id table-id]]
              (if-let [allowed (get restricted table-id)]
                (contains? allowed field-id)
                true))
            field-id->table-id)))

(defn- queryable-normalized-query
  "`[normalized metadata-provider]` for the client-supplied `query`, or nil when the current user cannot
  reach everything it names.

  Fails closed. A query that will not normalize, or that names a Table the caller cannot query, a column
  its sandbox hides, or a Card it cannot read, yields nil and the caller renders nothing."
  [query]
  (let [raw-database-id (and (map? query) (:database query))]
    ;; `:database` is client-supplied, so a non-integer would otherwise reach Toucan's queryable position
    ;;. Checked before normalizing, so a bad shape costs no app-DB round trip.
    (when (pos-int? raw-database-id)
      (try
        (let [normalized  (lib-be/normalize-query query)
              database-id (:database normalized)]
          (when (and (pos-int? database-id)
                     (mi/can-query? :model/Database database-id))
            (let [{:keys [table card field]} (exported-entity-ids normalized)
                  ;; A field id with no row drops out here, which is not a hole: `export-field-fk` throws
                  ;; on it, and that takes the whole export down with it.
                  field-table (metabot.perms/field-id->table-id field)
                  table-ids   (cond-> (into (set table) (vals field-table))
                                (native-stage? normalized) (into (native-sql-table-ids normalized)))]
              ;; `queryable-table-ids` answers `false` for a table id with no row, so an id the client
              ;; invented drops out of the set and this comparison fails closed.
              (when (and (= table-ids (metabot.perms/queryable-table-ids table-ids))
                         (sandbox-visible-fields? field-table)
                         (every? #(mi/can-read? :model/Card %) card))
                [normalized (lib-be/application-database-metadata-provider database-id)]))))
        (catch Exception e
          (log/debugf "Omitting a viewing-context query that could not be permission-checked: %s"
                      (ex-message e))
          nil)))))

(defn- transform-query-source-text
  [source]
  (let [query (:query source)]
    (cond
      (string? query) query
      (string? (:query-content query)) (:query-content query)
      (and (map? query) (:database query))
      (when-let [[normalized _mp] (queryable-normalized-query query)]
        (try
          (if (lib/native-only-query? normalized)
            (or (lib/raw-native-query normalized)
                (some :native (:stages normalized))
                (get-in normalized [:native :query]))
            (u/pprint-to-str normalized))
          (catch Exception _
            (u/pprint-to-str query))))
      ;; Legacy native shape with no :database (rare). Surface the raw SQL so the LLM at
      ;; least sees the query body; if there's no :database we can't normalise / build a MP.
      (string? (get-in query [:native :query])) (get-in query [:native :query])
      (map? query) (u/pprint-to-str query)
      :else (some-> query str))))

(defn- transform-source-type
  [source]
  (normalize-context-type (:type source)))

(defmulti format-transform-source
  "Format a transform source for LLM representation."
  {:arglists '([source])}
  transform-source-type)

(defmethod format-transform-source :default
  [source]
  (log/warn "Unknown transform source type:" (:type source))
  (te/lines "Transform source"
            (te/field "Type" (transform-source-type source))
            (te/field "Value" (u/pprint-to-str source))))

(defmethod format-transform-source "query"
  [source]
  (let [source-text (transform-query-source-text source)]
    (te/lines "Transform source"
              (te/field "Type" (:type source))
              (te/field "Query type" (:transform-source-type source))
              (te/field "Source database ID" (or (:source-database source)
                                                 (get-in source [:query :database])))
              (te/field "Query" (te/code source-text (when (= "native" (normalize-context-type (:transform-source-type source)))
                                                       "sql"))))))

(defmethod format-transform-source "python"
  [source]
  (te/lines "Transform source"
            (te/field "Type" (:type source))
            (te/field "Source database ID" (:source-database source))
            (te/field "Source tables" (some-> (:source-tables source) u/pprint-to-str))
            (te/field "Source code" (te/code (:body source) "python"))))

(defmethod format-entity "transform"
  [item]
  (te/lines "The user is currently viewing a Transform."
            (te/field "Transform ID" (:id item))
            (te/field "Transform name" (:name item))
            (te/field "Transform description" (:description item))
            (te/field "Source type" (:source_type item))
            (te/field "Source" (some-> (:source item)
                                       (assoc :transform-source-type (:source_type item))
                                       format-transform-source))
            (te/field "Transform error" (te/code (:error item)))
            (te/field "Tables used" (some->> (:used_tables item)
                                             (map format-entity)
                                             te/lines))
            (te/field "Created at" (:created_at item))
            (te/field "Updated at" (:updated_at item))))

(defmethod format-entity "code_editor"
  [{:keys [buffers]}]
  (if (empty? buffers)
    "The user is in the code editor but no active buffers are available."
    (te/lines "The user is currently in the code editor with the following buffer(s):"
              (for [{:keys [source cursor selection] :as buffer} buffers]
                (te/lines
                 (format "Buffer ID: %s | Language: %s | Database ID: %s"
                         (:id buffer) (:language source) (:database_id source))
                 (when cursor
                   (format "Cursor: Line %s, Column %s" (:line cursor) (:column cursor)))
                 (when-let [{:keys [start end text]} selection]
                   (te/lines
                    (te/field "Selected lines" (str (:line start) "-" (:line end)))
                    (te/field "Selected text" text))))))))

(defn format-viewing-context
  "Format user's current viewing context for injection into system message.

  Handles different context types:
  - adhoc: Notebook query editor
  - native: SQL editor with schema context
  - transform: Transform definition and code
  - code_editor: Code editor buffers with cursor position
  - table/model/question/metric/dashboard: Entity details

  Returns formatted string for template variable {{viewing_context}}."
  [context]
  (str/join "\n\n"
            (for [item (:user_is_viewing context)]
              (try
                (format-entity item)
                (catch Exception e
                  (log/error e "Error formatting viewing context item:" (:type item))
                  "")))))

;;; Recent Views Formatting

(defn format-recent-views
  "Format user's recently viewed items for injection into system message.

  Returns formatted string for template variable {{recent_views}}."
  [context]
  (let [items (:user_recently_viewed context)]
    (if-not (seq items)
      ""
      (te/lines "Here are some items the user has recently viewed:"
                (for [item items]
                  (format-simple-entity (select-keys item [:type :id :name :description])))
                ""
                "**Important:** These items might be relevant for answering the user's request."
                "If any item seems relevant, try to fetch its full details using the appropriate tool."
                "Otherwise, use the search tool to find relevant entities."))))

(defn format-current-user-info
  "Format the current user and glossary for injection into the system message.

  Returns XML for template variable {{current_user_info}}."
  [_context]
  (try
    (when-let [{:keys [id name email-address glossary]} (:structured-output (entity-details/get-current-user nil))]
      (llm-rep/user->xml {:id       id
                          :name     name
                          :email    email-address
                          :glossary glossary}))
    (catch Exception e
      (log/error e "Error formatting current user info")
      nil)))

;;; Context Enrichment

(defn enrich-context-for-template
  "Enrich context with all necessary variables for system prompt template rendering.

  Takes raw context from API and returns map suitable for template rendering:
  - :current_time - Formatted user time string
  - :first_day_of_week - Calendar week start (default 'Sunday')
  - :sql_dialect - SQL dialect name (lowercase)
  - :current_user_info - Formatted current user info and glossary
  - :viewing_context - Formatted viewing context
  - :recent_views - Formatted recent views"
  [context]
  {:current_time (format-current-time context)
   :first_day_of_week (get context :first_day_of_week "Sunday")
   :sql_dialect (extract-sql-dialect context)
   :current_user_info (format-current-user-info context)
   :viewing_context (format-viewing-context context)
   :recent_views (format-recent-views context)})
