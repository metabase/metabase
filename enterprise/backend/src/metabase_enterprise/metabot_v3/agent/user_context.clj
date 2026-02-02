(ns metabase-enterprise.metabot-v3.agent.user-context
  "User context enrichment and formatting for agent system messages.

  Handles formatting of viewing context (what the user is currently looking at),
  recent views, user time formatting, and SQL dialect extraction from context."
  (:require
   [clojure.string :as str]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.time OffsetDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

;;; Templating

(defn- md [& elements]
  (->> elements
       flatten
       (remove nil?)
       (str/join "\n")))

(defn- code
  ([content] (code content nil))
  ([content lang]
   (when content
     (str "```" (or lang "") "\n" content "\n```\n"))))

(defn- field [label value]
  (cond
    (nil? value)               nil
    (str/includes? value "\n") (str label ":\n" value)
    :else                      (str label ": " value "\n")))

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

(declare normalize-context-type)

(defn extract-sql-dialect
  "Extract SQL dialect name from context.

  Looks for dialect in native SQL editor context (:sql_engine field).

  Returns lowercase dialect name suitable for loading dialect instructions."
  [context]
  (when-let [viewing (:user_is_viewing context)]
    (or
     (some (fn [item]
             (when (= "native" (normalize-context-type (:type item)))
               (some-> (:sql_engine item) u/lower-case-en)))
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

(defn- format-simple-entity
  [entity]
  (md
   (field (:type entity) (str (:name entity) " (ID: " (or (:id entity) "-") ")"))
   (field "Description" (:description entity))
   (field "Fields" (some->> (:fields entity) (map :name) (str/join ", ")))))

(defmulti ^{:arglists '([entity])} format-entity "Format an entity for LLM representation."
  (fn [entity] (normalize-context-type (:type entity))))

(defmethod format-entity :default [entity]
  (log/warn "Unknown viewing context type:" (:type entity))
  "")

(defmethod format-entity "table" [entity] (format-simple-entity entity))
(defmethod format-entity "model" [entity] (format-simple-entity entity))
(defmethod format-entity "question" [entity] (format-simple-entity entity))
(defmethod format-entity "metric" [entity] (format-simple-entity entity))
(defmethod format-entity "dashboard" [entity] (format-simple-entity entity))

;;; Viewing Context Formatting

;; Format adhoc query (notebook editor) viewing context.
(defmethod format-entity "adhoc"
  [item]
  (md "The user is currently in the notebook editor."
      (field "Query data source" (-> item :query :data_source))
      (field "Tables used" (some->> (:used_tables item)
                                    (map format-entity)
                                    md))))

;; Format native SQL query viewing context.
(defmethod format-entity "native"
  [item]
  (md
   "The user is currently in the SQL editor."
   (field "Current SQL query" (code (:query item) "sql"))
   (field "Database SQL engine" (:sql_engine item))
   (field "Query error" (code (:error item)))
   (field "Tables used" (some->> (:used_tables item)
                                 (map format-entity)
                                 md))))

(defmethod format-entity "transform"
  [item]
  (md "The user is currently viewing a Transform."
      (field "Transform ID" (:id item))
      (field "Transform name" (:name item))
      (field "Source type" (:source_type item))
      (field "Tables used" (some->> (:used_tables item)
                                    (map format-entity)
                                    md))))

(defmethod format-entity "code-editor"
  [{:keys [buffers]}]
  (if (empty? buffers)
    "The user is in the code editor but no active buffers are available."
    (md "The user is currently in the code editor with the following buffer(s):"
        (for [{:keys [source cursor selection] :as buffer} buffers]
          (md
           (format "Buffer ID: %s | Language: %s | Database ID: %s"
                   (:id buffer) (:language source) (:database_id source))
           (when cursor
             (format "Cursor: Line %s, Column %s" (:line cursor) (:column cursor)))
           (when-let [{:keys [start end text]} selection]
             (md
              (field "Selected lines" (str (:line start) "-" (:line end)))
              (field "Selected text" text))))))))

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
  (if-not (:user_recently_viewed context)
    ""
    (let [items (:user_recently_viewed context)]
      (md "Here are some items the user has recently viewed:"
          (for [item items]
            (format-simple-entity (select-keys item [:type :id :name :description])))
          ""
          "**Important:** These items might be relevant for answering the user's request."
          "If any item seems relevant, try to fetch its full details using the appropriate tool."
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
