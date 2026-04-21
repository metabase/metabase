(ns metabase.metrics.api
  "/api/metric endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-metric.core :as lib-metric]
   [metabase.lib-metric.schema :as lib-metric.schema]
   [metabase.metrics.core :as metrics]
   [metabase.metrics.permissions :as metrics.perms]
   [metabase.query-processor.core :as qp]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.streaming :as qp.streaming]
   [metabase.request.core :as request]
   [metabase.server.core :as server]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

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
    [:dimensions           {:optional true} [:maybe [:sequential :map]]]
    [:dimension_mappings   {:optional true} [:maybe [:sequential :map]]]
    [:dataset_query        {:optional true} :map]
    [:database_id          {:optional true} [:maybe ms/PositiveInt]]
    [:result_column_name   {:optional true} [:maybe :string]]]])

(def ^:private visibility-config
  {:include-trash-collection? false
   :include-archived-items    :exclude
   :permission-level          :read})

(defn- metrics-where-clause []
  [:and
   [:= :type "metric"]
   [:= :archived false]
   (collection/visible-collection-filter-clause :collection_id visibility-config)])

(defn- count-metrics []
  (t2/count :model/Card {:where (metrics-where-clause)}))

(defn- select-metrics [limit offset]
  (-> (t2/select [:model/Card :id :name :description :collection_id]
                 {:where    (metrics-where-clause)
                  :order-by [[:name :asc]]
                  :limit    limit
                  :offset   offset})
      (t2/hydrate :collection)))

