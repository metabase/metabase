(ns metabase.metabot.agent.user-context
  "User context enrichment and formatting for injecting into the prompt.

  Handles formatting of viewing context (what the user is currently looking at),
  recent views, user time formatting, and SQL dialect extraction from context."
  (:require
   [clojure.string :as str]
   [medley.core :as m]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.metabot.db :as metabot.db]
   [metabase.metabot.query-export :as query-export]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.entity-details :as entity-details]
   [metabase.metabot.tools.resources :as resources-tools]
   [metabase.metabot.tools.shared.content-store :as shared.content-store]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.metabot.util :as metabot.u]
   [metabase.util :as u]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.quoting :as quoting])
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
      (log/errorf "Error formatting current time: %s" (ex-message e))
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
;; llm-shape (the output-side XML formatters), mirroring what the Python AI service did
;; via HTTP callbacks.

(defn- fetch-and-format
  "Fetch entity details and format with llm-shape. Falls back to format-simple-entity on failure."
  [entity preamble details-fn format-fn]
  (try
    (let [{:keys [structured-output]} (details-fn)]
      (if structured-output
        (te/lines preamble (format-fn structured-output))
        (format-simple-entity entity)))
    (catch Exception e
      (let [status-code (:status-code (ex-data e))]
        (cond
          (= 403 status-code)
          (do (log/debugf "Omitting viewing-context entity the current user cannot read: %s %s"
                          (:type entity) (:id entity))
              nil)

          ;; A 404 is always an intentional, expected signal here (from api/check-404), never an
          ;; accidental failure -- either the entity plainly doesn't exist, or (per
          ;; check-resource-database) it's a routing-internal destination database masquerading as
          ;; "not found" so as not to disclose its existence. Neither warrants an ERROR log; both
          ;; still render best-effort from the caller's own claimed fields, same as before.
          (= 404 status-code)
          (do (log/debugf "Falling back to simple rendering for an unresolvable viewing-context entity: %s %s"
                          (:type entity) (:id entity))
              (format-simple-entity entity))

          :else
          (do (log/error "Error fetching entity details for viewing context"
                         {:type (:type entity) :id (:id entity)}
                         (ex-message e))
              (format-simple-entity entity)))))))

(defmethod format-entity "table"
  [entity]
  (fetch-and-format entity
                    "The user is currently looking at the rows of a table:"
                    #(do (resources-tools/check-table-resource-database (:id entity))
                         (entity-details/get-table-details {:entity-type :table
                                                            :entity-id (:id entity)
                                                            :with-field-values? false
                                                            :with-metrics? false
                                                            :with-measures? true
                                                            :with-segments? true}))
                    llm-shape/table->xml))

(defmethod format-entity "model"
  [entity]
  ;; A model the user cannot read is omitted, together with its query ID, SQL and query error.
  (some-> (fetch-and-format entity
                            "The user is currently looking at the rows of a model:"
                            #(do (resources-tools/check-card-resource-database (:id entity))
                                 (entity-details/get-table-details {:entity-type :model
                                                                    :entity-id (:id entity)
                                                                    :with-field-values? false
                                                                    :with-metrics? false
                                                                    :with-measures? true
                                                                    :with-segments? true}))
                            llm-shape/model->xml)
          (te/lines (te/field "Query ID" (:query_id entity))
                    (te/field "Current SQL query" (te/code (metabot.u/extract-sql-content (:query entity)) "sql"))
                    (when-some [error (:error entity)]
                      (te/field "Query error" (quoting/quoted error))))))

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
  "Format viewing `item`. In a host app (`:in_host_app`, stamped on the item by
  [[format-viewing-context]]) there is no SQL editor, so the item is described as a query the user is
  looking at rather than an editor they are in."
  [item]
  (let [{:keys [database-id query-str]} (native-query-details (:query item))
        question? (= "question" (effective-context-type item))]
    (te/lines
     (if (:in_host_app item)
       "The user is currently looking at a SQL query."
       "The user is currently in the SQL editor.")
     (when question?
       (te/field "Question ID" (:id item)))
     ;; The `:id` of a saved question is its card ID. Its query has a different ID, which
     ;; `metabase.metabot.agent.core/assign-context-ids` sets as `:query_id`.
     (te/field "Query ID" (if question? (:query_id item) (:id item)))
     (te/field "Current SQL query" (te/code query-str "sql"))
     (te/field "Database ID" database-id)
     (te/field "Database SQL engine" (:sql_engine item))
     (when-some [error (:error item)]
       (te/field "Query error" (quoting/quoted error)))
     (when-let [config-ids (format-chart-config-ids item)]
       (te/field "Chart Config IDs (for analyze_chart tool)" config-ids))
     (te/field "Tables used" (some->> (:used_tables item)
                                      (map format-entity)
                                      te/lines)))))

