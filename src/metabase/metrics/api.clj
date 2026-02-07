(ns metabase.metrics.api
  "/api/metric endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-metric.definition :as lib-metric.definition]
   [metabase.lib-metric.metadata.jvm :as lib-metric.metadata.jvm]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.metrics.core :as metrics]
   [metabase.metrics.dimension :as metrics.dimension]
   [metabase.query-processor :as qp]
   [metabase.query-processor.streaming :as qp.streaming]
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

(def ^:private visibility-config
  {:include-trash-collection? false
   :include-archived-items    :exclude
   :permission-level          :read})

(defn- metrics-where-clause []
  [:and
   [:= :type "metric"]
   [:= :archived false]
   (collection/visible-collection-filter-clause :collection_id visibility-config)])

(defn- select-metrics []
  (-> (t2/select [:model/Card :id :name :description :collection_id]
                 {:where    (metrics-where-clause)
                  :order-by [[:name :asc]]})
      (t2/hydrate :collection)))

(api.macros/defendpoint :get "/" :- [:sequential ::Metric]
  "Get a list of metrics.

  Returns metrics (Cards with type='metric') that the current user has read access to,
  filtered by collection visibility permissions."
  []
  (->> (select-metrics)
       (mapv #(select-keys % [:id :name :description :collection_id :collection]))))

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
    [:filters        {:optional true} [:maybe [:sequential ::lib-metric.schema/filter-clause]]]
    [:projections    {:optional true} [:maybe [:sequential ::lib-metric.schema/dimension-reference]]]]
   [:fn {:error/message "Exactly one of source-measure or source-metric must be provided"}
    (fn [{:keys [source-measure source-metric]}]
      (and (or source-measure source-metric)
           (not (and source-measure source-metric))))]])

(mr/def ::DatasetRequest
  "Schema for POST /dataset request body."
  [:map
   [:definition ::Definition]])

(mr/def ::RemappedValueResponse
  "Response schema for dimension remapping endpoint.
   Returns [value] if no remapping, or [value, display-name] if remapped."
  [:or
   [:tuple :any]
   [:tuple :any :string]])

(mr/def ::DatasetResponse
  "Schema for POST /dataset response."
  [:map
   [:status    [:enum :completed "completed"]]
   [:data      [:map
                [:cols [:sequential :any]]
                [:rows [:sequential :any]]]]
   [:row_count ms/IntGreaterThanOrEqualToZero]])

(defn- fetch-source-metadata
  "Fetch source metadata with proper casing and permission check.
   Returns [source-type source-id metadata].
   Uses model types for permission checks, then fetches metadata with property-cased keys."
  [{:keys [source-metric source-measure]}]
  (if source-metric
    (do
      ;; Permission check uses model type
      (api/read-check (t2/select-one :model/Card :id source-metric :type "metric"))
      ;; Fetch metadata with property-cased keys for definition building
      (let [metadata (t2/select-one :metadata/metric :id source-metric)]
        [:source/metric source-metric metadata]))
    (do
      ;; Permission check uses model type
      (api/read-check (t2/select-one :model/Measure :id source-measure))
      ;; Fetch metadata with property-cased keys for definition building
      (let [metadata (t2/select-one :metadata/measure :id source-measure)]
        [:source/measure source-measure metadata]))))

(defn- from-api-definition
  "Create a MetricDefinition from API definition parameters.

   The definition map should contain:
   - :source-metric OR :source-measure (exactly one)
   - :filters (optional, vector of MBQL filter clauses)
   - :projections (optional, vector of dimension references)

   Note: dimensions and dimension-mappings are loaded lazily via metadata-provider
   when building the AST."
  [provider definition]
  (let [{:keys [filters projections]} definition
        [source-type source-id metadata] (fetch-source-metadata definition)]
    {:lib/type          :metric/definition
     :source            {:type     source-type
                         :id       source-id
                         :metadata metadata}
     :filters           (or filters [])
     :projections       (or projections [])
     :metadata-provider provider}))

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
  (let [provider   (lib-metric.metadata.jvm/metadata-provider)
        metric-def (from-api-definition provider definition)
        query      (lib-metric.definition/->mbql-query metric-def {:limit 10000})]
    (qp.streaming/streaming-response [rff :api]
      (qp/process-query (qp/userland-query query) rff))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Dimension Value Endpoints                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(api.macros/defendpoint :get "/:id/dimension/:dimension-key/values"
  :- ms/FieldValuesResult
  "Fetch values for a dimension of a metric.

   Returns field values in the same format as the field values API:
   - values: list of [value] or [value, display-name] tuples
   - field_id: the underlying field ID
   - has_more_values: boolean indicating if there are more values"
  [{:keys [id dimension-key]} :- [:map
                                  [:id            ms/PositiveInt]
                                  [:dimension-key ms/UUIDString]]]
  (let [metric (hydrated-metric id)]
    (metrics.dimension/dimension-values
     (:dimensions metric)
     (:dimension_mappings metric)
     dimension-key)))

(api.macros/defendpoint :get "/:id/dimension/:dimension-key/search"
  :- [:sequential [:vector :string]]
  "Search for values of a dimension that contain the query string.

   Returns field values matching the search query in the same format as the field values API."
  [{:keys [id dimension-key]} :- [:map
                                  [:id            ms/PositiveInt]
                                  [:dimension-key ms/UUIDString]]
   {:keys [query]}            :- [:map [:query ms/NonBlankString]]]
  (let [metric (hydrated-metric id)]
    (metrics.dimension/dimension-search-values
     (:dimensions metric)
     (:dimension_mappings metric)
     dimension-key
     query)))

(api.macros/defendpoint :get "/:id/dimension/:dimension-key/remapping"
  :- ::RemappedValueResponse
  "Fetch remapped value for a specific dimension value.

   Returns a pair [value, display-name] if remapping exists, or [value] otherwise."
  [{:keys [id dimension-key]} :- [:map
                                  [:id            ms/PositiveInt]
                                  [:dimension-key ms/UUIDString]]
   {:keys [value]}             :- [:map [:value :string]]]
  (let [metric (hydrated-metric id)]
    (metrics.dimension/dimension-remapped-value
     (:dimensions metric)
     (:dimension_mappings metric)
     dimension-key
     value)))
