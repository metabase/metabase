(ns metabase-enterprise.metabot.agent.tools.transforms
  "Enterprise implementations of transform tool thunks.
  Each returns a tool definition map with the full implementation."
  (:require
   [metabase-enterprise.metabot.tools.dependencies :as deps]
   [metabase-enterprise.metabot.tools.transforms :as transform-tools]
   [metabase-enterprise.metabot.tools.transforms-write :as transforms-write-tools]
   [metabase.metabot.agent.tools.shared :as shared]
   [metabase.metabot.util :as metabot.u]
   [metabase.premium-features.core :as premium-features]
   [metabase.util.log :as log]))

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

(defn- format-python-library-output
  [{:keys [path] :as lib}]
  (metabot.u/xml
   [:python-library {:path path}
    (when-let [content (:content lib)] [:content content])]))

(defn- format-transform-write-output
  [{:keys [message]}]
  (or message "Transform updated successfully."))

(defn- add-output
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

(premium-features/defenterprise get-transform-details-tool
  :feature :none
  []
  {:tool-name "get_transform_details"
   :doc       "Get information about a transform."
   :schema    [:=> [:cat [:map {:closed true} [:transform_id :int]]] :any]
   :fn        (fn [{:keys [transform_id]}]
                (add-output (transform-tools/get-transform-details {:transform-id transform_id})
                            format-transform-details-output))})

(premium-features/defenterprise get-transform-python-library-details-tool
  :feature :none
  []
  {:tool-name "get_transform_python_library_details"
   :doc       "Get information about a Python library by path."
   :schema    [:=> [:cat [:map {:closed true} [:path :string]]] :any]
   :fn        (fn [{:keys [path]}]
                (add-output (transform-tools/get-transform-python-library-details {:path path})
                            format-python-library-output))})

(def ^:private write-transform-sql-schema
  [:map {:closed true}
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
   [:source_tables {:optional true} [:maybe :map]]])

(premium-features/defenterprise write-transform-sql-tool
  :feature :none
  []
  {:tool-name    "write_transform_sql"
   :capabilities #{:feature-transforms :permission-write-transforms}
   :doc          "Write new SQL queries or edit existing queries for transforms.

  Supports two modes:
  - edit: Targeted string replacements with partial edits
  - replace: Replace entire query atomically

  For edit mode, provide edits as an array of {old_string, new_string, replace_all} objects.
  For replace mode, provide new_content with the complete SQL."
   :schema       [:=> [:cat write-transform-sql-schema] :any]
   :fn           (fn [{:keys [transform_id edit_action thinking transform_name transform_description
                              source_database source_tables]}]
                   (try
                     (let [result (add-output
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
                           transform (get-in result [:structured-output :transform])
                           dep-issues (check-dependencies transform_id (:source transform))]
                       (cond-> result
                         dep-issues (update :instructions str (format-dependency-warnings dep-issues))))
                     (catch Exception e
                       (if (:agent-error? (ex-data e))
                         {:output (ex-message e)}
                         {:output (str "Failed to write SQL transform: " (or (ex-message e) "Unknown error"))}))))})

(def ^:private write-transform-python-schema
  [:map {:closed true}
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
   [:source_tables {:optional true} [:maybe :map]]])

(premium-features/defenterprise write-transform-python-tool
  :feature :none
  []
  {:tool-name    "write_transform_python"
   :capabilities #{:feature-transforms :feature-transforms-python :permission-write-transforms}
   :doc          "Write new Python code or edit existing code for transforms.

  Supports two modes:
  - edit: Targeted string replacements with partial edits
  - replace: Replace entire code atomically

  For edit mode, provide edits as an array of {old_string, new_string, replace_all} objects.
  For replace mode, provide new_content with the complete Python code.

  Use `get_transform_python_library_details` before writing any Python code to inspect the shared library.
  Use the shared library in your code by adding `import common` at the top of the file.
  Keep `import common` at the top of the file even if it is currently unused."
   :schema       [:=> [:cat write-transform-python-schema] :any]
   :fn           (fn [{:keys [transform_id edit_action thinking transform_name transform_description
                              source_database source_tables]}]
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
                         {:output (str "Failed to write Python transform: " (or (ex-message e) "Unknown error"))}))))})
