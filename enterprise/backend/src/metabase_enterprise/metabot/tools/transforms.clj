(ns metabase-enterprise.metabot.tools.transforms
  "Enterprise implementations of Python transform tools."
  (:require
   [metabase-enterprise.metabot.tools.transforms.write :as transforms-write-tools]
   [metabase.metabot.tools.shared :as shared]
   [metabase.metabot.tools.transforms :as tools.transforms]
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
  :feature :transforms-python
  [{:keys [path]} :- [:map {:closed true} [:path :string]]]
  (tools.transforms/add-output (transforms-write-tools/get-transform-python-library-details {:path path})
                               format-python-library-output))

(defenterprise-schema write-transform-python-tool :- :map
  "Write new Python code or edit existing code for transforms.

  Supports two modes:
  - edit: Targeted string replacements with partial edits
  - replace: Replace entire code atomically

  For edit mode, provide edits as an array of {old_string, new_string, replace_all} objects.
  For replace mode, provide new_content with the complete Python code.

  Use `get_transform_python_library_details` before writing any Python code to inspect the shared library.
  Use the shared library in your code by adding `import common` at the top of the file.
  Keep `import common` at the top of the file even if it is currently unused."
  :feature :transforms-python
  [{:keys [transform_id edit_action thinking transform_name transform_description
           database_id source_tables]}
   :- tools.transforms/write-transform-python-schema]
  (try
    (tools.transforms/add-output
     (transforms-write-tools/write-transform-python
      {:transform_id transform_id
       :edit_action edit_action
       :thinking thinking
       :transform_name transform_name
       :transform_description transform_description
       :source_database database_id
       :source_tables source_tables
       :memory-atom shared/*memory-atom*
       :context (shared/current-context)})
     tools.transforms/format-transform-write-output)
    (catch Exception e
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to write Python transform: " (or (ex-message e) "Unknown error"))}))))
