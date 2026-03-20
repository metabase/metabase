(ns metabase-enterprise.metabot-v3.tools.transforms-write
  "Tools for writing/editing SQL and Python transform source code.
  Supports both partial edits (targeted string replacements) and full replacement modes."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.metabot-v3.agent.streaming :as streaming]
   [metabase.util :as u]
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
  "import common
import pandas as pd

def transform():
    # Your transformation logic here
    return pd.DataFrame([{\"message\": \"Hello from Python transform!\"}])
")

(defn- create-fresh-sql-transform
  "Create a fresh SQL transform structure.
  The source uses type 'query' with a DatasetQuery object containing native SQL."
  [transform-name transform-description source-database]
  {:id nil
   :name (or transform-name "New SQL Transform")
   :description (or transform-description "")
   :source {:type "query"
            :query {:type "native"
                    :database source-database
                    :native {:query fresh-sql-template}}}
   :target {:type "table"
            :name ""
            :schema nil
            :database source-database}})

(defn- create-fresh-python-transform
  "Create a fresh Python transform structure.
  The source uses type 'python' with the code in the 'body' field."
  [transform-name transform-description source-database source-tables]
  {:id nil
   :name (or transform-name "New Python Transform")
   :description (or transform-description "")
   :source {:type "python"
            :body fresh-python-template
            :source-database source-database
            :source-tables (or source-tables [])}
   :target {:type "table"
            :name ""
            :schema nil
            :database source-database}})

;;; Write Transform SQL Tool

(defn write-transform-sql
  "Write or edit SQL transform source code.

  Parameters:
  - transform-id: Optional ID of existing transform to edit
  - mode: Either \"edit\" or \"replace\"
  - edits: For edit mode, array of {:old_string :new_string :replace_all} maps
  - new_content: For replace mode, the complete content
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
  [{:keys [transform_id mode edits new_content thinking transform_name transform_description
           source_database source_tables memory-atom context]}]
  (log/info "Writing SQL transform" {:transform-id transform_id
                                     :edit-mode mode
                                     :has-context (some? context)})
  (def tsp-memory memory-atom)
  (def tsp-context context)
  (def tsp-transform-id transform_id)
  (let [ ;; Get current transform from context or memory, or create fresh one
        ;; For new transforms, generate a temporary ID so the LLM can reference it later
        is-new-transform? (nil? transform_id)
        effective-transform-id (or transform_id (u/generate-nano-id))

        current-transform (or
                           ;; Try to get from context first (for transforms user is viewing)
                           (when (and transform_id context)
                             (get-in context [:transforms (str transform_id)]))
                           ;; Then try memory (for transforms created in session)
                           (when (and transform_id memory-atom)
                             (get-in @memory-atom [:state :transforms (str transform_id)]))
                           ;; Create fresh transform if no transform_id
                           (when-not transform_id
                             (create-fresh-sql-transform transform_name transform_description
                                                         source_database)))

        _ (when (and transform_id (nil? current-transform))
            (throw (ex-info (str "Transform with ID " transform_id " not found. "
                                 "Use search to find available transforms.")
                            {:agent-error? true
                             :transform-id transform_id})))

        ;; Extract current SQL from the DatasetQuery structure
        ;; Path is [:source :query :native :query] for native SQL transforms
        current-sql (get-in current-transform [:source :query :native :query] "")

        ;; Apply edits based on mode
        new-sql (case mode
                  "edit" (apply-edits current-sql edits)
                  "replace" new_content
                  ;; Default to replace if no mode specified but new_content provided
                  (if new_content
                    new_content
                    (throw (ex-info "Invalid input: must specify mode 'edit' with edits or mode 'replace' with new_content"
                                    {:agent-error? true
                                     :mode mode}))))

        ;; Build suggested transform - update SQL in the nested DatasetQuery structure
        suggested-transform (cond-> current-transform
                              true (assoc-in [:source :query :native :query] new-sql)
                              transform_name (assoc :name transform_name)
                              transform_description (assoc :description transform_description)
                              source_database (assoc-in [:source :query :database] source_database)
                              source_database (assoc-in [:target :database] source_database))]

    ;; Always store in memory so the LLM can reference this transform later
    (when memory-atom
      (swap! memory-atom assoc-in [:state :transforms (str effective-transform-id)] suggested-transform))

    (log/debug "SQL transform written" {:transform-id effective-transform-id
                                        :is-new? is-new-transform?
                                        :sql-length (count new-sql)})

    {:structured-output {:transform suggested-transform
                         :transform-id effective-transform-id
                         :thinking thinking
                         :message (if is-new-transform?
                                    (str "Transform SQL created successfully. Transform ID: " effective-transform-id)
                                    "Transform SQL updated successfully.")}
     :data-parts [(streaming/transform-suggestion-part suggested-transform)]
     :instructions (str "The transform suggestion has been created and displayed to the user. "
                        (when is-new-transform?
                          (str "The transform ID is: " effective-transform-id ". Use this ID if you need to edit this transform later. "))
                        "Do not repeat the SQL content.")}))

;;; Write Transform Python Tool

(defn write-transform-python
  "Write or edit Python transform source code.

  Parameters:
  - transform-id: Optional ID of existing transform to edit
  - mode: Either \"edit\" or \"replace\"
  - edits: For edit mode, array of {:old_string :new_string :replace_all} maps
  - new_content: For replace mode, the complete content
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
  [{:keys [transform_id mode edits new_content thinking transform_name transform_description
           source_database source_tables memory-atom context]}]
  (log/info "Writing Python transform" {:transform-id transform_id
                                        :edit-mode mode
                                        :has-context (some? context)})

  (let [;; Get current transform from context or memory, or create fresh one
        ;; For new transforms, generate a temporary ID so the LLM can reference it later
        is-new-transform? (nil? transform_id)
        effective-transform-id (or transform_id (u/generate-nano-id))

        current-transform (or
                            ;; Try to get from context first (for transforms user is viewing)
                           (when (and transform_id context)
                             (get-in context [:transforms (str transform_id)]))
                            ;; Then try memory (for transforms created in session)
                           (when (and transform_id memory-atom)
                             (get-in @memory-atom [:state :transforms (str transform_id)]))
                            ;; Create fresh transform if no transform_id
                           (when-not transform_id
                             (create-fresh-python-transform transform_name transform_description
                                                            source_database source_tables)))

        _ (when (and transform_id (nil? current-transform))
            (throw (ex-info (str "Transform with ID " transform_id " not found. "
                                 "Use search to find available transforms.")
                            {:agent-error? true
                             :transform-id transform_id})))

        ;; Extract current Python code from the body field
        current-python (get-in current-transform [:source :body] "")

        ;; Apply edits based on mode
        new-python (case mode
                     "edit" (apply-edits current-python edits)
                     "replace" new_content
                     ;; Default to replace if no mode specified but new_content provided
                     (if new_content
                       new_content
                       (throw (ex-info "Invalid input: must specify mode 'edit' with edits or mode 'replace' with new_content"
                                       {:agent-error? true
                                        :mode mode}))))

        ;; Build suggested transform - update Python code in the body field
        suggested-transform (cond-> current-transform
                              true (assoc-in [:source :body] new-python)
                              transform_name (assoc :name transform_name)
                              transform_description (assoc :description transform_description)
                              source_database (assoc-in [:source :source-database] source_database)
                              source_database (assoc-in [:target :database] source_database)
                              source_tables (assoc-in [:source :source-tables] source_tables))]

    ;; Always store in memory so the LLM can reference this transform later
    (when memory-atom
      (swap! memory-atom assoc-in [:state :transforms (str effective-transform-id)] suggested-transform))

    (log/debug "Python transform written" {:transform-id effective-transform-id
                                           :is-new? is-new-transform?
                                           :python-length (count new-python)})

    {:structured-output {:transform suggested-transform
                         :transform-id effective-transform-id
                         :thinking thinking
                         :message (if is-new-transform?
                                    (str "Transform Python code created successfully. Transform ID: " effective-transform-id)
                                    "Transform Python code updated successfully.")}
     :data-parts [(streaming/transform-suggestion-part suggested-transform)]
     :instructions (str "The transform suggestion has been created and displayed to the user. "
                        (when is-new-transform?
                          (str "The transform ID is: " effective-transform-id ". Use this ID if you need to edit this transform later. "))
                        "Do not repeat the Python content.")}))
