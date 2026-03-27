(ns metabase.metabot.tools.transforms
  "Transform tool definitions.
  SQL transform tools are implemented directly in OSS.
  Python transform tools use defenterprise (return nil/error in OSS, real impl in EE)."
  (:require
   [metabase.metabot.tools.dependencies :as deps]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.transforms.write :as transforms-write-tools]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.metabot.util :as metabot.u]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.transforms.core :as transforms]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Formatting helpers
;;; ──────────────────────────────────────────────────────────────────

(defn- format-transform-details-output
  [{:keys [id name description source target] :as _transform}]
  (metabot.u/xml
   [:transform {:id id :name name}
    (when description [:description description])
    (when source
      [:source {:type (:type source)}
       (when (:query source) [:query (:query source)])
       (when (:source-database source) [:database (:source-database source)])])
    (when target [:target (pr-str target)])]))

(defn format-transform-write-output
  "Format the output of a transform write operation."
  [{:keys [message]}]
  (or message "Transform updated successfully."))

(defn add-output
  "Add :output to a tool result. Handles both :structured_output and :structured-output."
  [result format-fn]
  (if-let [structured (or (:structured_output result) (:structured-output result))]
    (assoc result :output (format-fn structured))
    result))

(defn- check-dependencies
  "Check for downstream breakages after a SQL transform edit.
  Returns nil if no issues found or the check fails, otherwise a map with
  :bad_transforms and :bad_questions."
  [transform-id source]
  (when transform-id
    (try
      (let [{:keys [structured_output]} (deps/check-transform-dependencies
                                         {:id transform-id :source source})]
        (when (and structured_output
                   (or (seq (:bad_transforms structured_output))
                       (seq (:bad_questions structured_output))))
          structured_output))
      (catch Exception e
        (log/error e "Dependency check failed for transform" transform-id)
        nil))))

(defn- format-dependency-warnings
  "Format dependency check results into instructions for the agent."
  [{:keys [bad_transforms bad_questions]}]
  (str "\n\n**Dependency issues detected.**\n"
       "Your proposed changes would break downstream dependencies.\n\n"
       (when (seq bad_transforms)
         (str "Broken transforms:\n"
              (apply str (for [{:keys [transform]} bad_transforms]
                           (str "- [" (:name transform) "](metabase://transform/" (:id transform) ")\n")))))
       (when (seq bad_questions)
         (str "Broken questions:\n"
              (apply str (for [{:keys [question]} bad_questions]
                           (str "- [" (:name question) "](metabase://question/" (:id question) ")\n")))))
       "\nYou must summarize these dependency issues for the user. "
       "Do not propose or apply fixes yourself."))

;;; ──────────────────────────────────────────────────────────────────
;;; Tool definitions
;;; ──────────────────────────────────────────────────────────────────

(mu/defn ^{:tool-name "get_transform_details"}
  get-transform-details-tool
  "Get information about a transform."
  [{:keys [transform_id]} :- [:map {:closed true} [:transform_id :int]]]
  (try
    (add-output {:structured_output (transforms/get-transform transform_id)}
                format-transform-details-output)
    (catch Exception e
      (metabot.tools.u/handle-agent-error e))))

(def ^:private python-lib-schema
  [:map {:closed true} [:path :string]])

(defenterprise ^{:tool-name  "get_transform_python_library_details"
                 :schema     [:=> [:cat python-lib-schema] :map]
                 :ee-feature :transforms}
  get-transform-python-library-details-tool
  "Get Python library details. EE-only; returns an error in OSS."
  metabase-enterprise.metabot.tools.transforms
  [{:keys [_path]}]
  {:output "Python transform tools are only available in Metabase Enterprise Edition."})

(def ^:private write-transform-sql-schema
  [:map {:closed true}
   [:database_id
    {:optional true
     :description (str "The database id of the database that contains the tables referenced in the query. "
                       "You MUST never select something that looks like a sample database with sample tables. ")}
    [:maybe :int]]
   [:transform_id
    {:optional true
     :description (str "The ID of the Transform with the SQL query to edit. "
                       "If not provided it's assumed a new Transform is to be created")}
    [:maybe :int]]
   [:edit_action
    {:description "You MUST set this param. Use new_content and edits according to mode you choose."}
    [:map
     [:mode
      {:description (str "Use 'edit' mode for targeted string replacements. "
                         "Use 'replace' mode to replace entire content.")}
      [:enum "edit" "replace"]]
     [:edits
      {:optional true
       :description "List of targeted string replacements to apply sequentially"}
      [:maybe [:sequential [:map
                            [:old_string :string]
                            [:new_string :string]
                            [:replace_all {:optional true} [:maybe :boolean]]]]]]
     [:new_content
      {:optional true
       :description "The complete new content to replace the current content with"}
      [:maybe :string]]]]
   [:thinking
    {:optional true
     :description "Brief explanation of what changes you're making and why"}
    [:maybe :string]]
   [:transform_name
    {:optional true
     :description (str "A descriptive name for the transform. Required when creating a new transform. "
                       "Do not provide when editing an existing transform with a transform_id.")}
    [:maybe :string]]
   [:transform_description
    {:optional true
     :description (str "A short description of what the transform does. Required when creating a new transform. "
                       "Do not provide when editing an existing transform with a transform_id.")}
    [:maybe :string]]])

