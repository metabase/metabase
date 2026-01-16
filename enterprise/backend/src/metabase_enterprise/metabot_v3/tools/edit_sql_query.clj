(ns metabase-enterprise.metabot-v3.tools.edit-sql-query
  "Tool for editing existing SQL queries."
  (:require
   [buddy.core.codecs :as codecs]
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- query->url-hash
  "Convert a query to a base64-encoded URL hash."
  [query]
  (-> {:dataset_query query}
      json/encode
      (.getBytes "UTF-8")
      codecs/bytes->b64-str))

(defn- query->results-url
  "Convert a query to a /question# URL for navigation."
  [query]
  (str "/question#" (query->url-hash query)))

(defn- get-query-card
  "Fetch a query card and validate access."
  [query-id]
  (let [card (t2/select-one :model/Card :id query-id)]
    (when-not card
      (throw (ex-info (tru "Query {0} not found" query-id)
                      {:agent-error? true
                       :query-id query-id})))
    (api/write-check card)
    card))

(defn- extract-sql-content
  "Extract SQL content from a card's dataset_query.
  Handles both legacy format and lib/query format."
  [card]
  (or
   ;; Try lib/query format (with stages)
   (get-in card [:dataset_query :stages 0 :native])
   ;; Try legacy format
   (get-in card [:dataset_query :native :query])))

(defn- apply-sql-edit
  "Apply an edit to SQL content.

  Edit can be:
  - {:type :replace :old <string> :new <string>} - Replace first occurrence
  - {:type :replace-all :old <string> :new <string>} - Replace all occurrences
  - {:type :append :text <string>} - Append to end
  - {:type :prepend :text <string>} - Prepend to start
  - {:type :insert-after :marker <string> :text <string>} - Insert after marker
  - {:type :insert-before :marker <string> :text <string>} - Insert before marker"
  [sql edit]
  (case (:type edit)
    :replace
    (let [{:keys [old new]} edit]
      (when-not (str/includes? sql old)
        (throw (ex-info (tru "Text to replace not found: {0}" old)
                        {:agent-error? true
                         :old old})))
      (str/replace-first sql old new))

    :replace-all
    (let [{:keys [old new]} edit]
      (when-not (str/includes? sql old)
        (throw (ex-info (tru "Text to replace not found: {0}" old)
                        {:agent-error? true
                         :old old})))
      (str/replace sql old new))

    :append
    (str sql "\n" (:text edit))

    :prepend
    (str (:text edit) "\n" sql)

    :insert-after
    (let [{:keys [marker text]} edit]
      (when-not (str/includes? sql marker)
        (throw (ex-info (tru "Marker not found: {0}" marker)
                        {:agent-error? true
                         :marker marker})))
      (str/replace-first sql marker (str marker "\n" text)))

    :insert-before
    (let [{:keys [marker text]} edit]
      (when-not (str/includes? sql marker)
        (throw (ex-info (tru "Marker not found: {0}" marker)
                        {:agent-error? true
                         :marker marker})))
      (str/replace-first sql marker (str text "\n" marker)))

    (throw (ex-info (tru "Unknown edit type: {0}" (:type edit))
                    {:agent-error? true
                     :type (:type edit)}))))

(defn edit-sql-query
  "Edit an existing SQL query.

  Parameters:
  - query-id: ID of the query to edit
  - edit: Edit specification map (see apply-sql-edit for format)
  - name: New name for the query (optional)
  - description: New description for the query (optional)

  Returns a map with:
  - :query-id - The ID of the updated query
  - :query-content - The updated SQL content
  - :database - Database ID"
  [{:keys [query-id edit name description]}]
  (log/info "Editing SQL query" {:query-id query-id :edit-type (:type edit)})

  ;; Get and validate card
  (let [card (get-query-card query-id)
        current-sql (extract-sql-content card)]

    (when-not current-sql
      (throw (ex-info (tru "Query {0} is not a SQL query" query-id)
                      {:agent-error? true
                       :query-id query-id})))

    ;; Apply the edit
    (let [new-sql (apply-sql-edit current-sql edit)
          ;; Update dataset_query - handle both lib/query format (with :stages) and legacy format
          updated-query (if (get-in card [:dataset_query :stages])
                          (assoc-in (:dataset_query card) [:stages 0 :native] new-sql)
                          (assoc-in (:dataset_query card) [:native :query] new-sql))
          updates (cond-> {:dataset_query updated-query}
                    name (assoc :name name)
                    description (assoc :description description))]

      ;; Update the card
      (t2/update! :model/Card query-id updates)

      (log/info "Updated SQL query card" {:card-id query-id})

      {:query-id      query-id
       :query-content new-sql
       :query         updated-query  ;; Include for memory storage
       :database      (:database_id card)})))

(defn edit-sql-query-tool
  "Tool handler for edit_sql_query tool.
  Returns structured output with updated query details and a redirect reaction to auto-navigate the user."
  [args]
  (try
    (let [result (edit-sql-query args)
          results-url (query->results-url (:query result))]
      {:structured-output result
       :reactions [{:type :metabot.reaction/redirect :url results-url}]})
    (catch Exception e
      (log/error e "Error editing SQL query")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to edit SQL query: " (or (ex-message e) "Unknown error"))}))))
