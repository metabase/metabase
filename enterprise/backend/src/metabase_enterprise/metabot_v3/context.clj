(ns metabase-enterprise.metabot-v3.context
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.metabot-v3.table-utils :as table-utils]
   [metabase.config.core :as config]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr])
  (:import
   (java.time OffsetDateTime)
   (java.time.format DateTimeFormatter)))

(set! *warn-on-reflection* true)

;; This is quick and dirty. Feel free to make it more full fledged or throw it away.
(defn log
  "Log a payload. Direction should be `:llm.log/fe->be` or similar. This should not be shipping in this form. This is
  not a rolling log, or logging to the console. This pretty prints to the file `llm-payloads`. It is explicitly useful
  for dev work and not production.

  Examples calls are ;; using doto
    (doto (request message context history)
      (metabot-v3.context/log :llm.log/be->fe))
    ;; or just regularly
    (metabot-v3.context/log _body :llm.log/fe->be)"
  [payload direction]
  (when config/is-dev?
    (let [directions {:llm.log/fe->be "\"FE -----------------> BE\""
                      :llm.log/be->llm "\"BE -----------------> LLM\""
                      :llm.log/llm->be "\"LLM -----------------> BE\""
                      :llm.log/be->fe "\"BE -----------------> FE\""}]
      (with-open [^java.io.BufferedWriter w (io/writer "llm-payloads" :append true)]
        (io/copy (directions direction (name direction)) w)
        (.newLine w)
        (let [payload' (json/encode payload {:pretty true})]
          (io/copy payload' w))
        (.newLine w)
        (.newLine w)))))

(mr/def ::context
  [:map-of :keyword :any])

(mr/def ::capabilities
  [:set :string])

(defn backend-metabot-capabilities
  "Set of backend capabilities available to the AI service. Those are determined by the endpoints available to ai-service. When an endpoint would change in a non-backward compatible way, we should create a new version of this capability."
  []
  ;; 20 ns per call, safe to keep unmemoized
  (for [[[_method url _params] _spec] (-> (the-ns 'metabase-enterprise.metabot-v3.tools.api)
                                          meta
                                          :api/endpoints)]
    (str "backend:/api/ee/metabot-tools" url)))

(def ^:private max-database-tables
  "If the number of tables in the database doesn't exceed this number, we send them all to the agent."
  100)

(defn- database-tables-for-context
  "Get database tables formatted for metabot context, prioritizing tables used in the query (if provided), then filling up to the limit with most viewed tables."
  ([database-id] (database-tables-for-context database-id nil))
  ([database-id {:keys [all-tables-limit query] :or {all-tables-limit max-database-tables}}]
   (when database-id
     (try
       (let [used-tables (if query
                           (table-utils/used-tables query)
                           [])
             used-table-ids (set (map :id used-tables))]
         (table-utils/database-tables database-id
                                      {:all-tables-limit all-tables-limit
                                       :priority-tables used-tables
                                       :exclude-table-ids used-table-ids}))
       (catch Exception e
         (log/error e "Error getting database tables for context")
         ;; If we can't get table info, just return empty - don't break the context
         [])))))

(defn- enhance-context-with-schema
  "Enhance context by adding table schema information for native queries"
  [context]
  (if-let [user-viewing (get context :user_is_viewing)]
    (let [enhanced-viewing
          (mapv (fn [item]
                  (if (and (#{:native "native"} (get-in item [:query :type]))
                           (get-in item [:query :database]))
                    (let [database-id (get-in item [:query :database])
                          tables (database-tables-for-context database-id {:query (:query item)})]
                      (if (seq tables)
                        (assoc item :database_schema tables)
                        item))
                    item))
                user-viewing)]
      (assoc context :user_is_viewing enhanced-viewing))
    context))

(defn- add-backend-capabilities
  "Add backend capabilities to context, merging with any existing capabilities."
  [context]
  (update context :capabilities (fnil into #{}) (backend-metabot-capabilities)))

(defn- set-user-time
  [context {:keys [date-format] :or {date-format DateTimeFormatter/ISO_INSTANT}}]
  (let [offset-time (or (some-> context :current_time_with_timezone OffsetDateTime/parse)
                        (OffsetDateTime/now))]
    (-> context
        (dissoc :current_time_with_timezone)
        (assoc :current_user_time (.format ^DateTimeFormatter date-format offset-time)))))

(mu/defn create-context :- ::context
  "Create a tool context."
  ([context :- ::context]
   (create-context context nil))
  ([context :- ::context
    opts    :- [:maybe [:map-of :keyword :any]]]
   (-> context
       enhance-context-with-schema
       add-backend-capabilities
       (set-user-time opts))))