(mu/defn ^{:tool-name "write_transform_sql"
           :capabilities #{:feature-transforms :permission-write-transforms}}
  write-transform-sql-tool
  "Write new SQL queries or edit existing queries for transforms.

  Supports two modes:
  - edit: Targeted string replacements with partial edits
  - replace: Replace entire query atomically

  For edit mode, provide edits as an array of {old_string, new_string, replace_all} objects.
  For replace mode, provide new_content with the complete SQL."
  [{:keys [transform_id edit_action thinking transform_name transform_description
           database_id source_tables]}
   :- write-transform-sql-schema]
  (try
    (let [result (add-output
                  (transforms-write-tools/write-transform-sql
                   {:transform_id transform_id
                    :edit_action edit_action
                    :thinking thinking
                    :transform_name transform_name
                    :transform_description transform_description
                    :database_id database_id
                    :source_tables source_tables
                    :memory-atom shared/*memory-atom*
                    :context (shared/current-context)})
                  format-transform-write-output)
          transform (get-in result [:structured-output :transform])
          dep-issues (check-dependencies transform_id (:source transform))]
      (cond-> result
        dep-issues (update :instructions str (format-dependency-warnings dep-issues))))
    (catch Exception e
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to write SQL transform: " (or (ex-message e) "Unknown error"))}))))

(def write-transform-python-schema
  "Schema for write-transform-python-tool"
  [:map {:closed true}
   [:transform_id
    {:optional true
     :description (str "The ID of the Transform with the SQL query to edit. "
                       "If not provided it's assumed a new Transform is to be created")}
    [:maybe :int]]
   [:edit_action
    {:description "You MUST set this param. Use new_content and edits according to mode you choose."}
    [:map
     [:mode
      {:description (str "Use 'edit' mode for targeted string replacements. "
                         "Use 'replace' mode to replace entire content.")}
      [:enum "edit" "replace"]]
     [:edits
      {:optional true
       :description "List of targeted string replacements to apply sequentially"}
      [:maybe [:sequential [:map
                            [:old_string :string]
                            [:new_string :string]
                            [:replace_all {:optional true} [:maybe :boolean]]]]]]
     [:new_content
      {:optional true
       :description "The complete new content to replace the current content with"}
      [:maybe :string]]]]
   [:thinking
    {:optional true
     :description "Brief explanation of what changes you're making and why"}
    [:maybe :string]]
   [:transform_name
    {:optional true
     :description (str  "A descriptive name for the transform. Required when creating a new transform. "
                        "Do not provide when editing an existing transform with a transform_id.")}
    [:maybe :string]]
   [:transform_description
    {:optional true
     :description (str "A short description of what the transform does. Required when creating a new transform. "
                       "Do not provide when editing an existing transform with a transform_id.")}
    [:maybe :string]]
   [:database_id
    {:optional true
     :description (str "When creating a Transform, the database id of the "
                       "tables being used to create the transform. Not provided when editing "
                       "an existing transform. You MUST never select something that looks "
                       "like a sample database with sample tables. ")}
    [:maybe :int]]
   [:source_tables
    {:optional true
     :description (str "A list of source tables, each described as an object with: "
                       "`alias` (the name used in the transform function, e.g. the parameter name in "
                       "`def transform(table_a, table_b):`), "
                       "`table_id` (the database table ID), "
                       "`schema` (the database schema name, e.g. \"PUBLIC\"), and "
                       "`database_id` (the database ID). "
                       "For example: [{\"alias\": \"table_a\", \"table_id\": 1, \"schema\": \"PUBLIC\", \"database_id\": 1}, "
                       "{\"alias\": \"table_b\", \"table_id\": 2, \"schema\": \"PUBLIC\", \"database_id\": 1}]. "
                       "The table_id values MUST be IDs of database tables. You CAN NOT use metabase model IDs. "
                       "You MUST provide this argument when modifying the source tables of an existing transform "
                       "or when creating a new transform. DO NOT guess or make up table IDs, use the "
                       "search_tables tool to find the correct table IDs first.")}
    [:sequential
     [:map
      [:alias :string]
      [:table_id :int]
      [:schema :string]
      [:database_id :int]]]]])

(defenterprise ^{:tool-name    "write_transform_python"
                 :schema       [:=> [:cat write-transform-python-schema] :map]
                 :capabilities #{:feature-transforms :feature-transforms-python :permission-write-transforms}
                 :ee-feature   :transforms}
  write-transform-python-tool
  "Write Python transforms. EE-only; returns an error in OSS."
  metabase-enterprise.metabot.tools.transforms
  [{:keys [_transform_id]}]
  {:output "Python transform tools are only available in Metabase Enterprise Edition."})
