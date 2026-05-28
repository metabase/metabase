(ns metabase.metabot.tools.sql
  "SQL tool wrappers."
  (:require
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.scope :as scope]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.shared.instructions :as instructions]
   [metabase.metabot.tools.shared.llm-shape :as llm-shape]
   [metabase.metabot.tools.sql.common :as metabot.tools.sql.common]
   [metabase.metabot.tools.sql.create :as create-sql-query-tools]
   [metabase.metabot.tools.sql.edit :as edit-sql-query-tools]
   [metabase.metabot.tools.sql.replace :as replace-sql-query-tools]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- normalize-context-type
  [type-val]
  (cond
    (keyword? type-val) (name type-val)
    (string? type-val)  (u/lower-case-en type-val)
    :else               ""))

(defn- first-code-editor-buffer-id
  []
  (let [memory (shared/current-memory)]
    (when memory
      (let [viewing (get-in memory [:context :user_is_viewing] [])]
        (some->> viewing
                 (filter #(= "code_editor" (normalize-context-type (:type %))))
                 first
                 :buffers
                 first
                 :id)))))

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

(defn- format-validation-error-output
  [instruction-text]
  (te/lines
   "<result>"
   "SQL query construction failed."
   "</result>"
   "<instructions>"
   instruction-text
   "</instructions>"))

(defn- code-edit-part
  [buffer-id sql]
  (streaming/code-edit-part {:buffer_id buffer-id
                             :mode "rewrite"
                             :value sql}))

(defn- entity-usage-for-sql
  "Build an `:entity-usage` map for an authoring SQL tool. `:input` carries the
  database the tool wrote against, any `{{#N}}` card refs in the SQL body, and —
  when `table-refs` is supplied — the physical tables the query named directly;
  `:output []` because authoring tools don't surface entities. `database-id`
  may be nil — in that case the database ref is omitted (e.g. error branches
  where we couldn't resolve the in-memory query).

  Physical-table refs (3-arity) are passed only on success branches, where a
  validated query is in scope; validation-failure and exception branches use
  the 2-arity form and stay cards-only, as before. Build `table-refs` with
  [[metabot.tools.sql.common/native-physical-table-refs]]."
  ([database-id sql]
   (entity-usage-for-sql database-id sql nil))
  ([database-id sql table-refs]
   {:input  (cond-> []
              (some? database-id) (conj {:type "database" :id database-id})
              true                (into (metabot.tools.sql.common/card-refs-in-sql sql))
              (seq table-refs)    (into table-refs))
    :output []}))

(defn- entity-usage-on-result
  "Attach `:entity-usage` to an existing tool-result map under `:structured-output`,
  preserving any structured-output already present (merges into it)."
  [result entity-usage]
  (update result :structured-output (fnil assoc {}) :entity-usage entity-usage))

(defn- stamp-artifact-valid
  "Stamp the authoring-outcome flag onto a SQL tool result's `:structured-output`.
  `valid?` is `true` on the success branch and `false` on syntactic-validation
  failure, agent-input rejection, or a genuine exception. Read by the quality
  pipeline's `artifact-validity-share` metric."
  [result valid?]
  (assoc-in result [:structured-output :artifact-valid] valid?))

;;; ──────────────────────────────────────────────────────────────────
;;; Create SQL query
;;; ──────────────────────────────────────────────────────────────────

(def ^:private create-sql-schema
  [:map {:closed true}
   [:database_id :int]
   [:sql_query :string]])

(mu/defn ^{:tool-name    "create_sql_query"
           :tool-type    :authoring
           :scope        scope/agent-sql-create
           :capabilities #{:permission-write-sql-queries}}
  create-sql-query-tool
  "Create a new SQL query."
  [{:keys [database_id sql_query]} :- create-sql-schema]
  (let [entity-usage (entity-usage-for-sql database_id sql_query)]
    (try
      (let [{:keys [validation-result action-result]}
            (create-sql-query-tools/create-sql-query
             {:database-id database_id
              :sql sql_query})
            {:keys [valid? dialect error-message]} validation-result
            {:keys [query-id query]} action-result]
        (if valid?
          (let [entity-usage (entity-usage-for-sql database_id sql_query
                                                   (metabot.tools.sql.common/native-physical-table-refs database_id sql_query))
                structured  (assoc action-result :result-type :query :entity-usage entity-usage)
                instr       (instructions/query-created-instructions-for query-id)
                results-url (streaming/query->question-url query)]
            (stamp-artifact-valid
             {:output (format-query-output structured instr {:preamble? true})
              :structured-output structured
              :instructions instr
              :data-parts [(streaming/navigate-to-part results-url)]}
             true))
          (let [instr (instructions/sql-validation-error-instructions dialect error-message)]
            (stamp-artifact-valid
             {:output (format-validation-error-output instr)
              :structured-output {:entity-usage entity-usage}
              :instructions instr}
             false))))
      (catch Exception e
        (if (:agent-error? (ex-data e))
          ;; Expected agent-facing signal — relay `(ex-message e)` and stamp the artifact
          ;; invalid so the failed authoring attempt feeds `artifact-validity-share`, not the
          ;; tool-output `:error` channel (machinery failure). The LLM reads the same guidance
          ;; and self-corrects.
          (-> (entity-usage-on-result {:output (ex-message e)} entity-usage)
              (stamp-artifact-valid false))
          (do
            (log/error e "Error creating SQL query")
            (-> (entity-usage-on-result
                 {:output (str "Failed to create SQL query: " (or (ex-message e) "Unknown error"))}
                 entity-usage)
                (stamp-artifact-valid false))))))))

(mu/defn ^{:tool-name    "create_sql_query"
           :tool-type    :authoring
           :scope        scope/agent-sql-create
           :capabilities #{:permission-write-sql-queries}}
  create-sql-query-code-edit-tool
  "Create a new SQL query and update the code editor buffer."
  [{:keys [database_id sql_query]} :- create-sql-schema]
  (let [entity-usage (entity-usage-for-sql database_id sql_query)
        buffer-id    (first-code-editor-buffer-id)]
    (if (nil? buffer-id)
      (stamp-artifact-valid
       {:output "No active code editor buffer found for SQL editing."
        :structured-output {:entity-usage entity-usage}}
       false)
      (let [{:keys [validation-result action-result]}
            (create-sql-query-tools/create-sql-query
             {:database-id database_id
              :sql sql_query})
            {:keys [valid? dialect error-message]} validation-result
            {:keys [query-id query-content]} action-result]
        (if valid?
          (let [entity-usage (entity-usage-for-sql database_id sql_query
                                                   (metabot.tools.sql.common/native-physical-table-refs database_id sql_query))
                structured (assoc action-result :result-type :query :entity-usage entity-usage)
                instr      (instructions/query-created-instructions-for query-id)]
            (stamp-artifact-valid
             {:output (format-query-output structured instr {:preamble? true})
              :structured-output structured
              :instructions instr
              :data-parts [(code-edit-part buffer-id query-content)]}
             true))
          (let [instr (instructions/sql-validation-error-instructions dialect error-message)]
            (stamp-artifact-valid
             {:output (format-validation-error-output instr)
              :structured-output {:entity-usage entity-usage}
              :instructions instr}
             false)))))))

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
                         [:replace_all {:optional true} [:maybe :boolean]]]]]])

