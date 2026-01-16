(ns metabase-enterprise.metabot-v3.tools.navigate
  "Tool for navigating users to specific pages in Metabase UI."
  (:require
   [buddy.core.codecs :as codecs]
   [metabase-enterprise.metabot-v3.agent.links :as links]
   [metabase.util.json :as json]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- create-sql-editor-hash
  "Create a hash for the SQL editor with optional database ID."
  [database-id]
  (let [query-data {:dataset_query {:database database-id
                                    :type "native"
                                    :native {:query ""}}}]
    (-> query-data
        json/encode
        (.getBytes "UTF-8")
        codecs/bytes->b64-str)))

(defn- page->path
  "Convert a page name to a URL path."
  [page database-id]
  (case page
    "notebook_editor" "/question/notebook"
    "metrics_browser" "/browse/metrics"
    "model_browser" "/browse/models"
    "database_browser" "/browse/databases"
    "sql_editor" (str "/question#" (create-sql-editor-hash database-id))
    "home" "/"
    (throw (ex-info (str "Unknown page: " page ". Valid pages: notebook_editor, metrics_browser, model_browser, database_browser, sql_editor, home")
                    {:agent-error? true :page page}))))

(defn- entity->path
  "Convert an entity type and ID to a URL path."
  [entity-type entity-id]
  (case entity-type
    "table" (str "/table/" entity-id)
    "model" (str "/model/" entity-id)
    "question" (str "/question/" entity-id)
    "metric" (str "/metric/" entity-id)
    "dashboard" (str "/dashboard/" entity-id)
    "database" (str "/browse/databases/" entity-id)
    "collection" (str "/collection/" entity-id)
    (throw (ex-info (str "Unknown entity type: " entity-type ". Valid types: table, model, question, metric, dashboard, database, collection")
                    {:agent-error? true :entity-type entity-type}))))

(defn- destination->path
  "Convert navigation destination to a URL path.
  Handles page navigation, entity navigation, and query/chart link resolution."
  [destination memory]
  (cond
    ;; Page navigation
    (:page destination)
    (page->path (:page destination) (:database_id destination))

    ;; Entity navigation
    (and (:entity_type destination) (:entity_id destination))
    (entity->path (:entity_type destination) (:entity_id destination))

    ;; Query result navigation (resolve from memory)
    (:query_id destination)
    (let [queries-state (get-in memory [:state :queries] {})
          charts-state (get-in memory [:state :charts] {})]
      (or (links/resolve-metabase-uri (str "metabase://query/" (:query_id destination))
                                      queries-state
                                      charts-state)
          (throw (ex-info (str "Query not found: " (:query_id destination))
                          {:agent-error? true :query-id (:query_id destination)}))))

    ;; Chart navigation (resolve from memory)
    (:chart_id destination)
    (let [queries-state (get-in memory [:state :queries] {})
          charts-state (get-in memory [:state :charts] {})]
      (or (links/resolve-metabase-uri (str "metabase://chart/" (:chart_id destination))
                                      queries-state
                                      charts-state)
          (throw (ex-info (str "Chart not found: " (:chart_id destination))
                          {:agent-error? true :chart-id (:chart_id destination)}))))

    :else
    (throw (ex-info "Invalid destination: must specify page, entity_type+entity_id, query_id, or chart_id"
                    {:agent-error? true :destination destination}))))

(defn- format-navigation-message
  "Format a user-friendly message describing the navigation."
  [destination]
  (cond
    (:page destination)
    (str "Navigating to " (name (:page destination)) " page.")

    (and (:entity_type destination) (:entity_id destination))
    (str "Navigating to " (:entity_type destination) " " (:entity_id destination) ".")

    (:query_id destination)
    (str "Navigating to query results.")

    (:chart_id destination)
    (str "Navigating to chart.")

    :else
    "Navigating to destination."))

(defn navigate
  "Navigate user to a specific page in Metabase UI.

  Parameters:
  - destination: Map describing where to navigate. One of:
    - {:page \"page_name\"} - Navigate to a specific page
    - {:page \"sql_editor\" :database_id 123} - Navigate to SQL editor with database
    - {:entity_type \"model\" :entity_id 123} - Navigate to an entity
    - {:query_id \"abc123\"} - Navigate to query results
    - {:chart_id \"xyz789\"} - Navigate to chart
  - memory-atom: Atom containing agent memory (for link resolution)

  Returns map with:
  - :structured-output - Message for the LLM
  - :reactions - Navigation action"
  [{:keys [destination memory-atom]}]
  (log/info "Navigating user" {:destination destination})
  (let [memory (when memory-atom @memory-atom)
        path (destination->path destination memory)
        message (format-navigation-message destination)]
    (log/debug "Resolved navigation path" {:path path})
    {:structured-output {:message message
                         :path path}
     :reactions [{:type :metabot.reaction/redirect :url path}]}))

(defn navigate-tool
  "Tool handler for navigate_user tool."
  [args]
  (try
    (let [result (navigate args)
          reactions (:reactions result)]
      (cond-> {:structured-output (:structured-output result)}
        (seq reactions) (assoc :reactions reactions)))
    (catch Exception e
      (log/error e "Error navigating")
      (if (:agent-error? (ex-data e))
        {:output (ex-message e)}
        {:output (str "Failed to navigate: " (or (ex-message e) "Unknown error"))}))))
