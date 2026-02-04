(ns metabase.metrics.api
  "/api/metric endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.request.core :as request]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mr/def ::Metric
  "Schema for a Metric in list responses (without hydrated dimensions)."
  [:map
   [:id            ms/PositiveInt]
   [:name          :string]
   [:description   [:maybe :string]]
   [:collection_id [:maybe ms/PositiveInt]]
   [:collection    {:optional true} [:maybe [:map
                                             [:id [:maybe ms/PositiveInt]]
                                             [:name :string]]]]])

(mr/def ::MetricWithDimensions
  "Schema for a Metric with hydrated dimensions (returned from GET /:id)."
  [:merge
   ::Metric
   [:map
    [:dimensions         {:optional true} [:maybe [:sequential :map]]]
    [:dimension_mappings {:optional true} [:maybe [:sequential :map]]]
    [:dataset_query      {:optional true} :map]
    [:database_id        {:optional true} [:maybe ms/PositiveInt]]]])

(mr/def ::MetricsResponse
  [:map
   [:total  ms/IntGreaterThanOrEqualToZero]
   [:limit  ms/PositiveInt]
   [:offset ms/IntGreaterThanOrEqualToZero]
   [:data   [:sequential ::Metric]]])

(def ^:private default-metrics-limit 500)

(def ^:private visibility-config
  {:include-trash-collection? false
   :include-archived-items    :exclude
   :permission-level          :read})

(defn- metrics-where-clause []
  [:and
   [:= :type "metric"]
   [:= :archived false]
   (collection/visible-collection-filter-clause :collection_id visibility-config)])

(defn- select-metrics [limit offset]
  (-> (t2/select [:model/Card :id :name :description :collection_id]
                 {:where    (metrics-where-clause)
                  :order-by [[:name :asc]]
                  :limit    limit
                  :offset   offset})
      (t2/hydrate :collection)))

(defn- count-metrics []
  (t2/count :model/Card {:where (metrics-where-clause)}))

(api.macros/defendpoint :get "/" :- ::MetricsResponse
  "Get a paginated list of metrics.

  Returns metrics (Cards with type='metric') that the current user has read access to,
  filtered by collection visibility permissions.

  Pagination parameters:
  - `limit`: Maximum number of metrics to return (default: 500)
  - `offset`: Number of metrics to skip (default: 0)"
  []
  (let [limit  (or (request/limit) default-metrics-limit)
        offset (or (request/offset) 0)
        total  (count-metrics)
        data   (->> (select-metrics limit offset)
                    (mapv #(select-keys % [:id :name :description :collection_id :collection])))]
    {:total  total
     :limit  limit
     :offset offset
     :data   data}))

(defn- hydrate-dimensions
  "Hydrate dimensions onto a metric by computing from visible-columns and reconciling with persisted."
  [metric]
  (let [database-id       (:database_id metric)
        mp                (lib-be/application-database-metadata-provider database-id)
        metric-with-type  (assoc metric :lib/type :metadata/metric)]
    (lib-metric/hydrate-dimensions mp metric-with-type)))

(mu/defn- hydrated-metric [id :- ms/PositiveInt]
  (-> (api/read-check (t2/select-one :model/Card :id id :type "metric"))
      (t2/hydrate :collection)
      hydrate-dimensions))

(api.macros/defendpoint :get "/:id" :- ::MetricWithDimensions
  "Fetch a `Metric` with ID.

  Returns the metric with hydrated dimensions and dimension mappings."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (hydrated-metric id))
