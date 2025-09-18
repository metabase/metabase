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

(defn- query-for-sql-parsing
  "Given an item in context, return the query if it is a native query or SQL transform that can have table usage parsed
  from it, otherwise nil."
  [item]
  (when-let [query (case (:type item)
                     "transform" (-> item :source :query)
                     "adhoc" (-> item :query)
                     nil)]
    (when (and (#{:native "native"} (:type query))
               (:database query))
      query)))

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
        ;; Ensure no duplicate tables (by id) are returned, preserve first occurrence order
        (reduce (fn [acc t]
                  (if (some #(= (:id %) (:id t)) acc)
                    acc
                    (conj acc t)))
                []
                tables))
      [])
    (catch Exception e
      (log/error e "Error getting database tables for context")
      [])))

(defn- enhance-context-with-schema
  "Enhance context by adding table schema information for native queries & SQL transforms"
  [context]
  (if-let [user-viewing (get context :user_is_viewing)]
    (let [enhanced-viewing
          (mapv (fn [item]
                  (if-let [query (query-for-sql-parsing item)]
                    (if-let [tables (seq (database-tables-for-context {:query query}))]
                      (assoc item :used_tables tables)
                      item)
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
