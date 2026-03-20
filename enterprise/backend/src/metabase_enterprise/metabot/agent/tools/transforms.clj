(ns metabase-enterprise.metabot.agent.tools.transforms
  "Enterprise implementations of Python transform tools."
  (:require
   [metabase-enterprise.metabot.tools.transforms-write :as transforms-write-tools]
   [metabase.metabot.agent.tools.shared :as shared]
   [metabase.metabot.agent.tools.transforms :as agent-transforms]
   [metabase.metabot.util :as metabot.u]
   [metabase.premium-features.core :refer [defenterprise-schema]]))

(set! *warn-on-reflection* true)

;;; ──────────────────────────────────────────────────────────────────
;;; Formatting helpers
;;; ──────────────────────────────────────────────────────────────────

(defn- format-python-library-output
  [{:keys [path] :as lib}]
  (metabot.u/xml
   [:python-library {:path path}
    (when-let [content (:content lib)] [:content content])]))

;;; ──────────────────────────────────────────────────────────────────
;;; Tool definitions
;;; ──────────────────────────────────────────────────────────────────

(defenterprise-schema get-transform-python-library-details-tool
  "Get information about a Python library by path."
  :feature :none
  [{:keys [path]} :- [:map {:closed true} [:path :string]]]
  (agent-transforms/add-output (transforms-write-tools/get-transform-python-library-details {:path path})
                               format-python-library-output))

(defenterprise-schema write-transform-python-tool
  "Write new Python code or edit existing code for transforms.

  Supports two modes:
  - edit: Targeted string replacements with partial edits
  - replace: Replace entire code atomically

  For edit mode, provide edits as an array of {old_string, new_string, replace_all} objects.
  For replace mode, provide new_content with the complete Python code.

  Use `get_transform_python_library_details` before writing any Python code to inspect the shared library.
  Use the shared library in your code by adding `import common` at the top of the file.
  Keep `import common` at the top of the file even if it is currently unused."
  :feature :none
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
    (agent-transforms/add-output
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
     agent-transforms/format-transform-write-output)
    (catch Exception e
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to write Python transform: " (or (ex-message e) "Unknown error"))}))))
