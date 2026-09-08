(ns metabase.query-processor.db
  "Application database queries for the query processor module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module never talks to `toucan2.core` itself."
  (:require
   [java-time.api :as t]
   [metabase.app-db.core :as app-db]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   ^{:clj-kondo/ignore [:discouraged-namespace]}
   [toucan2.core :as t2]))

(def ^:private Temporal
  "A `java.time` instant, date, or date-time."
  [:fn #(instance? java.time.temporal.Temporal %)])

(mu/defn table :- [:maybe :map]
  "The Table with `table-id`, or nil."
  [table-id :- ::lib.schema.id/table]
  (t2/select-one :model/Table :id table-id))

(mu/defn source-card-metadata :- [:maybe :map]
  "The entity id, result metadata, and type of the Card with `card-id`, or nil."
  [card-id :- ::lib.schema.id/card]
  (t2/select-one [:model/Card :entity_id :result_metadata :type :card_schema] :id card-id))

(mu/defn dashcard-series-exists? :- :boolean
  "Whether the Card with `card-id` is a series of the DashboardCard with `dashcard-id`."
  [card-id     :- [:maybe ::lib.schema.id/card]
   dashcard-id :- [:maybe ::lib.schema.id/dashcard]]
  (t2/exists? :model/DashboardCardSeries :card_id card-id :dashboardcard_id dashcard-id))

(mu/defn cache-entry :- :any
  "`row-fn` applied to the results and updated-at of the QueryCache entry for `query-hash`, or nil."
  [row-fn     :- fn?
   query-hash :- bytes?]
  (t2/select-one-fn row-fn [:model/QueryCache :results :updated_at] :query_hash query-hash))

(mu/defn claim-cache-refresh-lease! :- :int
  "Set `refresh_started_at` of the QueryCache entry for `query-hash` to `started-at` if its lease (defaulting to
  `lease-free-sentinel`) is older than `lease-cutoff`, returning the number of rows updated."
  [query-hash          :- bytes?
   lease-free-sentinel :- Temporal
   lease-cutoff        :- Temporal
   started-at          :- Temporal]
  (t2/update! (t2/table-name :model/QueryCache)
              {:query_hash                                         query-hash
               [:coalesce :refresh_started_at lease-free-sentinel] [:< lease-cutoff]}
              {:refresh_started_at started-at}))

(mu/defn delete-cache-entry! :- :int
  "Delete the QueryCache entry for `query-hash`."
  [query-hash :- bytes?]
  (t2/delete! (t2/table-name :model/QueryCache) :query_hash query-hash))

(mu/defn delete-cache-entries-updated-before! :- :int
  "Delete the QueryCache entries last updated at or before `updated-before`."
  [updated-before :- Temporal]
  (t2/delete! (t2/table-name :model/QueryCache) :updated_at [:<= updated-before]))

(mu/defn insert-query-executions! :- :int
  "Insert the QueryExecution `rows`."
  [rows :- [:seqable
            [:map {:closed true}
             [:id                    {:optional true} :any]
             [:hash                  {:optional true} :any]
             [:started_at            {:optional true} :any]
             [:running_time          {:optional true} :any]
             [:result_rows           {:optional true} :any]
             [:native                {:optional true} :any]
             [:context               {:optional true} :any]
             [:error                 {:optional true} :any]
             [:executor_id           {:optional true} :any]
             [:card_id               {:optional true} :any]
             [:dashboard_id          {:optional true} :any]
             [:pulse_id              {:optional true} :any]
             [:database_id           {:optional true} :any]
             [:cache_hit             {:optional true} :any]
             [:action_id             {:optional true} :any]
             [:is_sandboxed          {:optional true} :any]
             [:cache_hash            {:optional true} :any]
             [:embedding_client      {:optional true} :any]
             [:embedding_sdk_version {:optional true} :any]
             [:parameterized         {:optional true} :any]
             [:transform_id          {:optional true} :any]
             [:lens_id               {:optional true} :any]
             [:lens_params           {:optional true} :any]
             [:auth_method           {:optional true} :any]
             [:tenant_id             {:optional true} :any]
             [:is_impersonated       {:optional true} :any]
             [:is_db_routed          {:optional true} :any]
             [:parameters            {:optional true} :any]
             [:embedding_hostname    {:optional true} :any]
             [:embedding_path        {:optional true} :any]
             [:user_agent            {:optional true} :any]
             [:ip_address            {:optional true} :any]
             [:sanitized_user_agent  {:optional true} :any]
             [:embedding_route       {:optional true} :any]
             [:metabase_version      {:optional true} :any]
             [:embedding_client_identifier {:optional true} :any]]]]
  (t2/insert! :model/QueryExecution rows))

(mu/defn set-card-result-metadata! :- :int
  "Set the result metadata of the Card with `card-id` without touching `updated_at`."
  [card-id         :- ::lib.schema.id/card
   result-metadata :- :any]
  (t2/update! :model/Card card-id {:result_metadata result-metadata
                                   :updated_at      :updated_at}))

(mu/defn update-cards-last-used-at! :- :any
  "Move `last_used_at` of each Card in `card-id->timestamp` forward to its timestamp, without touching `updated_at`."
  [card-id->timestamp :- [:map-of ::lib.schema.id/card Temporal]]
  (t2/query {:update [(t2/table-name :model/Card)]
             :where  [:in :id (keys card-id->timestamp)]
             :set    {:last_used_at (into [:case]
                                          (mapcat (fn [[id timestamp]]
                                                    [[:= :id id] [:greatest [:coalesce :last_used_at (t/offset-date-time 0)] timestamp]])
                                                  card-id->timestamp))
                      :updated_at :updated_at}}))

(mu/defn card-database-ids :- [:sequential :map]
  "The `:id`, `:database_id`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids :- [:seqable ::lib.schema.id/card]]
  (t2/select [:model/Card :id :database_id :card_schema] :id [:in card-ids]))

(mu/defn upsert-cache-entry! :- :any
  "Insert or update the QueryCache entry for `query-hash`, setting `:results` to `results` and `:updated_at` to
  `timestamp`, and clearing `:refresh_started_at`. Returns the entry's primary key, which is the hash bytes."
  [query-hash :- bytes?
   timestamp  :- Temporal
   results    :- bytes?]
  (app-db/update-or-insert! :model/QueryCache {:query_hash query-hash}
                            (constantly {:updated_at         timestamp
                                         :results            results
                                         :refresh_started_at nil})))