(mu/defn ^{:tool-name    "edit_sql_query"
           :tool-type    :authoring
           :scope        scope/agent-sql-edit
           :capabilities #{:permission-write-sql-queries}}
  edit-sql-query-tool
  "Edit an existing SQL query using structured edits."
  [{:keys [query_id edits checklist]} :- edit-sql-schema]
  (let [queries-state (shared/current-queries-state)
        existing-db   (get-in queries-state [(str query_id) :database])]
    (try
      (let [{:keys [validation-result action-result]}
            (edit-sql-query-tools/edit-sql-query
             {:query-id query_id
              :edits edits
              :checklist checklist
              :queries-state queries-state})
            {:keys [valid? error-message dialect]} validation-result
            {:keys [query-id query query-content]} action-result]
        (if valid?
          (let [entity-usage (entity-usage-for-sql (:database action-result) query-content
                                                   (metabot.tools.sql.common/native-physical-table-refs (:database action-result) query-content))
                structured   (assoc action-result :result-type :query :entity-usage entity-usage)
                instr        (instructions/edit-sql-query-instructions-for query-id)
                results-url  (streaming/query->question-url query)
                buffer-id    (first-code-editor-buffer-id)]
            (stamp-artifact-valid
             {:output (format-query-output structured instr)
              :structured-output structured
              :instructions instr
              :data-parts [(if buffer-id (code-edit-part buffer-id query-content) (streaming/navigate-to-part results-url))]}
             true))
          (let [instr (instructions/sql-validation-error-instructions dialect error-message)]
            (stamp-artifact-valid
             {:output (format-validation-error-output instr)
              ;; SQL pre-transpile isn't available on the validation-failure
              ;; branch, so card refs from the edits payload aren't recoverable
              ;; here; record the database alone.
              :structured-output {:entity-usage (entity-usage-for-sql existing-db nil)}
              :instructions instr}
             false))))
      (catch Exception e
        (if (:agent-error? (ex-data e))
          ;; Expected agent-facing signal — relay `(ex-message e)` and stamp invalid so the
          ;; failed authoring attempt feeds `artifact-validity-share`, not the `:error` channel.
          (-> (entity-usage-on-result {:output (ex-message e)} (entity-usage-for-sql existing-db nil))
              (stamp-artifact-valid false))
          (do
            (log/error e "Error editing SQL query")
            (-> (entity-usage-on-result
                 {:output (str "Failed to edit SQL query: " (or (ex-message e) "Unknown error"))}
                 (entity-usage-for-sql existing-db nil))
                (stamp-artifact-valid false))))))))

;;; ──────────────────────────────────────────────────────────────────
;;; Replace SQL query
;;; ──────────────────────────────────────────────────────────────────

(def ^:private replace-sql-schema
  [:map {:closed true}
   [:query_id [:or :string :int]]
   [:checklist :string]
   [:new_query :string]])

(mu/defn ^{:tool-name    "replace_sql_query"
           :tool-type    :authoring
           :scope        scope/agent-sql-edit
           :capabilities #{:permission-write-sql-queries}}
  replace-sql-query-tool
  "Replace the SQL content of an existing query entirely."
  [{:keys [query_id new_query checklist]} :- replace-sql-schema]
  (let [queries-state (shared/current-queries-state)
        existing-db   (get-in queries-state [(str query_id) :database])
        entity-usage  (entity-usage-for-sql existing-db new_query)]
    (try
      (let [{:keys [validation-result action-result]}
            (replace-sql-query-tools/replace-sql-query
             {:query-id query_id
              :sql new_query
              :checklist checklist
              :queries-state queries-state})
            {:keys [valid? dialect error-message]} validation-result
            {:keys [query-id query query-content]} action-result]
        (if valid?
          (let [entity-usage (entity-usage-for-sql existing-db query-content
                                                   (metabot.tools.sql.common/native-physical-table-refs existing-db query-content))
                structured  (assoc action-result :result-type :query :entity-usage entity-usage)
                instr       (instructions/replace-sql-query-instructions-for query-id)
                results-url (streaming/query->question-url query)
                buffer-id   (first-code-editor-buffer-id)]
            (stamp-artifact-valid
             {:output (format-query-output structured instr)
              :structured-output structured
              :instructions instr
              :data-parts [(if buffer-id (code-edit-part buffer-id query-content) (streaming/navigate-to-part results-url))]}
             true))
          (let [instr (instructions/sql-validation-error-instructions dialect error-message)]
            (stamp-artifact-valid
             {:output (format-validation-error-output instr)
              :structured-output {:entity-usage entity-usage}
              :instructions instr}
             false))))
      (catch Exception e
        (if (:agent-error? (ex-data e))
          ;; Expected agent-facing signal — relay `(ex-message e)` and stamp invalid so the
          ;; failed authoring attempt feeds `artifact-validity-share`, not the `:error` channel.
          (-> (entity-usage-on-result {:output (ex-message e)} entity-usage)
              (stamp-artifact-valid false))
          (do
            (log/error e "Error replacing SQL query")
            (-> (entity-usage-on-result
                 {:output (str "Failed to replace SQL query: " (or (ex-message e) "Unknown error"))}
                 entity-usage)
                (stamp-artifact-valid false))))))))
