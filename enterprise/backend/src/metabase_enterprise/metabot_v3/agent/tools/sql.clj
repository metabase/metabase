(ns metabase-enterprise.metabot-v3.agent.tools.sql
  "SQL tool wrappers."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.tools.create-sql-query :as create-sql-query-tools]
   [metabase-enterprise.metabot-v3.tools.edit-sql-query :as edit-sql-query-tools]
   [metabase-enterprise.metabot-v3.tools.instructions :as instructions]
   [metabase-enterprise.metabot-v3.tools.replace-sql-query :as replace-sql-query-tools]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- normalize-context-type
  [type-val]
  (cond
    (keyword? type-val) (name type-val)
    (string? type-val) (str/lower-case type-val)
    :else ""))

(defn- first-code-editor-buffer-id
  []
  (let [memory (shared/current-memory)]
    (when memory
      (let [viewing (get-in memory [:context :user_is_viewing] [])]
        (some->> viewing
                 (filter #(= "code-editor" (normalize-context-type (:type %))))
                 first
                 :buffers
                 first
                 :id)))))

(defn- code-edit-part
  [buffer-id sql]
  (streaming/code-edit-part {:buffer_id buffer-id
                             :mode "rewrite"
                             :value sql}))

(mu/defn ^{:tool-name "create_sql_query"} create-sql-query-tool
  "Create a new SQL query."
  [{:keys [database_id sql_query]}
   :- [:map {:closed true}
       [:database_id :int]
       [:sql_query :string]]]
  (try
    (let [result (create-sql-query-tools/create-sql-query
                  {:database-id database_id
                   :sql sql_query})
          results-url (streaming/query->question-url (:query result))]
      {:structured-output (assoc result :result-type :query)
       :instructions instructions/query-created-instructions
       :data-parts [(streaming/navigate-to-part results-url)]})
    (catch Exception e
      (log/error e "Error creating SQL query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to create SQL query: " (or (ex-message e) "Unknown error"))}))))

(mu/defn ^{:tool-name "create_sql_query"} create-sql-query-code-edit-tool
  "Create a new SQL query and update the code editor buffer."
  [{:keys [database_id sql_query]}
   :- [:map {:closed true}
       [:database_id :int]
       [:sql_query :string]]]
  (let [result (create-sql-query-tools/create-sql-query
                {:database-id database_id
                 :sql sql_query})
        buffer-id (first-code-editor-buffer-id)]
    (if buffer-id
      {:structured-output (assoc result :result-type :query)
       :instructions instructions/query-created-instructions
       :data-parts [(code-edit-part buffer-id (:query-content result))]}
      {:output "No active code editor buffer found for SQL editing."})))

(mu/defn ^{:tool-name "edit_sql_query"} edit-sql-query-tool
  "Edit an existing SQL query using structured edits."
  [{:keys [query_id edits checklist]}
   :- [:map {:closed true}
       [:query_id [:or :string :int]]
       [:checklist :string]
       [:edits [:sequential [:map {:closed true}
                             [:old_string :string]
                             [:new_string :string]
                             [:replace_all {:optional true} [:maybe :boolean]]]]]]]
  (try
    (let [result (edit-sql-query-tools/edit-sql-query
                  {:query-id query_id
                   :edits edits
                   :checklist checklist
                   :queries-state (shared/current-queries-state)})
          results-url (streaming/query->question-url (:query result))]
      {:structured-output (assoc result :result-type :query)
       :instructions instructions/query-created-instructions
       :data-parts [(streaming/navigate-to-part results-url)]})
    (catch Exception e
      (log/error e "Error editing SQL query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to edit SQL query: " (or (ex-message e) "Unknown error"))}))))

(mu/defn ^{:tool-name "edit_sql_query"} edit-sql-query-code-edit-tool
  "Edit an existing SQL query and update the code editor buffer."
  [{:keys [query_id edits checklist]}
   :- [:map {:closed true}
       [:query_id [:or :string :int]]
       [:checklist :string]
       [:edits [:sequential [:map {:closed true}
                             [:old_string :string]
                             [:new_string :string]
                             [:replace_all {:optional true} [:maybe :boolean]]]]]]]
  (let [result (edit-sql-query-tools/edit-sql-query
                {:query-id query_id
                 :edits edits
                 :checklist checklist
                 :queries-state (shared/current-queries-state)})
        buffer-id (first-code-editor-buffer-id)]
    (if buffer-id
      {:structured-output (assoc result :result-type :query)
       :instructions instructions/edit-sql-query-instructions
       :data-parts [(code-edit-part buffer-id (:query-content result))]}
      {:output "No active code editor buffer found for SQL editing."})))

(mu/defn ^{:tool-name "replace_sql_query"} replace-sql-query-tool
  "Replace the SQL content of an existing query entirely."
  [{:keys [query_id new_query checklist]}
   :- [:map {:closed true}
       [:query_id [:or :string :int]]
       [:checklist :string]
       [:new_query :string]]]
  (try
    (let [result (replace-sql-query-tools/replace-sql-query
                  {:query-id query_id
                   :sql new_query
                   :checklist checklist
                   :queries-state (shared/current-queries-state)})
          results-url (streaming/query->question-url (:query result))]
      {:structured-output (assoc result :result-type :query)
       :instructions instructions/query-created-instructions
       :data-parts [(streaming/navigate-to-part results-url)]})
    (catch Exception e
      (log/error e "Error replacing SQL query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to replace SQL query: " (or (ex-message e) "Unknown error"))}))))

(mu/defn ^{:tool-name "replace_sql_query"} replace-sql-query-code-edit-tool
  "Replace an SQL query and update the code editor buffer."
  [{:keys [query_id new_query checklist]}
   :- [:map {:closed true}
       [:query_id [:or :string :int]]
       [:checklist :string]
       [:new_query :string]]]
  (let [result (replace-sql-query-tools/replace-sql-query
                {:query-id query_id
                 :sql new_query
                 :checklist checklist
                 :queries-state (shared/current-queries-state)})
        buffer-id (first-code-editor-buffer-id)]
    (if buffer-id
      {:structured-output (assoc result :result-type :query)
       :instructions instructions/query-created-instructions
       :data-parts [(code-edit-part buffer-id (:query-content result))]}
      {:output "No active code editor buffer found for SQL editing."})))
