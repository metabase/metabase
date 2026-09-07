(ns metabase.query-processor.db
  "Application database queries for the query processor module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [java-time.api :as t]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(defn table
  "The Table with `table-id`, or nil."
  [table-id]
  (t2/select-one :model/Table :id table-id))

(defn source-card-metadata
  "The entity id, result metadata, and type of the Card with `card-id`, or nil."
  [card-id]
  (t2/select-one [:model/Card :entity_id :result_metadata :type :card_schema] :id card-id))

(defn dashcard-series-exists?
  "Whether the Card with `card-id` is a series of the DashboardCard with `dashcard-id`."
  [card-id dashcard-id]
  (t2/exists? :model/DashboardCardSeries :card_id card-id :dashboardcard_id dashcard-id))

(defn cache-entry
  "`row-fn` applied to the results and updated-at of the QueryCache entry for `query-hash`, or nil."
  [row-fn query-hash]
  (t2/select-one-fn row-fn [:model/QueryCache :results :updated_at] :query_hash query-hash))

(defn claim-cache-refresh-lease!
  "Set `refresh_started_at` of the QueryCache entry for `query-hash` to `started-at` if its lease (defaulting to
  `lease-free-sentinel`) is older than `lease-cutoff`, returning the number of rows updated."
  [query-hash lease-free-sentinel lease-cutoff started-at]
  (t2/update! (t2/table-name :model/QueryCache)
              {:query_hash                                         query-hash
               [:coalesce :refresh_started_at lease-free-sentinel] [:< lease-cutoff]}
              {:refresh_started_at started-at}))

(defn delete-cache-entry!
  "Delete the QueryCache entry for `query-hash`."
  [query-hash]
  (t2/delete! (t2/table-name :model/QueryCache) :query_hash query-hash))

(defn delete-cache-entries-updated-before!
  "Delete the QueryCache entries last updated at or before `updated-before`."
  [updated-before]
  (t2/delete! (t2/table-name :model/QueryCache) :updated_at [:<= updated-before]))

(defn insert-query-executions!
  "Insert the QueryExecution `rows`."
  [rows]
  (t2/insert! :model/QueryExecution rows))

(defn set-card-result-metadata!
  "Set the result metadata of the Card with `card-id` without touching `updated_at`."
  [card-id result-metadata]
  (t2/update! :model/Card card-id {:result_metadata result-metadata
                                   :updated_at      :updated_at}))

(defn update-cards-last-used-at!
  "Move `last_used_at` of each Card in `card-id->timestamp` forward to its timestamp, without touching `updated_at`."
  [card-id->timestamp]
  (t2/query {:update [(t2/table-name :model/Card)]
             :where  [:in :id (keys card-id->timestamp)]
             :set    {:last_used_at (into [:case]
                                          (mapcat (fn [[id timestamp]]
                                                    [[:= :id id] [:greatest [:coalesce :last_used_at (t/offset-date-time 0)] timestamp]])
                                                  card-id->timestamp))
                      :updated_at :updated_at}}))

(defn card-database-ids
  "The `:id`, `:database_id`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :database_id :card_schema] :id [:in card-ids]))
