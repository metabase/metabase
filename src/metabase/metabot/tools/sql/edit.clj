(ns metabase.metabot.tools.sql.edit
  "Tool for editing existing SQL queries."
  (:require
   [clojure.string :as str]
   [metabase.metabot.tools.sql.common :as metabot.tools.sql.common]
   [metabase.metabot.tools.sql.validation :as metabot.tools.sql.validation]
   [metabase.metabot.util :as metabot.u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- apply-sql-edit
  "Apply a targeted string replacement to SQL content."
  [sql {:keys [old_string new_string replace_all]}]
  (when-not (and (string? old_string) (string? new_string))
    (throw (ex-info (tru "Each edit must include old_string and new_string")
                    {:agent-error? true})))
  (let [pattern (re-pattern (java.util.regex.Pattern/quote old_string))
        occurrences (count (re-seq pattern sql))]
    (cond
      (zero? occurrences)
      (throw (ex-info (tru "Text to replace not found: {0}" old_string)
                      {:agent-error? true
                       :old old_string}))

      (and (> occurrences 1) (not replace_all))
      (throw (ex-info (tru "Text to replace found multiple times: {0}" old_string)
                      {:agent-error? true
                       :old old_string
                       :occurrences occurrences}))

      replace_all
      (str/replace sql old_string new_string)

      :else
      (str/replace-first sql old_string new_string))))

(mu/defn edit-sql-query :- ::metabot.tools.sql.common/operation-result
  "Edit an existing SQL query from in-memory state.

  Parameters:
  - query-id: ID of the query to edit
  - edit: Edit specification map (see apply-sql-edit for format)
  - name: New name for the query (optional)
  - description: New description for the query (optional)

  Returns an `operation-result` map. For details see its docstring."
  [{:keys [query-id edits queries-state]}]
  (log/info "Editing SQL query" {:query-id query-id :edit-count (count edits)})

  ;; Look up query from in-memory state
  (let [query-id (str query-id)
        query (get queries-state query-id)]
    (when-not query
      (throw (ex-info (tru "Query {0} not found" query-id)
                      {:agent-error? true
                       :query-id query-id
                       :available-queries (keys queries-state)})))

    (let [current-sql (metabot.u/extract-sql-content query)]
      (when-not current-sql
        (throw (ex-info (tru "Query {0} is not a SQL query" query-id)
                        {:agent-error? true
                         :query-id query-id})))

      (let [;; Apply edits sequentially
            new-sql (reduce apply-sql-edit current-sql edits)
            dialect (metabot.tools.sql.validation/query->dialect query)

            {:keys [valid? transpiled-sql] :as validation-result}
            (metabot.tools.sql.validation/validate-sql dialect new-sql)]
        (merge {:validation-result validation-result}
               (when valid?
                 (let [updated-query (metabot.tools.sql.common/update-query-sql query transpiled-sql)]
                   {:action-result {:query-id      query-id
                                    :query-content transpiled-sql
                                    :query         updated-query
                                    :database      (:database query)}})))))))
