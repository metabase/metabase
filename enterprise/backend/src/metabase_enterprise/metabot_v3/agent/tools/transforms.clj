(ns metabase-enterprise.metabot-v3.agent.tools.transforms
  "Transform tool wrappers."
  (:require
   [metabase-enterprise.metabot-v3.agent.tools.shared :as shared]
   [metabase-enterprise.metabot-v3.tools.transforms :as transform-tools]
   [metabase-enterprise.metabot-v3.tools.transforms-write :as transforms-write-tools]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- format-transform-details-output
  [{:keys [id name description source target] :as transform}]
  (str "<transform id=\"" id "\" name=\"" name "\">\n"
       (when description (str "<description>" description "</description>\n"))
       (when source
         (str "<source type=\"" (:type source) "\">\n"
              (when (:query source) (str "<query>\n" (:query source) "\n</query>\n"))
              (when (:source-database source) (str "<database>" (:source-database source) "</database>\n"))
              "</source>\n"))
       (when target (str "<target>" (pr-str target) "</target>\n"))
       "</transform>"))

(defn- format-python-library-output
  [{:keys [path] :as lib}]
  (str "<python-library path=\"" path "\">\n"
       (when-let [content (:content lib)] (str "<content>\n" content "\n</content>\n"))
       "</python-library>"))

(defn- format-transform-write-output
  [{:keys [message]}]
  (or message "Transform updated successfully."))

(defn- add-output
  "Add :output to a tool result. Handles both :structured_output and :structured-output."
  [result format-fn]
  (if-let [structured (or (:structured_output result) (:structured-output result))]
    (assoc result :output (format-fn structured))
    result))

(mu/defn ^{:tool-name "get_transform_details"} get-transform-details-tool
  "Get information about a transform."
  [{:keys [transform_id]} :- [:map {:closed true}
                              [:transform_id :int]]]
  (add-output (transform-tools/get-transform-details {:transform-id transform_id})
              format-transform-details-output))

(mu/defn ^{:tool-name "get_transform_python_library_details"} get-transform-python-library-details-tool
  "Get information about a Python library by path."
  [{:keys [path]} :- [:map {:closed true}
                      [:path :string]]]
  (add-output (transform-tools/get-transform-python-library-details {:path path})
              format-python-library-output))

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
           source_database source_tables]}
   :- [:map {:closed true}
       [:transform_id {:optional true} [:maybe :int]]
       [:edit_action [:map
                      [:mode [:enum "edit" "replace"]]
                      [:edits {:optional true} [:maybe [:sequential [:map
                                                                     [:old_string :string]
                                                                     [:new_string :string]
                                                                     [:replace_all {:optional true} [:maybe :boolean]]]]]]
                      [:new_content {:optional true} [:maybe :string]]]]
       [:thinking {:optional true} [:maybe :string]]
       [:transform_name {:optional true} [:maybe :string]]
       [:transform_description {:optional true} [:maybe :string]]
       [:source_database {:optional true} [:maybe :int]]
       [:source_tables {:optional true} [:maybe :map]]]]
  (try
    (add-output
     (transforms-write-tools/write-transform-sql
      {:transform_id transform_id
       :edit_action edit_action
       :thinking thinking
       :transform_name transform_name
       :transform_description transform_description
       :source_database source_database
       :source_tables source_tables
       :memory-atom shared/*memory-atom*
       :context (shared/current-context)})
     format-transform-write-output)
    (catch Exception e
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to write SQL transform: " (or (ex-message e) "Unknown error"))}))))

(mu/defn ^{:tool-name "write_transform_python"
           :capabilities #{:feature-transforms :feature-transforms-python :permission-write-transforms}}
  write-transform-python-tool
  "Write new Python code or edit existing code for transforms.

  Supports two modes:
  - edit: Targeted string replacements with partial edits
  - replace: Replace entire code atomically

  For edit mode, provide edits as an array of {old_string, new_string, replace_all} objects.
  For replace mode, provide new_content with the complete Python code."
  [{:keys [transform_id edit_action thinking transform_name transform_description
           source_database source_tables]}
   :- [:map {:closed true}
       [:transform_id {:optional true} [:maybe :int]]
       [:edit_action [:map
                      [:mode [:enum "edit" "replace"]]
                      [:edits {:optional true} [:maybe [:sequential [:map
                                                                     [:old_string :string]
                                                                     [:new_string :string]
                                                                     [:replace_all {:optional true} [:maybe :boolean]]]]]]
                      [:new_content {:optional true} [:maybe :string]]]]
       [:thinking {:optional true} [:maybe :string]]
       [:transform_name {:optional true} [:maybe :string]]
       [:transform_description {:optional true} [:maybe :string]]
       [:source_database {:optional true} [:maybe :int]]
       [:source_tables {:optional true} [:maybe :map]]]]
  (try
    (add-output
     (transforms-write-tools/write-transform-python
      {:transform_id transform_id
       :edit_action edit_action
       :thinking thinking
       :transform_name transform_name
       :transform_description transform_description
       :source_database source_database
       :source_tables source_tables
       :memory-atom shared/*memory-atom*
       :context (shared/current-context)})
     format-transform-write-output)
    (catch Exception e
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to write Python transform: " (or (ex-message e) "Unknown error"))}))))
