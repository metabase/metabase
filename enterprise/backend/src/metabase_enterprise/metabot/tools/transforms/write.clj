(ns metabase-enterprise.metabot.tools.transforms.write
  "Tools for writing/editing Python transform source code."
  (:require
   [metabase-enterprise.transforms-python.api :as transforms-python.api]
   [metabase.metabot.agent.streaming :as streaming]
   [metabase.metabot.tools.transforms.write :as transforms-write]
   [metabase.metabot.tools.util :as metabot.tools.u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; Write Transform Python Tool

(defn write-transform-python
  "Write or edit Python transform source code.

  Parameters:
  - transform-id: Optional ID of existing transform to edit
  - edit-action: Either {:mode \"edit\" :edits [...]} or {:mode \"replace\" :new-content \"...\"}
  - thinking: Explanation of what changes are being made
  - transform-name: Name for new transform (required if no transform-id)
  - transform-description: Description for new transform
  - source-database: Database ID for source tables
  - source-tables: Map of table aliases to table IDs
  - memory-atom: Atom containing agent memory (injected by wrapper)
  - context: Request context with current transform if editing

  Returns map with:
  - :structured-output - The suggested transform
  - :data-parts - Transform suggestion data part for streaming"
  [{:keys [transform_id edit_action thinking transform_name transform_description
           source_database source_tables memory-atom context]}]
  (log/info "Writing Python transform" {:transform-id transform_id
                                        :edit-mode (:mode edit_action)
                                        :has-context (some? context)})

  (let [;; Get current transform from context or memory, or create fresh one
        current-transform (cond
                            ;; Try to get from context first
                            (and transform_id context)
                            (get-in context [:transforms (str transform_id)])

                            ;; Then try memory
                            (and transform_id memory-atom)
                            (get-in @memory-atom [:state :transforms (str transform_id)])

                            ;; Create fresh transform
                            :else
                            (transforms-write/create-fresh-transform :python transform_name transform_description
                                                                     source_database source_tables))

        _ (when (and transform_id (nil? current-transform))
            (throw (ex-info (str "Transform with ID " transform_id " not found. "
                                 "Use search to find available transforms.")
                            {:agent-error? true
                             :transform-id transform_id})))

        current-python (get-in current-transform [:source :body] "")

        ;; Apply edits based on mode
        new-python (case (:mode edit_action)
                     "edit" (transforms-write/apply-edits current-python (:edits edit_action))
                     "replace" (:new_content edit_action)
                     ;; Default to replace if no mode specified but new_content provided
                     (if (:new_content edit_action)
                       (:new_content edit_action)
                       (throw (ex-info "Invalid edit_action: must specify mode 'edit' with edits or mode 'replace' with new_content"
                                       {:agent-error? true
                                        :edit-action edit_action}))))

        ;; Build suggested transform
        suggested-transform (cond-> current-transform
                              transform_name        (assoc :name transform_name)
                              transform_description (assoc :description transform_description)
                              ;; source adjustments
                              source_database       (assoc-in [:source :source-database] source_database)
                              source_tables         (assoc-in [:source :source-tables] source_tables)
                              true                  (assoc-in [:source :body] new-python))]

    ;; Store in memory if we have an ID
    (when (and transform_id memory-atom)
      (swap! memory-atom assoc-in [:state :transforms (str transform_id)] suggested-transform))

    (log/debug "Python transform written" {:transform-id transform_id
                                           :python-length (count new-python)})

    {:structured-output {:transform suggested-transform
                         :thinking thinking
                         :message "Transform Python code updated successfully."}
     :data-parts [(streaming/transform-suggestion-part suggested-transform)]
     :instructions "The transform suggestion has been created and displayed to the user. Do not repeat the Python content."}))

(defn get-transform-python-library-details
  "Get information about a Python library by path."
  [{:keys [path]}]
  (try
    {:structured_output
     (transforms-python.api/get-python-library-by-path path)}
    (catch Exception e
      (metabot.tools.u/handle-agent-error e))))
