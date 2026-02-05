(ns metabase.metrics.api
  "/api/metric endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.metrics.core :as metrics]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.server.core :as server]
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

(mu/defn- hydrated-metric [id :- ms/PositiveInt]
  (api/read-check (t2/select-one :model/Card :id id :type "metric"))
  (metrics/sync-dimensions! :metadata/metric id)
  (t2/select-one :model/Card :id id :type "metric"))

(api.macros/defendpoint :get "/:id" :- ::MetricWithDimensions
  "Fetch a `Metric` with ID.

  Returns the metric with hydrated dimensions and dimension mappings."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (hydrated-metric id))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          POST /api/metric/dataset                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(mr/def ::Definition
  "Schema for the definition object within a dataset request."
  [:and
   [:map
    [:source-measure {:optional true} [:maybe ms/PositiveInt]]
    [:source-metric  {:optional true} [:maybe ms/PositiveInt]]
    [:filters        {:optional true} [:maybe [:sequential :any]]]
    [:projections    {:optional true} [:maybe [:sequential :any]]]]
   [:fn {:error/message "Exactly one of source-measure or source-metric must be provided"}
    (fn [{:keys [source-measure source-metric]}]
      (and (or source-measure source-metric)
           (not (and source-measure source-metric))))]])

(mr/def ::DatasetRequest
  "Schema for POST /dataset request body."
  [:map
   [:definition ::Definition]])

(mr/def ::DatasetResponse
  "Schema for POST /dataset response."
  [:map
   [:status    [:enum :completed "completed"]]
   [:data      [:map
                [:cols [:sequential :any]]
                [:rows [:sequential :any]]]]
   [:row_count ms/IntGreaterThanOrEqualToZero]])

(api.macros/defendpoint :post "/dataset"
  :- (server/streaming-response-schema ::DatasetResponse)
  "Execute a metric or measure-based query and stream the results.

   Request body requires a `definition` object containing exactly one of:
   - source-measure: ID of a Measure to use as the source
   - source-metric: ID of a Metric (Card with type='metric') to use as the source

   Optional parameters within definition:
   - filters: Array of filter clauses
   - projections: Array of projection clauses"
  [_route-params
   _query-params
   {:keys [definition]} :- ::DatasetRequest]
  (let [{:keys [source-measure source-metric]} definition]
    (if source-metric
      (api/read-check (t2/select-one :model/Card :id source-metric :type "metric"))
      (api/read-check (t2/select-one :model/Measure :id source-measure)))
    (qp.streaming/streaming-response [rff :api]
      (qp.pipeline/*reduce* rff {:cols []} []))))
