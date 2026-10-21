(ns metabase.metabot.tools.sql
  "SQL tool wrappers."
  (:require
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.run-query :as tools.run-query]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.tools.sql.common :as sql.common]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.metabot.tools.sql.edit :as edit-sql-query-tools]
   [metabase.metabot.tools.sql.replace :as replace-sql-query-tools]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]))

(set! *warn-on-reflection* true)

(defn- normalize-context-type
  [type-val]
  (cond
    (keyword? type-val) (name type-val)
    (string? type-val)  (u/lower-case-en type-val)
    :else               ""))

(defn- first-code-editor-buffer-id
  [memory]
  (some->> (get-in memory [:context :user_is_viewing] [])
           (filter #(= "code_editor" (normalize-context-type (:type %))))
           first
           :buffers
           first
           :id))

(defn- format-query-output
  "Format a query result for LLM consumption.
   `preamble` is optional text placed before the query XML inside <result>
   (e.g. \"SQL query successfully constructed.\")."
  [structured instruction-text & {:keys [preamble?]}]
  (let [query-xml (llm-shape/query->xml structured)]
    (te/lines
     "<result>"
     (when preamble?
       (te/lines
        "SQL query successfully constructed."
        (str "New query ID: " (:query-id structured))
        "The complete query is shown below:"))
     query-xml
     "</result>"
     "<instructions>"
     instruction-text
     "</instructions>")))

(defn- code-edit-part
  [buffer-id sql]
  (streaming/code-edit-part {:buffer_id buffer-id
                             :mode "rewrite"
                             :value sql}))

(defn- query-viz-part
  [{:keys [query-id query]} title]
  (streaming/viz-part {:entity-id (str (random-uuid))
                       :query-id query-id
                       :query (links/->legacy-mbql query)
                       :title title}))

(defn- validated-sql-action!
  [{:keys [validation-result action-result]}]
  (let [{:keys [valid? dialect error-message reason]} validation-result]
    (cond
      valid?                          action-result
      (= :multiple-statements reason) (sql.common/multiple-sql-statements! {})
      :else                           (sql.common/sql-syntax-error! {:dialect dialect :error-message error-message}))))

;;; ──────────────────────────────────────────────────────────────────
;;; Create SQL query
;;; ──────────────────────────────────────────────────────────────────

(def ^:private create-sql-schema
  [:map {:closed true}
   [:database_id :int]
   [:sql_query :string]
   [:title :string]])

(defrecord CreateSqlQueryTool [code-edit?]
  tools/Tool
  (declaration [_]
    {:name "create_sql_query"
     :description (if code-edit?
                    "Create a new SQL query and update the code editor buffer."
                    "Create a new SQL query. Provide a short, human-friendly `title` shown above the results.")
     :scope scope/agent-sql-create
     :metabot/capabilities #{:permission-write-sql-queries}
     :args create-sql-schema})
  (handle [_ {database-id :database_id sql-query :sql_query :keys [title]} ctx]
    (let [buffer-id (when code-edit?
                      (or (first-code-editor-buffer-id (some-> (:memory-atom ctx) deref))
                          (tools/unrecoverable! ::missing-editor
                                                {:user-message (tru "No active SQL editor was found. Open a SQL editor and try again.")})))
          action-result (validated-sql-action!
                         (create-sql-query-tools/create-sql-query {:database-id database-id :sql sql-query}))
          {:keys [query-id query-content]} action-result
          structured (assoc action-result :result-type :query)
          instr (if code-edit?
                  instructions/query-loaded-in-editor-instructions
                  (instructions/query-created-instructions-for query-id (tools.run-query/sql-results-readable?)))]
      {:output (format-query-output structured instr {:preamble? true})
       :structured-output structured
       :data-parts [(if code-edit?
                      (code-edit-part buffer-id query-content)
                      (query-viz-part action-result title))]})))

(def create-sql-query-tool
  "The Chat tool that creates a SQL query and shows its visualization."
  (->CreateSqlQueryTool false))

(def create-sql-query-code-edit-tool
  "The SQL profile tool that creates a SQL query in the active editor."
  (->CreateSqlQueryTool true))

;;; ──────────────────────────────────────────────────────────────────
;;; Edit SQL query
;;; ──────────────────────────────────────────────────────────────────

(def ^:private edit-sql-schema
  [:map {:closed true}
   [:query_id [:or :string :int]]
   [:checklist :string]
   [:edits [:sequential [:map {:closed true}
                         [:old_string :string]
                         [:new_string :string]
                         [:replace_all {:optional true} [:maybe :boolean]]]]]
   [:title :string]])

(defn- sql-edit-result
  [operation-result title instruction-fn ctx]
  (let [{:keys [query-id query-content] :as action-result} (validated-sql-action! operation-result)
        structured (assoc action-result :result-type :query)
        buffer-id (first-code-editor-buffer-id (some-> (:memory-atom ctx) deref))
        instr (instruction-fn query-id (some? buffer-id))]
    {:output (format-query-output structured instr)
     :structured-output structured
     :data-parts [(if buffer-id
                    (code-edit-part buffer-id query-content)
                    (query-viz-part action-result title))]}))

(defrecord EditSqlQueryTool []
  tools/Tool
  (declaration [_]
    {:name "edit_sql_query"
     :description (str "Edit an existing SQL query using structured edits. Provide a short, "
                       "human-friendly `title` shown above the results.")
     :scope scope/agent-sql-edit
     :metabot/capabilities #{:permission-write-sql-queries}
     :args edit-sql-schema})
  (handle [_ {query-id :query_id :keys [edits checklist title]} ctx]
    (sql-edit-result (edit-sql-query-tools/edit-sql-query
                      {:query-id query-id
                       :edits edits
                       :checklist checklist
                       :queries-state (get-in (some-> (:memory-atom ctx) deref) [:state :queries] {})})
                     title instructions/edit-sql-query-instructions-for ctx)))

(def edit-sql-query-tool
  "The tool that applies structured edits to a stored SQL query."
  (->EditSqlQueryTool))

;;; ──────────────────────────────────────────────────────────────────
;;; Replace SQL query
;;; ──────────────────────────────────────────────────────────────────

(def ^:private replace-sql-schema
  [:map {:closed true}
   [:query_id [:or :string :int]]
   [:checklist :string]
   [:new_query :string]
   [:title :string]])

(defrecord ReplaceSqlQueryTool []
  tools/Tool
  (declaration [_]
    {:name "replace_sql_query"
     :description (str "Replace the SQL content of an existing query entirely. Provide a short, "
                       "human-friendly `title` shown above the results.")
     :scope scope/agent-sql-edit
     :metabot/capabilities #{:permission-write-sql-queries}
     :args replace-sql-schema})
  (handle [_ {query-id :query_id new-query :new_query :keys [checklist title]} ctx]
    (sql-edit-result (replace-sql-query-tools/replace-sql-query
                      {:query-id query-id
                       :sql new-query
                       :checklist checklist
                       :queries-state (get-in (some-> (:memory-atom ctx) deref) [:state :queries] {})})
                     title instructions/replace-sql-query-instructions-for ctx)))

(def replace-sql-query-tool
  "The tool that replaces the SQL in a stored query."
  (->ReplaceSqlQueryTool))
