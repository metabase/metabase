(ns metabase.metabot.tools.sql
  "SQL tool wrappers."
  (:require
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.error :as tools.error]
   [metabase.metabot.tools.run-query :as tools.run-query]
   [metabase.metabot.tools.shared :as shared]
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

(defn- first-code-editor-buffer
  [memory]
  (some->> (get-in memory [:context :user_is_viewing] [])
           (filter #(= "code_editor" (normalize-context-type (:type %))))
           first
           :buffers
           first))

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

(defn- with-show-sql
  "Mark `part` with `:show_sql true` when the model asked to show the SQL to the user."
  [part show-sql?]
  (cond-> part
    show-sql? (assoc-in [:data :show_sql] true)))

(def ^:private show-sql-schema
  [:show_sql {:optional true}
   [:maybe [:boolean {:description (str "Set to true only when the user's latest message asks to see the SQL. "
                                        "Do not set it for a change to the results or the chart.")}]]])

(def ^:private notebook-tool-name "construct_notebook_query")

(tools/defrecoverable no-native-permission-with-notebook-fallback!
  "The user may not write SQL against the target database, and the notebook builder is offered this turn."
  {:payload [:map {:closed true}]}
  [_]
  {:message  "You do not have permission to write SQL against this database."
   :recovery [sql.common/notebook-instead-step]})

(tools/defrecoverable sql-on-audit-database-with-notebook-fallback!
  "The SQL targets the audit database, and the notebook builder is offered this turn."
  {:payload [:map {:closed true}]}
  [_]
  {:message  "Metabase does not run SQL on the Internal Metabase Database, for any user."
   :recovery [sql.common/notebook-instead-step]})

(defn- do-with-notebook-fallback
  "Call `thunk`, making SQL refusals recoverable when the notebook builder is offered this turn."
  [ctx thunk]
  ;; A user who may write SQL on any database gets the SQL tools, so the agent can pick a database where they may not.
  ;; The recoverable error lets it try the notebook builder instead of ending the turn.
  (try
    (thunk)
    (catch clojure.lang.ExceptionInfo e
      (if-let [recovery-code (when (contains? (:tool-names ctx) notebook-tool-name)
                               (case (get-in (ex-data e) [tools.error/error-key :code])
                                 ::sql.common/no-native-permission ::no-native-permission-with-notebook-fallback
                                 ::sql.common/sql-on-audit-database ::sql-on-audit-database-with-notebook-fallback
                                 nil))]
        (tools.error/throw-recoverable! recovery-code {} {:cause e})
        (throw e)))))

(defn- query-viz-part
  [{:keys [query-id query]} title]
  (streaming/viz-part {:entity-id (str (random-uuid))
                       :query-id query-id
                       :query (links/->frontend-query query)
                       :title title}))

;;; ──────────────────────────────────────────────────────────────────
;;; Create SQL query
;;; ──────────────────────────────────────────────────────────────────

(def ^:private create-sql-schema
  [:map {:closed true}
   [:database_id :int]
   [:sql_query :string]
   [:title :string]
   show-sql-schema])

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
  (handle [_ {database-id :database_id sql-query :sql_query show-sql? :show_sql :keys [title]} ctx]
    (let [buffer-id (when code-edit?
                      (or (:id (first-code-editor-buffer (some-> (:memory-atom ctx) deref)))
                          (tools/unrecoverable! ::missing-editor
                                                {:user-message (tru "No active SQL editor was found. Open a SQL editor and try again.")})))
          action-result (sql.common/validated-sql-action!
                         (do-with-notebook-fallback
                          ctx #(create-sql-query-tools/create-sql-query {:database-id database-id :sql sql-query})))
          {:keys [query-id query-content]} action-result
          structured (assoc action-result :result-type :query)
          instr (if code-edit?
                  instructions/query-loaded-in-editor-instructions
                  (instructions/query-created-instructions-for query-id (tools.run-query/sql-results-readable?)))]
      {:output (format-query-output structured instr {:preamble? true})
       :structured-output structured
       :data-parts [(with-show-sql (if code-edit?
                                     (code-edit-part buffer-id query-content)
                                     (query-viz-part action-result title))
                      show-sql?)]})))

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
   [:title :string]
   show-sql-schema])

(defn- delivery
  "How an updated query reaches the user: `:applied` or `:proposed` in an open editor `buffer`, else `:link`."
  [buffer]
  (cond
    (:auto_apply buffer) :applied
    buffer               :proposed
    :else                :link))

(defn- sql-edit-result
  [operation-result title instruction-fn ctx & {:keys [edit? show-sql?]}]
  (let [{:keys [query-id query-content] :as action-result} (sql.common/validated-sql-action!
                                                            operation-result {:edit? edit?})
        structured (assoc action-result :result-type :query)
        buffer (first-code-editor-buffer (some-> (:memory-atom ctx) deref))
        instr (instruction-fn query-id (delivery buffer))]
    {:output (format-query-output structured instr)
     :structured-output structured
     :data-parts [(with-show-sql (if buffer
                                   (code-edit-part (:id buffer) query-content)
                                   (query-viz-part action-result title))
                    show-sql?)]}))

(defrecord EditSqlQueryTool []
  tools/Tool
  (declaration [_]
    {:name "edit_sql_query"
     :description (str "Edit an existing SQL query using structured edits. Provide a short, "
                       "human-friendly `title` shown above the results. To show the current SQL to the user "
                       "without a change, send no edits and `show_sql: true`.")
     :scope scope/agent-sql-edit
     :metabot/capabilities #{:permission-write-sql-queries}
     :args edit-sql-schema})
  (handle [_ {query-id :query_id show-sql? :show_sql :keys [edits checklist title]} ctx]
    (sql-edit-result (do-with-notebook-fallback
                      ctx #(edit-sql-query-tools/edit-sql-query
                            {:query-id query-id
                             :edits edits
                             :checklist checklist
                             :show-sql? show-sql?
                             :queries-state (shared/current-queries-state (:memory-atom ctx))}))
                     title
                     (if (and (empty? edits) show-sql?)
                       instructions/sql-shown-instructions-for
                       instructions/edit-sql-query-instructions-for)
                     ctx {:edit? true :show-sql? show-sql?})))

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
   [:title :string]
   show-sql-schema])

(defrecord ReplaceSqlQueryTool []
  tools/Tool
  (declaration [_]
    {:name "replace_sql_query"
     :description (str "Replace the SQL content of an existing query entirely. Provide a short, "
                       "human-friendly `title` shown above the results.")
     :scope scope/agent-sql-edit
     :metabot/capabilities #{:permission-write-sql-queries}
     :args replace-sql-schema})
  (handle [_ {query-id :query_id new-query :new_query show-sql? :show_sql :keys [checklist title]} ctx]
    (sql-edit-result (do-with-notebook-fallback
                      ctx #(replace-sql-query-tools/replace-sql-query
                            {:query-id query-id
                             :sql new-query
                             :checklist checklist
                             :queries-state (shared/current-queries-state (:memory-atom ctx))}))
                     title instructions/replace-sql-query-instructions-for ctx {:show-sql? show-sql?})))

(def replace-sql-query-tool
  "The tool that replaces the SQL in a stored query."
  (->ReplaceSqlQueryTool))
