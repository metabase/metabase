(ns metabase.metabot.tools.sql.edit
  "Tool for editing existing SQL queries."
  (:require
   [clojure.string :as str]
   [metabase.metabot.schema :as metabot.schema]
   [metabase.metabot.tools.core :as tools]
   [metabase.metabot.tools.sql.common :as metabot.tools.sql.common]
   [metabase.metabot.tools.sql.validation :as metabot.tools.sql.validation]
   [metabase.metabot.util :as metabot.u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.quoting :as quoting]))

(set! *warn-on-reflection* true)

(def ^:private edit-error-payload
  [:map {:closed true}
   [:query-id :string]
   [:current-sql :string]
   [:sql-before-edit :string]
   [:edit-index :int]
   [:old-string :string]
   [:occurrences :int]])

(defn- edit-context
  [{:keys [current-sql sql-before-edit]}]
  (str " No edits were saved. Current SQL: " (quoting/quoted current-sql)
       (when (not= current-sql sql-before-edit)
         (str " SQL before this edit (including earlier proposed edits): " (quoting/quoted sql-before-edit)))))

(tools/defrecoverable edit-not-found!
  "An edit's old text is absent from the SQL at that step."
  {:payload edit-error-payload}
  [{:keys [query-id edit-index old-string] :as payload}]
  {:message (str "Edit " edit-index " for query " (quoting/quoted query-id)
                 ": text to replace not found: " (quoting/quoted old-string) "." (edit-context payload))
   :recovery [{:uses #{} :text "Revise the edits against the current SQL and retry the complete edit list."}]})

(tools/defrecoverable edit-ambiguous!
  "An edit's old text matches more than once without replace_all."
  {:payload edit-error-payload}
  [{:keys [query-id edit-index old-string occurrences] :as payload}]
  {:message (str "Edit " edit-index " for query " (quoting/quoted query-id)
                 ": text to replace found multiple times (" occurrences "): " (quoting/quoted old-string)
                 "." (edit-context payload))
   :recovery [{:uses #{} :text (str "Include enough surrounding SQL to match once, or set replace_all to true "
                                    "if every occurrence should change. Retry the complete edit list against the current SQL.")}]})

(defn- apply-sql-edit
  [context sql [index {old-string :old_string new-string :new_string replace-all :replace_all}]]
  (let [pattern (re-pattern (java.util.regex.Pattern/quote old-string))
        occurrences (count (re-seq pattern sql))
        payload (assoc context :sql-before-edit sql :edit-index (inc index)
                       :old-string old-string :occurrences occurrences)]
    (cond
      (zero? occurrences) (edit-not-found! payload)
      (and (> occurrences 1) (not replace-all)) (edit-ambiguous! payload)
      replace-all (str/replace sql old-string new-string)
      :else (str/replace-first sql old-string new-string))))

(mu/defn edit-sql-query :- ::metabot.tools.sql.common/operation-result
  "Edit an existing SQL query from in-memory state.

  Parameters:
  - query-id: ID of the query to edit
  - edit: Edit specification map (see apply-sql-edit for format)
  - name: New name for the query (optional)
  - description: New description for the query (optional)

  Returns an `operation-result` map. For details see its docstring."
  [{:keys [query-id edits queries-state]}
   :- [:map {:closed true}
       [:query-id [:or :string :int]]
       [:edits [:sequential [:map {:closed true}
                             [:old_string :string]
                             [:new_string :string]
                             [:replace_all {:optional true} [:maybe :boolean]]]]]
       [:checklist {:optional true} [:maybe :string]]
       [:queries-state [:map-of :string ::metabot.schema/query]]]]
  (log/info "Editing SQL query" {:query-id query-id :edit-count (count edits)})

  (let [query-id (str query-id)
        query (metabot.tools.sql.common/query-for-sql-edit! queries-state query-id)
        current-sql (metabot.u/extract-sql-content query)
        new-sql (reduce (partial apply-sql-edit {:query-id query-id :current-sql current-sql})
                        current-sql (map-indexed vector edits))
        dialect (metabot.tools.sql.validation/query->dialect query)
        {:keys [valid? transpiled-sql] :as validation-result}
        (metabot.tools.sql.validation/validate-sql dialect new-sql)]
    (merge {:validation-result validation-result}
           (when valid?
             (let [updated-query (metabot.tools.sql.common/update-query-sql query transpiled-sql)]
               {:action-result {:query-id      query-id
                                :query-content transpiled-sql
                                :query         updated-query
                                :database      (:database query)}})))))
