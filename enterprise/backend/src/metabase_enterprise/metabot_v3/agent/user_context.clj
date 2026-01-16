(ns metabase-enterprise.metabot-v3.agent.user-context
  "User context enrichment and formatting for agent system messages.

  Handles formatting of viewing context (what the user is currently looking at),
  recent views, user time formatting, and SQL dialect extraction from context."
  (:require
   [clojure.string :as str]
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

(defn extract-sql-dialect
  "Extract SQL dialect name from context.

  Looks for dialect in:
  1. Native query context (:sql_engine field)
  2. Transform context (:sql_engine field)
  3. Database connection in viewing context

  Returns lowercase dialect name suitable for loading dialect instructions."
  [context]
  (when-let [viewing (:user_is_viewing context)]
    (or
     ;; Check for any viewing item that includes sql_engine
     (some (fn [item]
             (some-> (:sql_engine item) str/lower-case))
           viewing)
     ;; Default to nil if not found
     nil)))

;;; Context Normalization

(defn- normalize-context-type
  "Normalize context :type to lowercase string."
  [type-val]
  (cond
    (keyword? type-val) (name type-val)
    (string? type-val) type-val
    (nil? type-val) nil
    :else (str type-val)))

;;; Entity Formatting

(defn- format-table-representation
  "Format a table entity for LLM representation."
  [table]
  (str "Table: " (:name table)
       (when (:id table) (str " (ID: " (:id table) ")"))
       (when (:description table) (str "\nDescription: " (:description table)))
       (when-let [fields (:fields table)]
         (str "\nFields: " (str/join ", " (map :name fields))))))

(defn- format-model-representation
  "Format a model entity for LLM representation."
  [model]
  (str "Model: " (:name model)
       (when (:id model) (str " (ID: " (:id model) ")"))
       (when (:description model) (str "\nDescription: " (:description model)))
       (when-let [fields (:fields model)]
         (str "\nFields: " (str/join ", " (map :name fields))))))

(defn- format-question-representation
  "Format a question/report entity for LLM representation."
  [question]
  (str "Question: " (:name question)
       (when (:id question) (str " (ID: " (:id question) ")"))
       (when (:description question) (str "\nDescription: " (:description question)))))

(defn- format-metric-representation
  "Format a metric entity for LLM representation."
  [metric]
  (str "Metric: " (:name metric)
       (when (:id metric) (str " (ID: " (:id metric) ")"))
       (when (:description metric) (str "\nDescription: " (:description metric)))))

(defn- format-dashboard-representation
  "Format a dashboard entity for LLM representation."
  [dashboard]
  (str "Dashboard: " (:name dashboard)
       (when (:id dashboard) (str " (ID: " (:id dashboard) ")"))
       (when (:description dashboard) (str "\nDescription: " (:description dashboard)))))

;;; Viewing Context Formatting

(defn- format-adhoc-query-context
  "Format adhoc query (notebook editor) viewing context."
  [item]
  (let [query (:query item)]
    (str "The user is currently in the notebook editor.\n"
         (when (:data_source query)
           (str "Query data source: " (:data_source query) "\n"))
         (when-let [used-tables (:used_tables item)]
           (str "Tables used:\n"
                (str/join "\n" (map format-table-representation used-tables))
                "\n")))))

(defn- format-native-query-context
  "Format native SQL query viewing context."
  [item]
  (str "The user is currently in the SQL editor.\n"
       (when-let [query (:query item)]
         (str "Current SQL query:\n```sql\n" query "\n```\n"))
       (when-let [sql-engine (:sql_engine item)]
         (str "Database SQL engine: " sql-engine "\n"))
       (when-let [error (:error item)]
         (str "Query error:\n```\n" error "\n```\n"))
       (when-let [used-tables (:used_tables item)]
         (str "Tables used:\n"
              (str/join "\n" (map format-table-representation used-tables))
              "\n"))))

(defn- format-transform-context
  "Format transform viewing context."
  [item]
  (str "The user is currently viewing a Transform.\n"
       (when (:id item)
         (str "Transform ID: " (:id item) "\n"))
       (when (:name item)
         (str "Transform name: " (:name item) "\n"))
       (when-let [source-type (:source_type item)]
         (str "Source type: " source-type "\n"))
       (when-let [used-tables (:used_tables item)]
         (str "Tables used:\n"
              (str/join "\n" (map format-table-representation used-tables))
              "\n"))))

(defn- format-code-editor-context
  "Format code editor viewing context."
  [item]
  (if (empty? (:buffers item))
    "\nThe user is in the code editor but no active buffers are available."
    (let [buffers (:buffers item)]
      (str "\nThe user is currently in the code editor with the following buffer(s):\n"
           (str/join "\n"
                     (for [buffer buffers]
                       (str "Buffer ID: " (:id buffer)
                            " | Language: " (get-in buffer [:source :language])
                            " | Database ID: " (get-in buffer [:source :database_id])
                            (when-let [cursor (:cursor buffer)]
                              (str "\nCursor: Line " (:line cursor) ", Column " (:column cursor)))
                            (when-let [selection (:selection buffer)]
                              (str "\nSelection: Lines " (get-in selection [:start :line])
                                   "-" (get-in selection [:end :line])
                                   "\nSelected text:\n" (:text selection))))))))))

(defn- format-entity-context
  "Format entity (table/model/question/metric/dashboard) viewing context."
  [item]
  (case (:type item)
    "table"
    (str "The user is currently looking at a table:\n"
         (format-table-representation item))

    "model"
    (str "The user is currently looking at a model:\n"
         (format-model-representation item))

    "question"
    (str "The user is currently looking at a question:\n"
         (format-question-representation item))

    "metric"
    (str "The user is currently looking at a metric:\n"
         (format-metric-representation item))

    "dashboard"
    (str "The user is currently looking at a dashboard:\n"
         (format-dashboard-representation item))

    ;; Unknown entity type
    (do
      (log/warn "Unknown entity type in viewing context:" (:type item))
      "")))

(defn format-viewing-context
  "Format user's current viewing context for injection into system message.

  Handles different context types:
  - adhoc: Notebook query editor
  - native: SQL editor with schema context
  - transform: Transform definition and code
  - code-editor: Code editor buffers with cursor position
  - table/model/question/metric/dashboard: Entity details

  Returns formatted string for template variable {{viewing_context}}."
  [context]
  (if-not (:user_is_viewing context)
    ""
    (str/join "\n\n"
              (for [item (:user_is_viewing context)]
                (try
                  (let [item-type (normalize-context-type (:type item))]
                    (cond
                    ;; Adhoc query (notebook editor)
                      (= item-type "adhoc")
                      (format-adhoc-query-context item)

                    ;; Native SQL query
                      (= item-type "native")
                      (format-native-query-context item)

                    ;; Transform
                      (= item-type "transform")
                      (format-transform-context item)

                    ;; Code editor
                      (= item-type "code-editor")
                      (format-code-editor-context item)

                    ;; Entity (table, model, question, metric, dashboard)
                      (contains? #{"table" "model" "question" "metric" "dashboard"} item-type)
                      (format-entity-context (assoc item :type item-type))

                    ;; Unknown type
                      :else
                      (do
                        (log/warn "Unknown viewing context type:" (:type item))
                        "")))
                  (catch Exception e
                    (log/error e "Error formatting viewing context item:" (:type item))
                    ""))))))

;;; Recent Views Formatting

(defn format-recent-views
  "Format user's recently viewed items for injection into system message.

  Returns formatted string for template variable {{recent_views}}."
  [context]
  (if-not (:user_recently_viewed context)
    ""
    (let [items (:user_recently_viewed context)]
      (str "Here are some items the user has recently viewed:\n"
           (str/join "\n"
                     (for [item items]
                       (str "- " (:type item) ": " (:name item)
                            (when (:id item) (str " (ID: " (:id item) ")"))
                            (when (:description item) (str " - " (:description item))))))
           "\n\n"
           "**Important:** These items might be relevant for answering the user's request. "
           "If any item seems relevant, try to fetch its full details using the appropriate tool. "
           "Otherwise, use the search tool to find relevant entities."))))

;;; Context Enrichment

(defn enrich-context-for-template
  "Enrich context with all necessary variables for system prompt template rendering.

  Takes raw context from API and returns map suitable for template rendering:
  - :current_time - Formatted user time string
  - :first_day_of_week - Calendar week start (default 'Sunday')
  - :sql_dialect - SQL dialect name (lowercase)
  - :viewing_context - Formatted viewing context
  - :recent_views - Formatted recent views"
  [context]
  {:current_time (format-current-time context)
   :first_day_of_week (get context :first_day_of_week "Sunday")
   :sql_dialect (extract-sql-dialect context)
   :viewing_context (format-viewing-context context)
   :recent_views (format-recent-views context)})