(api.macros/defendpoint :get "/"
  :- [:map
      [:total  ms/IntGreaterThanOrEqualToZero]
      [:limit  ms/PositiveInt]
      [:offset ms/IntGreaterThanOrEqualToZero]
      [:data   [:sequential ::Metric]]]
  "Get a list of metrics.

  Returns metrics (Cards with type='metric') that the current user has read access to,
  filtered by collection visibility permissions."
  []
  (let [limit   (or (request/limit) 500)
        offset  (or (request/offset) 0)
        total   (count-metrics)
        metrics (->> (select-metrics limit offset)
                     (mapv #(select-keys % [:id :name :description :collection_id :collection])))]
    {:total  total
     :limit  limit
     :offset offset
     :data   metrics}))

(mu/defn- hydrated-metric [id :- ms/PositiveInt]
  (api/read-check (t2/select-one :model/Card :id id :type "metric"))
  (metrics/sync-dimensions! :metadata/metric id)
  (-> (t2/select-one :model/Card :id id :type "metric")
      metrics.perms/filter-dimensions-for-user))

(defn- score-dimensions
  "Sort dimensions by interestingness and optionally filter by cutoff and/or
   limit to top N.

   Uses persisted `:dimension_interestingness` hydrated from the source Field.
   Dimensions without a persisted score default to `1.0` so they remain visible."
  [entity cutoff limit]
  (let [dims (:dimensions entity)]
    (assoc entity :dimensions
           (cond->> dims
             true   (mapv #(assoc % :interestingness-score (or (:dimension_interestingness %) 1.0)))
             true   (sort-by :interestingness-score >)
             true   vec
             cutoff (filterv #(>= (:interestingness-score %) cutoff))
             limit  (into [] (take limit))))))

(api.macros/defendpoint :get "/:id" :- ::MetricWithDimensions
  "Fetch a `Metric` with ID.

  Returns the metric with hydrated dimensions and dimension mappings.
  Dimensions are scored by interestingness and sorted highest-first.
  Pass `interestingness-cutoff` (0.0-1.0) to filter out low-scoring dimensions.
  Pass `dimension-limit` to return only the top N most interesting dimensions."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [interestingness-cutoff dimension-limit]}
   :- [:map
       [:interestingness-cutoff {:optional true} [:maybe :double]]
       [:dimension-limit        {:optional true} [:maybe ms/PositiveInt]]]]
  (let [metric (hydrated-metric id)]
    (-> metric
        (score-dimensions interestingness-cutoff dimension-limit)
        (assoc :result_column_name (metrics/aggregation-column-name (:database_id metric) (:dataset_query metric))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          POST /api/metric/dataset                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------- Expression Helpers --------------------------------------------------

(defn- collect-expression-uuids
  "Collect all :lib/uuid values from leaf nodes in an expression tree."
  [expr]
  (mapv lib-metric/expression-leaf-uuid (lib-metric/expression-leaves expr)))

(defn- collect-expression-leaves
  "Collect [type id] pairs from leaf nodes in an expression tree."
  [expr]
  (mapv (juxt lib-metric/expression-leaf-type lib-metric/expression-leaf-id)
        (lib-metric/expression-leaves expr)))

(mr/def ::Definition
  "Schema for the definition object within a dataset request.
   Uses expression-based contract for metric math support."
  [:and
   [:map
    [:expression  ::lib-metric.schema/metric-math-expression]
    [:filters     {:optional true} [:maybe ::lib-metric.schema/instance-filters]]
    [:projections {:optional true} [:maybe ::lib-metric.schema/typed-projections]]]
   [:fn {:error/message "Expression must contain at least one metric or measure"}
    (fn [{:keys [expression]}]
      (seq (collect-expression-leaves expression)))]
   [:fn {:error/message "All :lib/uuid values in expression must be unique"}
    (fn [{:keys [expression]}]
      (let [uuids (collect-expression-uuids expression)]
        (= (count uuids) (count (set uuids)))))]
   [:fn {:error/message "Filter :lib/uuid values must reference UUIDs from expression"}
    (fn [{:keys [expression filters]}]
      (let [expr-uuids (set (collect-expression-uuids expression))]
        (every? #(contains? expr-uuids (:lib/uuid %)) (or filters []))))]
   [:fn {:error/message "Projection :lib/uuid values must reference UUIDs from expression"}
    (fn [{:keys [expression projections]}]
      (let [expr-uuids (set (collect-expression-uuids expression))]
        (every? #(contains? expr-uuids (:lib/uuid %)) (or projections []))))]])

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

(defn- check-expression-permissions
  "Collect all metric/measure leaves from the expression and verify query permissions for each."
  [expression]
  (doseq [[source-type source-id] (collect-expression-leaves expression)]
    (case source-type
      :metric  (api/query-check (t2/select-one :model/Card :id source-id :type "metric"))
      :measure (api/query-check (t2/select-one :model/Measure :id source-id)))))

(defn- from-api-definition
  "Create a MetricDefinition from API definition parameters.

   The definition map is passed through directly as the internal MetricDefinition,
   since the API format and internal format now match.

   Permission checks are performed on all referenced entities in the expression."
  [provider definition]
  (let [{:keys [expression filters projections]} definition]
    ;; Permission check all expression leaves
    (check-expression-permissions expression)
    ;; Build MetricDefinition — format matches directly
    {:lib/type          :metric/definition
     :expression        expression
     :filters           (or filters [])
     :projections       (or projections [])
     :metadata-provider provider}))

(defn- execute-leaf-queries
  "Execute all leaf queries in parallel, collecting results eagerly.
   Must be called OUTSIDE streaming context to avoid JSON writer conflicts.
   Returns {uuid -> qp-result}."
  [leaves]
  (let [uuid->future (into {}
                           (map (fn [[uuid leaf-plan]]
                                  [uuid (future (qp/process-query (qp/userland-query (:leaf/mbql leaf-plan))))]))
                           leaves)]
    (into {}
          (map (fn [[uuid f]] [uuid @f]))
          uuid->future)))

(defn- stream-arithmetic-results
  "Join leaf results and stream the computed output through the QP reduce pipeline.
   Called INSIDE streaming context with the rff."
  [{:keys [plan/expression plan/breakout-count]} uuid->result rff]
  (let [{:keys [cols rows]} (lib-metric/join-and-compute expression uuid->result breakout-count)
        reducible (reify clojure.lang.IReduceInit
                    (reduce [_ rf init]
                      (reduce rf init rows)))]
    (qp.pipeline/*reduce* rff {:cols cols} reducible)))

(api.macros/defendpoint :post "/dataset"
  :- (server/streaming-response-schema ::DatasetResponse)
  "Execute a metric or measure-based query and stream the results.

   Request body requires a `definition` object containing:
   - expression: A metric math expression tree (leaf reference or arithmetic)
     Examples: [:metric {:lib/uuid \"a\"} 42], [:- {} [:metric {:lib/uuid \"a\"} 1] [:metric {:lib/uuid \"b\"} 2]]
   - filters (optional): Per-instance filters keyed by :lib/uuid from the expression
   - projections (optional): Typed projections keyed by source type and ID"
  [_route-params
   _query-params
   {:keys [definition]} :- ::DatasetRequest]
  (let [definition (from-api-definition (lib-metric/metadata-provider) definition)
        plan       (lib-metric/->query-plan definition {:limit 10000})]
    (if (= :leaf (:plan/type plan))
      (qp.streaming/streaming-response [rff :api]
        (qp/process-query (qp/userland-query (:plan/mbql plan)) rff))
      ;; Arithmetic: execute leaf queries BEFORE streaming to avoid JSON writer conflicts
      (let [uuid->result (execute-leaf-queries (:plan/leaves plan))]
        (qp.streaming/streaming-response [rff :api]
          (stream-arithmetic-results plan uuid->result rff))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                       Dimension Value Endpoints                                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(mr/def ::BreakoutValuesResponse
  [:map
   [:values [:sequential :any]]
   [:col    :map]])

(api.macros/defendpoint :post "/breakout-values" :- ::BreakoutValuesResponse
  "Fetch distinct breakout dimension values for a metric or measure definition.
   Accepts the same definition format as POST /dataset.
   Returns extracted values and column metadata for the breakout dimension."
  [_route-params
   _query-params
   {:keys [definition]} :- ::DatasetRequest]
  (let [definition (from-api-definition (lib-metric/metadata-provider) definition)
        plan       (lib-metric/->query-plan definition {:limit 100 :values-only true})
        result     (qp/process-query (qp/userland-query (:plan/mbql plan)))
        col        (first (get-in result [:data :cols]))
        values     (mapv first (get-in result [:data :rows]))]
    {:values values
     :col    (or col {})}))

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
    (metrics/dimension-values
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
    (metrics/dimension-search-values
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
    (metrics/dimension-remapped-value
     (:dimensions metric)
     (:dimension_mappings metric)
     dimension-key
     value)))