(defmethod format-entity "question"
  [entity]
  (if (native-query-item? entity)
    (format-native-query entity)
    ;; A question the user cannot read is omitted, together with its query ID.
    (some-> (fetch-and-format entity
                              "The user is currently looking at the results of a report:"
                              #(do (resources-tools/check-card-resource-database (:id entity))
                                   (entity-details/get-report-details {:report-id (:id entity)
                                                                       :with-field-values? false}))
                              llm-shape/question->xml)
            (te/lines (te/field "Query ID" (:query_id entity))))))

(defmethod format-entity "metric"
  [entity]
  (fetch-and-format entity
                    "The user is currently looking at the details of a metric:"
                    #(do (resources-tools/check-card-resource-database (:id entity))
                         (entity-details/get-metric-details {:metric-id (:id entity)
                                                             :with-field-values? false}))
                    llm-shape/metric->xml))

(defn- with-open-tab
  "The dashboard `details` with `:open_tab`, the tab with `tab-id`, when that tab is on the dashboard."
  [details tab-id]
  ;; A stale tab id from the frontend is left out, so it can't send a chart to another dashboard's tab.
  (if-let [tab (when tab-id
                 (m/find-first #(= tab-id (:id %)) (metabot.db/dashboard-tabs (:id details))))]
    (assoc details :open_tab tab)
    details))

(defmethod format-entity "dashboard"
  [entity]
  (fetch-and-format entity
                    "The user is currently looking at the details of a dashboard:"
                    #(update (entity-details/get-dashboard-details {:dashboard-id (:id entity)})
                             :structured-output
                             (fn [details] (some-> details (with-open-tab (:tab_id entity)))))
                    llm-shape/dashboard->xml))

;;; Viewing Context Formatting

(def ^:private max-listed-columns
  "The most columns that the ad-hoc query's column list shows."
  100)

(def ^:private columns-header
  "The text before the column list. It tells the LLM how to refer to each column."
  (str "Columns the query can use (name, display name, type, and the portable FK of a table column). "
       "Refer to an `[expression]` column, a custom column of this stage, as `[\"expression\", {}, name]`. "
       "Refer to any other column by its portable FK when its line has one, and by its name otherwise. "
       "A joined column also needs its `join-alias`:"))

(defn- column-portable-fk
  "The portable FK of `column` when it comes from a table of `query`, or nil."
  [query column]
  ;; In stage 0 of a table source, the construct tool resolves a field ref only by its portable FK. A
  ;; column of a card or of an earlier stage is referred to by its name, so it gets no portable FK.
  (when (and (#{:source/table-defaults :source/joins} (:lib/source column))
             (nil? (:lib/card-id column)))
    ;; Catch per column, as [[metabot.tools.u/->result-column]] does: a failed lookup drops this FK, not the list.
    (try (metabot.tools.u/column-portable-fk query column)
         (catch Exception _ nil))))

(defn- column-ref-name
  "The name by which a ref in the last stage of the query refers to `column`.

  A string ref resolves against the column's `:lib/source-column-alias`, so a joined column of an earlier
  stage is \"Cat__NAME\", not \"NAME\". The fallback is `:name`."
  [column]
  ((some-fn :lib/source-column-alias :name) column))

(defn- column-line
  "One column of `query` as a list line.

    - [join \"Cat\"] \"NAME\", display name \"Cat → Name\", type/Text, portable FK [\"DB\",\"PUBLIC\",\"CATEGORIES\",\"NAME\"]
    - [expression] \"Double\", display name \"Double\", type/Float"
  [query column]
  (str "- "
       ;; Only a custom column of the last stage takes an `expression` ref. A card's or an earlier
       ;; stage's custom column is a `field` ref by name, like any other column.
       (when (= :source/expressions (:lib/source column))
         "[expression] ")
       (when-let [join-alias (lib/current-join-alias column)]
         (str "[join " (quoting/quoted join-alias) "] "))
       (quoting/quoted (column-ref-name column))
       ;; The `:long` style adds the join alias, as the UI shows a joined column: "Cat → Name".
       ", display name " (quoting/quoted (lib/display-name query -1 column :long))
       ", " (u/qualified-name (or (:effective-type column) (:base-type column)))
       (when-let [portable-fk (column-portable-fk query column)]
         (str ", portable FK " (quoting/escape-code-points (json/encode portable-fk) quoting/escaped-code-point?)))))

(defn- column-group
  "The group of `column` in the column list: `[:source]`, `[:expressions]`, or `[:join alias]`."
  [column]
  ;; The same predicates as the marks of [[column-line]].
  (if (= :source/expressions (:lib/source column))
    [:expressions]
    (if-let [join-alias (lib/current-join-alias column)]
      [:join join-alias]
      [:source])))

(defn- fair-shares
  "How many lines each group keeps, for groups of `sizes` that share `limit` lines.

    (fair-shares [150 150 3] 100) ;=> [49 48 3]

  A group smaller than an equal share keeps all its lines, and its unused lines go to the other groups. The
  lines that do not divide evenly go to the first groups that are still cut."
  [sizes limit]
  (let [used        (fn [level] (reduce + (map #(min % level) sizes)))
        level       (last (take-while #(<= (used %) limit) (range (inc limit))))
        spare       (- limit (used level))
        extra-line? (set (take spare (keep-indexed (fn [i size] (when (> size level) i)) sizes)))]
    (into [] (map-indexed (fn [i size] (if (extra-line? i) (inc level) (min size level)))) sizes)))

(defn- hidden-count-line
  "The line that counts the `hidden` columns of a cut group.

  One group alone gets no group name.

    - ... and 9 more source columns
    - ... and 70 more [join \"Cat\"] columns"
  [[kind join-alias] hidden one-group?]
  (str "- ... and " hidden " more"
       (cond
         one-group?            nil
         (= kind :source)      " source columns"
         (= kind :expressions) " [expression] columns"
         :else                 (str " [join " (quoting/quoted join-alias) "] columns"))))

(defn- column-list
  "The column list for `columns` of `query`, at most [[max-listed-columns]] column lines.

  Each run of columns with one mark (source, custom column, or one join) shares the lines fairly. Each
  group that is cut ends with a count of its hidden columns. Nil when `columns` is empty."
  [query columns]
  (when (seq columns)
    ;; Each run of one group key is a group. A metric source repeats a key: its own custom columns and joins
    ;; come before those of this stage (`metric-visible-columns`). A repeated key gives a second group, which
    ;; keeps the order.
    (let [groups     (partition-by column-group columns)
          one-group? (= 1 (count groups))
          shares     (if (<= (count columns) max-listed-columns)
                       (map count groups)
                       (fair-shares (map count groups) max-listed-columns))]
      (te/lines (map (fn [group share]
                       (let [hidden (- (count group) share)]
                         [(map #(column-line query %) (take share group))
                          (when (pos? hidden)
                            (hidden-count-line (column-group (first group)) hidden one-group?))]))
                     groups shares)))))

(defn- permitted-column-list
  "The column list of the last stage of a cleared `query`, without the columns that the current user cannot see.

  Nil when the columns cannot be calculated."
  [query mp]
  (try
    (let [query (lib/query mp query)]
      (column-list query
                   ;; Implicitly joinable columns are not included, so that foreign-key targets do not
                   ;; multiply the list.
                   (->> (lib/visible-columns query -1 {:include-implicitly-joinable?                 false
                                                       :include-implicitly-joinable-for-source-card? false})
                        ;; Remove the columns that table permissions or a sandbox hide.
                        entity-details/permission-filter-columns)))
    (catch Exception e
      (log/warn e "Omitting the column list of an ad-hoc query")
      nil)))

(defn- exported-query
  "The client-supplied query rendered for the LLM, with its column list, or nil when the current user may not see the query.

  The column list is present only when the permission check cleared the query with a metadata
  provider."
  [query]
  ;; The database refusal is audited for the same reason that the query's card ids get the audited
  ;; store: the id is the caller's own.
  ;; One check per item: a refusal is not cached, and each check writes an audit entry.
  (when-let [{:keys [mp] :as export} (shared.content-store/query-for-export query true)]
    (when-let [text (query-export/export->text export shared.content-store/audited-store)]
      {:text    text
       :columns (when mp
                  (permitted-column-list (:query export) mp))})))

;; Format adhoc query (notebook editor) viewing context.
(defmethod format-entity "adhoc"
  [item]
  (if (native-query-item? item)
    (format-native-query item)
    (let [{:keys [text columns]} (exported-query (:query item))]
      (te/lines "The user is currently in the notebook editor viewing a query."
                (te/field "Query ID" (:id item))
                (te/field "Database ID" (get-in item [:query :database]))
                (te/field "Query" text)
                (when columns
                  (te/lines columns-header columns ""))
                (when-let [config-ids (format-chart-config-ids item)]
                  (te/field "Chart Config IDs (for analyze_chart tool)" config-ids))
                (te/field "Tables used" (some->> (:used_tables item)
                                                 (map format-entity)
                                                 te/lines))))))

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
  "Format user's current viewing context.

  Handles different context types:
  - adhoc: Notebook query editor, or the SQL editor when the query is native (described as a query the
    user is looking at when the context carries the server-set `:in_host_app`)
  - code_editor: Code editor buffers with cursor position
  - table/model/question/metric/dashboard: Entity details

  Returns formatted string for template variable {{viewing_context}}."
  [context]
  (str/join "\n\n"
            (for [item (:user_is_viewing context)]
              (try
                ;; The server-decided host-app flag travels with each item so native items can be
                ;; described without naming an editor that does not exist there.
                (format-entity (cond-> item (:in_host_app context) (assoc :in_host_app true)))
                (catch Exception e
                  (log/error "Error formatting viewing context item:" (:type item) (ex-message e))
                  "")))))

;;; Recent Views Formatting

(defn format-recent-views
  "Format user's recently viewed items.

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
  "Format the current user and glossary.

  Returns XML for template variable {{current_user_info}}."
  [_context]
  (try
    (when-let [{:keys [id name email-address glossary]} (:structured-output (entity-details/get-current-user nil))]
      (llm-shape/user->xml {:id       id
                            :name     name
                            :email    email-address
                            :glossary glossary}))
    (catch Exception e
      (log/errorf "Error formatting current user info: %s" (ex-message e))
      nil)))

;;; Context Enrichment

(defn enrich-context-for-template
  "Enrich context with all necessary variables for rendering the message-injection template.

  Takes raw context from API and returns map suitable for template rendering:
  - :current_time - Formatted user time string
  - :first_day_of_week - Calendar week start (default 'Sunday')
  - :current_user_info - Formatted current user info and glossary
  - :viewing_context - Formatted viewing context
  - :recent_views - Formatted recent views

  This is the user-message injection context only. Per-profile, feature-specific system-prompt
  content is contributed separately, via a profile's `:system-prompt-context` hook (see
  `metabase.metabot.agent.messages/build-system-message`)."
  [context]
  {:current_time (format-current-time context)
   :first_day_of_week (get context :first_day_of_week "Sunday")
   :current_user_info (format-current-user-info context)
   :viewing_context (format-viewing-context context)
   :recent_views (format-recent-views context)})
