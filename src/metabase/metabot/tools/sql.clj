(ns metabase.metabot.tools.sql
  "SQL tool wrappers."
  (:require
   [medley.core :as m]
   [metabase.metabot.agent.links :as links]
   [metabase.metabot.agent.memory :as memory]
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

(defn- query-delivery
  "Returns how a query reaches the user: `:editor`, proposed in the open SQL editor buffer `buffer-id`; `:hidden`,
   not shown at all, when `show-chart` is false and `readable?` says run_query can read the results; `:link`, shown
   as a chart."
  [buffer-id show-chart readable?]
  (cond
    buffer-id                           :editor
    ;; Where the model cannot read the results, the chart is the one way the user sees anything.
    (and (false? show-chart) readable?) :hidden
    :else                               :link))

(defn- delivery-parts
  "Returns the data parts that deliver `action-result` by `delivery`, as [[query-delivery]] returns it, or nil for
   `:hidden`."
  [delivery buffer-id {:keys [query-content] :as action-result} title]
  (case delivery
    :editor [(code-edit-part buffer-id query-content)]
    :link   [(query-viz-part action-result title)]
    :hidden nil))

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
     ;; The editor variant proposes the query in the open buffer and never shows a chart.
     :args (cond-> create-sql-schema
             (not code-edit?) (conj shared/show-chart-arg))})
  (handle [_ {database-id :database_id sql-query :sql_query :keys [title show_chart]} ctx]
    (let [buffer-id     (when code-edit?
                          (or (first-code-editor-buffer-id (some-> (:memory-atom ctx) deref))
                              (tools/unrecoverable!
                               ::missing-editor
                               {:user-message
                                (tru "No active SQL editor was found. Open a SQL editor and try again.")})))
          action-result (sql.common/validated-sql-action!
                         (do-with-notebook-fallback
                          ctx #(create-sql-query-tools/create-sql-query {:database-id database-id :sql sql-query})))
          query-id      (:query-id action-result)
          structured    (assoc action-result :result-type :query)
          readable?     (and (not code-edit?) (tools.run-query/sql-results-readable?))
          delivery      (query-delivery buffer-id show_chart readable?)
          instr         (case delivery
                          :editor instructions/query-loaded-in-editor-instructions
                          :hidden (instructions/query-hidden-instructions-for query-id)
                          :link   (instructions/query-created-instructions-for query-id readable?))]
      (m/assoc-some {:output            (format-query-output structured instr {:preamble? true})
                     :structured-output structured}
                    :data-parts (delivery-parts delivery buffer-id action-result title)))))

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
   shared/show-chart-arg])

(defn- sql-edit-result!
  "The result of an edit or replace, delivered to the user as [[query-delivery]] decides."
  [operation-result title show-chart instruction-fn ctx & {:keys [edit?]}]
  (let [{:keys [query-id query] :as action-result} (sql.common/validated-sql-action! operation-result {:edit? edit?})
        structured                                  (assoc action-result :result-type :query)
        buffer-id                                   (first-code-editor-buffer-id (some-> (:memory-atom ctx) deref))
        ;; Readability reads the app DB, so it is checked only when it can change the delivery.
        delivery                                    (query-delivery buffer-id show-chart
                                                                    (and (not buffer-id)
                                                                         (false? show-chart)
                                                                         (tools.run-query/sql-results-readable?)))]
    ;; The calls after this one in the same model response read this query before the agent loop stores the results
    (some-> (:memory-atom ctx) (swap! memory/set-query query-id query))
    (m/assoc-some {:output            (format-query-output structured (instruction-fn query-id delivery))
                   :structured-output structured}
                  :data-parts (delivery-parts delivery buffer-id action-result title))))

(defrecord EditSqlQueryTool []
  tools/Tool
  (declaration [_]
    {:name "edit_sql_query"
     :description (str "Edit an existing SQL query using structured edits. Provide a short, "
                       "human-friendly `title` shown above the results.")
     :scope scope/agent-sql-edit
     :metabot/capabilities #{:permission-write-sql-queries}
     :metabot/runs-alone? true
     :args edit-sql-schema})
  (handle [_ {query-id :query_id :keys [edits checklist title show_chart]} ctx]
    (sql-edit-result! (do-with-notebook-fallback
                       ctx #(edit-sql-query-tools/edit-sql-query
                             {:query-id query-id
                              :edits edits
                              :checklist checklist
                              :queries-state (shared/current-queries-state (:memory-atom ctx))}))
                      title show_chart instructions/edit-sql-query-instructions-for ctx {:edit? true})))

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
   shared/show-chart-arg])

(defrecord ReplaceSqlQueryTool []
  tools/Tool
  (declaration [_]
    {:name "replace_sql_query"
     :description (str "Replace the SQL content of an existing query entirely. Provide a short, "
                       "human-friendly `title` shown above the results.")
     :scope scope/agent-sql-edit
     :metabot/capabilities #{:permission-write-sql-queries}
     :metabot/runs-alone? true
     :args replace-sql-schema})
  (handle [_ {query-id :query_id new-query :new_query :keys [checklist title show_chart]} ctx]
    (sql-edit-result! (do-with-notebook-fallback
                       ctx #(replace-sql-query-tools/replace-sql-query
                             {:query-id query-id
                              :sql new-query
                              :checklist checklist
                              :queries-state (shared/current-queries-state (:memory-atom ctx))}))
                      title show_chart instructions/replace-sql-query-instructions-for ctx)))

(def replace-sql-query-tool
  "The tool that replaces the SQL in a stored query."
  (->ReplaceSqlQueryTool))
