(ns metabase.metabot.agent.tools.sql
  "SQL tool wrappers."
  (:require
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.agent.tools.shared :as shared]
   [metabase.metabot.tmpl :as te]
   [metabase.metabot.tools.create-sql-query :as create-sql-query-tools]
   [metabase.metabot.tools.edit-sql-query :as edit-sql-query-tools]
   [metabase.metabot.tools.instructions :as instructions]
   [metabase.metabot.tools.llm-representations :as llm-rep]
   [metabase.metabot.tools.replace-sql-query :as replace-sql-query-tools]
   [metabase.util :as u]
   [metabase.util.log :as log]))

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
  (let [query-xml (llm-rep/query->xml structured)]
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

;;; ──────────────────────────────────────────────────────────────────
;;; Create SQL query
;;; ──────────────────────────────────────────────────────────────────

(def ^:private create-sql-schema
  [:map {:closed true}
   [:database_id :int]
   [:sql_query :string]])

(defn create-sql-query-tool "create-sql-query-tool" []
  {:tool-name    "create_sql_query"
   :capabilities #{:permission-write-sql-queries}
   :doc          "Create a new SQL query."
   :schema       [:=> [:cat create-sql-schema] :any]
   :fn           (fn [{:keys [database_id sql_query]}]
                   (try
                     (let [{:keys [validation-result action-result]}
                           (create-sql-query-tools/create-sql-query
                            {:database-id database_id
                             :sql sql_query})
                           {:keys [valid? dialect error-message]} validation-result
                           {:keys [query-id query]} action-result]
                       (if valid?
                         (let [structured  (assoc action-result :result-type :query)
                               instr       (instructions/query-created-instructions-for query-id)
                               results-url (streaming/query->question-url query)]
                           {:output (format-query-output structured instr {:preamble? true})
                            :structured-output structured
                            :instructions instr
                            :data-parts [(streaming/navigate-to-part results-url)]})
                         (let [instr (instructions/sql-validation-error-instructions dialect error-message)]
                           {:output (format-validation-error-output instr)
                            :instructions instr})))
                     (catch Exception e
                       (log/error e "Error creating SQL query")
                       (if (:agent-error? (ex-data e))
                         {:output (ex-message e)}
                         {:output (str "Failed to create SQL query: " (or (ex-message e) "Unknown error"))}))))})

(defn create-sql-query-code-edit-tool "create-sql-query-code-edit-tool" []
  {:tool-name    "create_sql_query"
   :capabilities #{:permission-write-sql-queries}
   :doc          "Create a new SQL query and update the code editor buffer."
   :schema       [:=> [:cat create-sql-schema] :any]
   :fn           (fn [{:keys [database_id sql_query]}]
                   (let [buffer-id (first-code-editor-buffer-id)]
                     (if (nil? buffer-id)
                       {:output "No active code editor buffer found for SQL editing."}
                       (let [{:keys [validation-result action-result]}
                             (create-sql-query-tools/create-sql-query
                              {:database-id database_id
                               :sql sql_query})
                             {:keys [valid? dialect error-message]} validation-result
                             {:keys [query-id query-content]} action-result]
                         (if valid?
                           (let [structured (assoc action-result :result-type :query)
                                 instr      (instructions/query-created-instructions-for query-id)]
                             {:output (format-query-output structured instr {:preamble? true})
                              :structured-output structured
                              :instructions instr
                              :data-parts [(code-edit-part buffer-id query-content)]})
                           (let [instr (instructions/sql-validation-error-instructions dialect error-message)]
                             {:output (format-validation-error-output instr)
                              :instructions instr}))))))})

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

(defn edit-sql-query-tool "edit-sql-query-tool" []
  {:tool-name    "edit_sql_query"
   :capabilities #{:permission-write-sql-queries}
   :doc          "Edit an existing SQL query using structured edits."
   :schema       [:=> [:cat edit-sql-schema] :any]
   :fn           (fn [{:keys [query_id edits checklist]}]
                   (try
                     (let [{:keys [validation-result action-result]}
                           (edit-sql-query-tools/edit-sql-query
                            {:query-id query_id
                             :edits edits
                             :checklist checklist
                             :queries-state (shared/current-queries-state)})
                           {:keys [valid? error-message dialect]} validation-result
                           {:keys [query-id query]} action-result]
                       (if valid?
                         (let [structured  (assoc action-result :result-type :query)
                               instr       (instructions/edit-sql-query-instructions-for query-id)
                               results-url (streaming/query->question-url query)]
                           {:output (format-query-output structured instr)
                            :structured-output structured
                            :instructions instr
                            :data-parts [(streaming/navigate-to-part results-url)]})
                         (let [instr (instructions/sql-validation-error-instructions dialect error-message)]
                           {:output (format-validation-error-output instr)
                            :instructions instr})))
                     (catch Exception e
                       (log/error e "Error editing SQL query")
                       (if (:agent-error? (ex-data e))
                         {:output (ex-message e)}
                         {:output (str "Failed to edit SQL query: " (or (ex-message e) "Unknown error"))}))))})

(defn edit-sql-query-code-edit-tool "edit-sql-query-code-edit-tool" []
  {:tool-name    "edit_sql_query"
   :capabilities #{:permission-write-sql-queries}
   :doc          "Edit an existing SQL query and update the code editor buffer."
   :schema       [:=> [:cat edit-sql-schema] :any]
   :fn           (fn [{:keys [query_id edits checklist]}]
                   (let [buffer-id (first-code-editor-buffer-id)]
                     (if (nil? buffer-id)
                       {:output "No active code editor buffer found for SQL editing."}
                       (let [{:keys [validation-result action-result]}
                             (edit-sql-query-tools/edit-sql-query
                              {:query-id query_id
                               :edits edits
                               :checklist checklist
                               :queries-state (shared/current-queries-state)})
                             {:keys [valid? dialect error-message]} validation-result
                             {:keys [query-id query-content]} action-result]
                         (if valid?
                           (let [structured (assoc action-result :result-type :query)
                                 instr      (instructions/edit-sql-query-instructions-for query-id)]
                             {:output (format-query-output structured instr)
                              :structured-output structured
                              :instructions instr
                              :data-parts [(code-edit-part buffer-id query-content)]})
                           (let [instr (instructions/sql-validation-error-instructions dialect error-message)]
                             {:output (format-validation-error-output instr)
                              :instructions instr}))))))})

;;; ──────────────────────────────────────────────────────────────────
;;; Replace SQL query
;;; ──────────────────────────────────────────────────────────────────

(def ^:private replace-sql-schema
  [:map {:closed true}
   [:query_id [:or :string :int]]
   [:checklist :string]
   [:new_query :string]])

(defn replace-sql-query-tool "replace-sql-query-tool" []
  {:tool-name    "replace_sql_query"
   :capabilities #{:permission-write-sql-queries}
   :doc          "Replace the SQL content of an existing query entirely."
   :schema       [:=> [:cat replace-sql-schema] :any]
   :fn           (fn [{:keys [query_id new_query checklist]}]
                   (try
                     (let [{:keys [validation-result action-result]}
                           (replace-sql-query-tools/replace-sql-query
                            {:query-id query_id
                             :sql new_query
                             :checklist checklist
                             :queries-state (shared/current-queries-state)})
                           {:keys [valid? dialect error-message]} validation-result
                           {:keys [query-id query]} action-result]
                       (if valid?
                         (let [structured  (assoc action-result :result-type :query)
                               instr       (instructions/replace-sql-query-instructions-for query-id)
                               results-url (streaming/query->question-url query)]
                           {:output (format-query-output structured instr)
                            :structured-output structured
                            :instructions instr
                            :data-parts [(streaming/navigate-to-part results-url)]})
                         (let [instr (instructions/sql-validation-error-instructions dialect error-message)]
                           {:output (format-validation-error-output instr)
                            :instructions instr})))
                     (catch Exception e
                       (log/error e "Error replacing SQL query")
                       (if (:agent-error? (ex-data e))
                         {:output (ex-message e)}
                         {:output (str "Failed to replace SQL query: " (or (ex-message e) "Unknown error"))}))))})

(defn replace-sql-query-code-edit-tool "replace-sql-query-code-edit-tool" []
  {:tool-name    "replace_sql_query"
   :capabilities #{:permission-write-sql-queries}
   :doc          "Replace an SQL query and update the code editor buffer."
   :schema       [:=> [:cat replace-sql-schema] :any]
   :fn           (fn [{:keys [query_id new_query checklist]}]
                   (let [buffer-id (first-code-editor-buffer-id)]
                     (if (nil? buffer-id)
                       {:output "No active code editor buffer found for SQL editing."}
                       (let [{:keys [validation-result action-result]}
                             (replace-sql-query-tools/replace-sql-query
                              {:query-id query_id
                               :sql new_query
                               :checklist checklist
                               :queries-state (shared/current-queries-state)})
                             {:keys [valid? dialect error-message]} validation-result
                             {:keys [query-id query-content]} action-result]
                         (if valid?
                           (let [structured (assoc action-result :result-type :query)
                                 instr      (instructions/replace-sql-query-instructions-for query-id)]
                             {:output (format-query-output structured instr)
                              :structured-output structured
                              :instructions instr
                              :data-parts [(code-edit-part buffer-id query-content)]})
                           (let [instr (instructions/sql-validation-error-instructions dialect error-message)]
                             {:output (format-validation-error-output instr)
                              :instructions instr}))))))})
