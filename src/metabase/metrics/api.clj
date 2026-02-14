(ns metabase.metrics.api
  "/api/metric endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.lib-metric.core :as lib-metric]
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
  (let [metric (hydrated-metric id)]
    (assoc metric :result_column_name (metrics/aggregation-column-name (:database_id metric) (:dataset_query metric)))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                          POST /api/metric/dataset                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

;;; ------------------------------------------------- Expression Helpers --------------------------------------------------

(defn- collect-expression-uuids
  "Walk an expression tree and collect all :lib/uuid values from leaf nodes."
  [expr]
  (cond
    ;; Leaf: [:metric {:lib/uuid ...} id] or [:measure {:lib/uuid ...} id]
    (and (sequential? expr)
         (= 3 (count expr))
         (#{:metric :measure} (first expr)))
    [(get (second expr) :lib/uuid)]

    ;; Arithmetic: [op opts & exprs]
    (and (sequential? expr)
         (>= (count expr) 4)
         (#{:+ :- :* :/} (first expr)))
    (mapcat collect-expression-uuids (drop 2 expr))

    :else []))

(defn- collect-expression-leaves
  "Walk an expression tree and collect [type id] pairs from leaf nodes."
  [expr]
  (cond
    ;; Leaf
    (and (sequential? expr)
         (= 3 (count expr))
         (#{:metric :measure} (first expr)))
    [[(first expr) (nth expr 2)]]

    ;; Arithmetic
    (and (sequential? expr)
         (>= (count expr) 4)
         (#{:+ :- :* :/} (first expr)))
    (mapcat collect-expression-leaves (drop 2 expr))

    :else []))

(defn- expression-leaf?
  "Returns true if the expression is a single leaf (metric or measure ref), not arithmetic."
  [expr]
  (and (sequential? expr)
       (= 3 (count expr))
       (#{:metric :measure} (first expr))))

(mr/def ::Definition
  "Schema for the definition object within a dataset request.
   Uses expression-based contract for metric math support."
  [:and
   [:map
    [:expression  ::lib-metric.schema/metric-math-expression]
    [:filters     {:optional true} [:maybe ::lib-metric.schema/instance-filters]]
    [:projections {:optional true} [:maybe ::lib-metric.schema/typed-projections]]]
   [:fn {:error/message "All :lib/uuid values in expression must be unique"}
    (fn [{:keys [expression]}]
      (let [uuids (collect-expression-uuids expression)]
        (= (count uuids) (count (set uuids)))))]
   [:fn {:error/message "Filter :lib/uuid values must reference UUIDs from expression"}
    (fn [{:keys [expression filters]}]
      (let [expr-uuids (set (collect-expression-uuids expression))]
        (every? #(contains? expr-uuids (:lib/uuid %)) (or filters []))))]
   [:fn {:error/message "Projection type/id pairs must correspond to expression leaves"}
    (fn [{:keys [expression projections]}]
      (let [leaves (set (collect-expression-leaves expression))]
        (every? #(contains? leaves [(:type %) (:id %)]) (or projections []))))]])

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

(defn- check-expression-permissions!
  "Walk the expression tree and verify read permissions for all referenced entities."
  [expression]
  (cond
    ;; Leaf: [:metric {:lib/uuid ...} id] or [:measure {:lib/uuid ...} id]
    (expression-leaf? expression)
    (let [[source-type _opts source-id] expression]
      (case source-type
        :metric  (api/read-check (t2/select-one :model/Card :id source-id :type "metric"))
        :measure (api/read-check (t2/select-one :model/Measure :id source-id))))

    ;; Arithmetic: [op opts & exprs]
    (and (sequential? expression)
         (>= (count expression) 4)
         (#{:+ :- :* :/} (first expression)))
    (doseq [sub-expr (drop 2 expression)]
      (check-expression-permissions! sub-expr))))

(defn- from-api-definition
  "Create a MetricDefinition from API definition parameters.

   The definition map is passed through directly as the internal MetricDefinition,
   since the API format and internal format now match.

   Permission checks are performed on all referenced entities in the expression."
  [provider definition]
  (let [{:keys [expression filters projections]} definition]
    ;; Permission check all expression leaves
    (check-expression-permissions! expression)
    ;; Build MetricDefinition — format matches directly
    {:lib/type          :metric/definition
     :expression        expression
     :filters           (or filters [])
     :projections       (or projections [])
     :metadata-provider provider}))

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
  (let [query (-> (lib-metric/metadata-provider)
                  (from-api-definition definition)
                  (lib-metric/->mbql-query {:limit 10000}))]
    (qp.streaming/streaming-response [rff :api]
      (qp/process-query (qp/userland-query query) rff))))

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
  (let [query   (-> (lib-metric/metadata-provider)
                    (from-api-definition definition)
                    (lib-metric/->mbql-query {:limit 100}))
        result  (qp/process-query (qp/userland-query query))
        col     (first (get-in result [:data :cols]))
        values  (mapv first (get-in result [:data :rows]))]
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
