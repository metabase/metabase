(ns metabase-enterprise.metabot-v3.tools.transforms-write
  "Tools for writing/editing SQL and Python transform source code.
  Supports both partial edits (targeted string replacements) and full replacement modes."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; Edit Application

(defn- count-occurrences
  "Count occurrences of a literal string in text."
  [text search-str]
  (if (or (str/blank? text) (str/blank? search-str))
    0
    (let [pattern (java.util.regex.Pattern/quote search-str)]
      (count (re-seq (re-pattern pattern) text)))))

(defn- apply-single-edit
  "Apply a single edit to content. Validates uniqueness unless replace_all is true."
  [content {:keys [old_string new_string replace_all]}]
  (let [occurrence-count (count-occurrences content old_string)]
    (cond
      (zero? occurrence-count)
      (throw (ex-info (str "Could not find text to replace: \"" old_string "\"")
                      {:agent-error? true
                       :old-string old_string}))

      (and (> occurrence-count 1) (not replace_all))
      (throw (ex-info (str "Found " occurrence-count " matches for \"" old_string "\". "
                           "Use replace_all=true to replace all occurrences, or add more context to make the match unique.")
                      {:agent-error? true
                       :old-string old_string
                       :occurrence-count occurrence-count}))

      :else
      (if replace_all
        (str/replace content old_string new_string)
        (str/replace-first content old_string new_string)))))

(defn- apply-edits
  "Apply a sequence of partial edits to content.
  Each edit is applied in order, and the result becomes input for the next edit.
  All edits must succeed or the operation fails (atomic behavior)."
  [content edits]
  (reduce apply-single-edit content edits))

;;; Transform Templates

(def ^:private fresh-sql-template
  "-- New SQL Transform
-- Write your SQL query here
SELECT 1 AS placeholder")

(def ^:private fresh-python-template
  "import pandas as pd

def transform():
    # Your transformation logic here
    return pd.DataFrame([{\"message\": \"Hello from Python transform!\"}])
")

(defn- create-fresh-transform
  "Create a fresh transform structure with the given source type."
  [source-type transform-name transform-description source-database source-tables]
  (let [template (case source-type
                   :sql fresh-sql-template
                   :python fresh-python-template)]
    {:id nil
     :name (or transform-name (str "New " (name source-type) " Transform"))
     :description (or transform-description "")
     :source {:type (name source-type)
              :query template
              :source-database source-database
              :source-tables (or source-tables {})}
     :target {:type "table"
              :name ""}}))

;;; Write Transform SQL Tool

(defn write-transform-sql
  "Write or edit SQL transform source code.

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
  (log/info "Writing SQL transform" {:transform-id transform_id
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
                            (create-fresh-transform :sql transform_name transform_description
                                                    source_database source_tables))

        _ (when (and transform_id (nil? current-transform))
            (throw (ex-info (str "Transform with ID " transform_id " not found. "
                                 "Use search to find available transforms.")
                            {:agent-error? true
                             :transform-id transform_id})))

        current-sql (get-in current-transform [:source :query] "")

        ;; Apply edits based on mode
        new-sql (case (:mode edit_action)
                  "edit" (apply-edits current-sql (:edits edit_action))
                  "replace" (:new_content edit_action)
                  ;; Default to replace if no mode specified but new_content provided
                  (if (:new_content edit_action)
                    (:new_content edit_action)
                    (throw (ex-info "Invalid edit_action: must specify mode 'edit' with edits or mode 'replace' with new_content"
                                    {:agent-error? true
                                     :edit-action edit_action}))))

        ;; Build suggested transform
        suggested-transform (cond-> current-transform
                              true (assoc-in [:source :query] new-sql)
                              transform_name (assoc :name transform_name)
                              transform_description (assoc :description transform_description)
                              source_database (assoc-in [:source :source-database] source_database)
                              source_tables (assoc-in [:source :source-tables] source_tables))]

    ;; Store in memory if we have an ID
    (when (and transform_id memory-atom)
      (swap! memory-atom assoc-in [:state :transforms (str transform_id)] suggested-transform))

    (log/debug "SQL transform written" {:transform-id transform_id
                                        :sql-length (count new-sql)})

    {:structured-output {:transform suggested-transform
                         :thinking thinking
                         :message "Transform SQL updated successfully."}
     :data-parts [(streaming/transform-suggestion-part suggested-transform)]
     :instructions "The transform suggestion has been created and displayed to the user. Do not repeat the SQL content."}))

(defn write-transform-sql-tool
  "Tool handler for write_transform_sql tool."
  [args]
  (try
    (write-transform-sql args)
    (catch Exception e
      (log/error e "Error writing SQL transform")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to write SQL transform: " (or (ex-message e) "Unknown error"))}))))

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
                            (create-fresh-transform :python transform_name transform_description
                                                    source_database source_tables))

        _ (when (and transform_id (nil? current-transform))
            (throw (ex-info (str "Transform with ID " transform_id " not found. "
                                 "Use search to find available transforms.")
                            {:agent-error? true
                             :transform-id transform_id})))

        current-python (get-in current-transform [:source :query] "")

        ;; Apply edits based on mode
        new-python (case (:mode edit_action)
                     "edit" (apply-edits current-python (:edits edit_action))
                     "replace" (:new_content edit_action)
                     ;; Default to replace if no mode specified but new_content provided
                     (if (:new_content edit_action)
                       (:new_content edit_action)
                       (throw (ex-info "Invalid edit_action: must specify mode 'edit' with edits or mode 'replace' with new_content"
                                       {:agent-error? true
                                        :edit-action edit_action}))))

        ;; Build suggested transform
        suggested-transform (cond-> current-transform
                              true (assoc-in [:source :query] new-python)
                              true (assoc-in [:source :type] "python")
                              transform_name (assoc :name transform_name)
                              transform_description (assoc :description transform_description)
                              source_database (assoc-in [:source :source-database] source_database)
                              source_tables (assoc-in [:source :source-tables] source_tables))]

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

(defn write-transform-python-tool
  "Tool handler for write_transform_python tool."
  [args]
  (try
    (write-transform-python args)
    (catch Exception e
      (log/error e "Error writing Python transform")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to write Python transform: " (or (ex-message e) "Unknown error"))}))))
