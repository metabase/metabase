(ns metabase-enterprise.metabot-v3.context
  (:require
   [clojure.java.io :as io]
   [medley.core :as m]
   [metabase-enterprise.metabot-v3.table-utils :as table-utils]
   [metabase-enterprise.transforms-base.util :as transforms-base.util]
   [metabase.activity-feed.core :as activity-feed]
   [metabase.api.common :as api]
   [metabase.config.core :as config]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
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
  "Set of backend capabilities available to the AI service. Those are determined by the endpoints available to
  ai-service. When an endpoint would change in a non-backward compatible way, we should create a new version of this
  capability."
  []
  ;; 20 ns per call, safe to keep unmemoized
  (for [[[_method url _params] _spec] (-> (the-ns 'metabase-enterprise.metabot-v3.tools.api)
                                          meta
                                          :api/endpoints)]
    (str "backend:/api/ee/metabot-tools" url)))

(defn- query-for-sql-parsing
  "Given an item in context, return the query if it is a native query or SQL transform that can have table usage parsed
  from it, otherwise nil."
  [item]
  (when-let [query (case (:type item)
                     "transform" (-> item :source :query)
                     "adhoc" (-> item :query)
                     (-> item :query))]
    ;; Draft transforms might not have a database yet. Check this before attempting to normalize the query.
    (when (:database query)
      (when-let [normalized-query (lib-be/normalize-query query)]
        (when (lib/native-only-query? normalized-query)
          normalized-query)))))

(defn- database-tables-for-context
  "Get database tables formatted for metabot context. Only includes tables used in the query, formatted for API output.
   Removes duplicate tables by id while preserving first occurrence order."
  [{:keys [query]}]
  (try
    (if query
      (let [used-tables (table-utils/used-tables query)
            tables (table-utils/enhanced-database-tables (:database query)
                                                         {:priority-tables used-tables
                                                          :all-tables-limit (count used-tables)})]
        (m/distinct-by :id tables))
      [])
    (catch Exception e
      (log/error e "Error getting database tables for context")
      [])))

(defn- python-transform-db-and-table-ids
  "Returns a map with :database-id and :table-ids, or nil if not a Python transform."
  [item]
  (when (and (= (:type item) "transform")
             (= (get-in item [:source :type]) "python"))
    (when-let [source-database (get-in item [:source :source-database])]
      (when-let [source-tables (not-empty (get-in item [:source :source-tables]))]
        {:database-id source-database
         :table-ids (vals source-tables)}))))

(defn- python-transform-tables-for-context
  "Get tables for Python transform formatted for metabot context."
  [{:keys [database-id table-ids]}]
  (try
    (when (and database-id (seq table-ids))
      (when-let [tables (not-empty (table-utils/used-tables-from-ids database-id table-ids))]
        (table-utils/enhanced-database-tables database-id
                                              {:priority-tables tables
                                               :all-tables-limit (count tables)})))
    (catch Exception e
      (log/error e "Error getting Python transform tables for context")
      [])))

(defn- enhance-context-with-schema
  "Enhance context by adding table schema information for native queries, SQL transforms, and Python transforms"
  [context]
  (if-let [user-viewing (get context :user_is_viewing)]
    (let [enhanced-viewing
          (mapv (fn [item]
                  (or
                   ;; Handle native queries and SQL transforms
                   (when-let [query (query-for-sql-parsing item)]
                     (when-let [tables (seq (database-tables-for-context {:query query}))]
                       (assoc item :used_tables tables)))

                   ;; Handle Python transforms
                   (when-let [db-and-table-ids (python-transform-db-and-table-ids item)]
                     (when-let [tables (seq (python-transform-tables-for-context db-and-table-ids))]
                       (assoc item :used_tables tables)))

                   ;; Unknown item: return unchanged
                   item))
                user-viewing)]
      (assoc context :user_is_viewing enhanced-viewing))
    context))

(defn- annotate-transform-source-types
  "Annotate transforms in context with source types if not already present (e.g. for draft transforms not yet saved)"
  [context]
  (if-let [user-viewing (get context :user_is_viewing)]
    (let [annotated-viewing
          (mapv (fn [item]
                  (try
                    (if (and (= (:type item) "transform")
                             (not (:source_type item)))
                      (let [transform (transforms-base.util/normalize-transform item)]
                        (assoc transform
                               :source_type (transforms-base.util/transform-source-type (:source transform))))
                      item)
                    (catch Exception e
                      (log/error e "Error annotating transform source type for metabot context")
                      item)))
                user-viewing)]
      (assoc context :user_is_viewing annotated-viewing))
    context))

(defn- add-backend-capabilities
  "Add backend capabilities to context, merging with any existing capabilities."
  [context]
  (update context :capabilities (fnil into #{}) (backend-metabot-capabilities)))

(defn- add-recent-views
  "Add user's recent views to the context since these have a higher likelihood of being relevant to a user's query.
  Includes the 5 most recent items across cards, datasets, metrics, dashboards, and tables.
  (Excludes collections and documents for now, which aren't searchable by Metabot.)"
  [context]
  (try
    (let [recents (:recents (activity-feed/get-recents api/*current-user-id*
                                                       [:views :selections]
                                                       {:models [:card :dataset :metric :dashboard :table]}))
          processed-recents (mapv (fn [item]
                                    (let [item-type
                                          (case (:model item)
                                            :card "question"
                                            :dataset "model"
                                            (name (:model item)))]
                                      (-> item
                                          (select-keys [:id :name :description])
                                          (assoc :type item-type))))
                                  (take 5 recents))]
      (assoc context :user_recently_viewed processed-recents))
    (catch Exception e
      (log/error e "Error adding recent views to metabot context")
      context)))

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
       annotate-transform-source-types
       add-backend-capabilities
       add-recent-views
       (set-user-time opts))))
