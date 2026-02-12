(ns metabase.lib-metric.ast.build
  "Functions for building AST nodes from MetricDefinitions."
  (:require
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.operators :as operators]
   [metabase.lib.aggregation :as lib.aggregation]
   [metabase.lib.filter :as lib.filter]
   [metabase.lib.join :as lib.join]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.query :as lib.query]
   [metabase.lib.util :as lib.util]))

;;; -------------------- Helper Functions --------------------

(defn- ensure-pmbql
  "Ensure query is in pMBQL format. Converts legacy MBQL if needed."
  [metadata-provider mbql-query]
  (lib.query/query metadata-provider mbql-query))

;;; -------------------- Primitive Node Construction --------------------

(defn table-node
  "Create a table node."
  ([id] (table-node id nil))
  ([id name]
   (cond-> {:node/type :ast/table
            :id        id}
     name (assoc :name name))))

(defn column-node
  "Create a column node."
  ([id] (column-node id nil nil))
  ([id name] (column-node id name nil))
  ([id name table-id]
   (cond-> {:node/type :ast/column
            :id        id}
     name     (assoc :name name)
     table-id (assoc :table-id table-id))))

;;; -------------------- Dimension Construction --------------------

(defn dimension-node
  "Create a dimension node from a persisted dimension."
  [{:keys [id name display-name effective-type semantic-type status]}]
  (cond-> {:node/type :ast/dimension
           :id        id}
    name           (assoc :name name)
    display-name   (assoc :display-name display-name)
    effective-type (assoc :effective-type effective-type)
    semantic-type  (assoc :semantic-type semantic-type)
    status         (assoc :status status)))

(defn dimension-mapping-node
  "Create a dimension mapping node from a persisted mapping."
  [{:keys [dimension-id table-id target]}]
  (let [[_field opts field-id] target
        source-field (:source-field opts)]
    {:node/type    :ast/dimension-mapping
     :dimension-id dimension-id
     :table-id     table-id
     :column       (cond-> (column-node field-id nil table-id)
                     source-field (assoc :source-field source-field))}))

;;; -------------------- Dimension Reference Construction --------------------

(defn- normalize-string-keys
  "Recursively normalize string keys to keywords, and string values at the top level
   that represent keywords (like temporal-unit) to keywords."
  [opts]
  (reduce-kv (fn [m k v]
               (let [norm-key (keyword k)
                     norm-val (cond
                                ;; Recursively normalize nested maps
                                (map? v) (normalize-string-keys v)
                                ;; Only convert strings to keywords for specific known fields
                                (and (string? v) (contains? #{:temporal-unit} norm-key)) (keyword v)
                                :else v)]
                 (assoc m norm-key norm-val)))
             {}
             (or opts {})))

(defn dimension-ref->ast-dimension-ref
  "Convert a dimension reference [:dimension opts uuid] to AST dimension-ref node.
   The opts map may contain temporal-unit, binning, etc."
  [[_dimension opts dimension-id]]
  (let [normalized-opts (normalize-string-keys opts)]
    (cond-> {:node/type    :ast/dimension-ref
             :dimension-id dimension-id}
      (seq normalized-opts) (assoc :options normalized-opts))))

;;; -------------------- Filter Construction --------------------

(defn mbql-filter->ast-filter
  "Convert an MBQL filter clause to AST filter node.

   Supported filter types:
   - Comparison: [:= :!= :< :<= :> :>=] -> :filter/comparison
   - Between: [:between] -> :filter/between
   - String: [:contains :starts-with :ends-with :does-not-contain] -> :filter/string
   - Null: [:is-null :not-null :is-empty :not-empty] -> :filter/null
   - Multi-value: [:in :not-in] -> :filter/in
   - Temporal: [:time-interval :relative-time-interval] -> :filter/temporal
   - Compound: [:and :or :not] -> :filter/and :filter/or :filter/not"
  [mbql-clause]
  (when mbql-clause
    (let [[op opts & args] mbql-clause
          ;; Handle both keyword and string operators (API may send strings)
          operator (keyword op)]
      (cond
        ;; Compound filters
        (= :and operator)
        {:node/type :filter/and
         :children  (mapv mbql-filter->ast-filter args)}

        (= :or operator)
        {:node/type :filter/or
         :children  (mapv mbql-filter->ast-filter args)}

        (= :not operator)
        {:node/type :filter/not
         :child     (mbql-filter->ast-filter (first args))}

        ;; Comparison filters
        (operators/comparison? operator)
        (let [[dimension-ref value] args]
          {:node/type :filter/comparison
           :operator  operator
           :dimension (dimension-ref->ast-dimension-ref dimension-ref)
           :value     value})

        ;; Range filters (between, inside)
        (operators/range? operator)
        (case operator
          :between (let [[dimension-ref min-val max-val] args]
                     {:node/type :filter/between
                      :dimension (dimension-ref->ast-dimension-ref dimension-ref)
                      :min       min-val
                      :max       max-val})
          :inside (let [[lat-ref lon-ref north east south west] args]
                    {:node/type :filter/inside
                     :lat-dimension (dimension-ref->ast-dimension-ref lat-ref)
                     :lon-dimension (dimension-ref->ast-dimension-ref lon-ref)
                     :north     north
                     :east      east
                     :south     south
                     :west      west}))

        ;; String filters
        (operators/string-op? operator)
        (let [[dimension-ref value] args]
          {:node/type :filter/string
           :operator  operator
           :dimension (dimension-ref->ast-dimension-ref dimension-ref)
           :value     value
           :options   (select-keys opts [:case-sensitive])})

        ;; Null filters
        (operators/nullary? operator)
        (let [[dimension-ref] args]
          {:node/type :filter/null
           :operator  operator
           :dimension (dimension-ref->ast-dimension-ref dimension-ref)})

        ;; In filters
        (operators/multi-value? operator)
        (let [[dimension-ref & values] args]
          {:node/type :filter/in
           :operator  operator
           :dimension (dimension-ref->ast-dimension-ref dimension-ref)
           :values    (vec values)})

        ;; Temporal filters
        (operators/temporal? operator)
        (let [[dimension-ref value unit] args]
          {:node/type :filter/temporal
           :operator  operator
           :dimension (dimension-ref->ast-dimension-ref dimension-ref)
           :value     value
           :unit      (keyword unit)})

        :else
        (throw (ex-info "Unsupported filter operator" {:operator operator :clause mbql-clause}))))))

(defn mbql-filters->ast-filter
  "Convert a sequence of MBQL filter clauses to a single AST filter node.
   If multiple filters are provided, they are combined with :filter/and."
  [filters]
  (when (seq filters)
    (if (= 1 (count filters))
      (mbql-filter->ast-filter (first filters))
      {:node/type :filter/and
       :children  (mapv mbql-filter->ast-filter filters)})))

;;; -------------------- Aggregation Construction --------------------

(defn- mbql-aggregation->node
  "Convert MBQL aggregation clause to AST aggregation node."
  [mbql-clause]
  (when mbql-clause
    (let [[agg-type _opts & args] mbql-clause]
      (case agg-type
        :count    {:node/type :aggregation/count}
        :sum      {:node/type :aggregation/sum
                   :column    (let [[_field _opts field-id] (first args)]
                                (column-node field-id))}
        :avg      {:node/type :aggregation/avg
                   :column    (let [[_field _opts field-id] (first args)]
                                (column-node field-id))}
        :min      {:node/type :aggregation/min
                   :column    (let [[_field _opts field-id] (first args)]
                                (column-node field-id))}
        :max      {:node/type :aggregation/max
                   :column    (let [[_field _opts field-id] (first args)]
                                (column-node field-id))}
        :distinct {:node/type :aggregation/distinct
                   :column    (let [[_field _opts field-id] (first args)]
                                (column-node field-id))}
        ;; Fall back to raw MBQL for complex aggregations
        {:node/type :aggregation/mbql
         :clause    mbql-clause}))))

;;; -------------------- Source Construction --------------------

(defn- mbql-clause->filter-mbql-node
  "Wrap a raw MBQL filter clause as a passthrough AST node."
  [mbql-clause]
  {:node/type :filter/mbql
   :clause    mbql-clause})

(defn- extract-source-filters
  "Extract filters from pMBQL query and convert to AST filter node.
   Returns nil if no filters, a single filter/mbql node if one filter,
   or a filter/and node containing filter/mbql nodes if multiple."
  [pmbql-query]
  (when-let [filters (lib.filter/filters pmbql-query)]
    (if (= 1 (count filters))
      (mbql-clause->filter-mbql-node (first filters))
      {:node/type :filter/and
       :children  (mapv mbql-clause->filter-mbql-node filters)})))

(defn- extract-source-joins
  "Extract joins from pMBQL query and convert to AST join nodes."
  [pmbql-query]
  (when-let [joins (lib.join/joins pmbql-query -1)]
    (mapv (fn [join]
            {:node/type :ast/join
             :mbql-join join})
          joins)))

(defn- pmbql-query->source-node
  "Parse pMBQL query into source node structure using lib functions."
  [source-type id metadata pmbql-query]
  (let [table-id      (lib.util/source-table-id pmbql-query)
        aggregation   (first (lib.aggregation/aggregations pmbql-query))
        source-filter (extract-source-filters pmbql-query)
        source-joins  (extract-source-joins pmbql-query)]
    (cond-> {:node/type   source-type
             :id          id
             :name        (:name metadata)
             :aggregation (or (mbql-aggregation->node aggregation)
                              {:node/type :aggregation/count})
             :base-table  (table-node table-id)
             :metadata    metadata}
      source-joins  (assoc :joins source-joins)
      source-filter (assoc :filters source-filter))))

;;; -------------------- Main Construction --------------------

(defn- expression-leaf-type
  "Returns :metric or :measure from an expression leaf."
  [expression]
  (when (and (sequential? expression)
             (= 3 (count expression))
             (#{:metric :measure} (first expression)))
    (first expression)))

(defn- expression-leaf-id
  "Returns the source ID from an expression leaf."
  [expression]
  (when (expression-leaf-type expression)
    (nth expression 2)))

(defn- expression-leaf-uuid
  "Returns the :lib/uuid from an expression leaf."
  [expression]
  (when (expression-leaf-type expression)
    (get (second expression) :lib/uuid)))

(defn from-definition
  "Create complete AST from MetricDefinition.
   Converts legacy MBQL to pMBQL before processing.

   Metadata is loaded from the provider using the expression leaf's type and ID.
   Dimensions and dimension-mappings are loaded from the fetched metadata."
  [definition]
  (let [{:keys [expression metadata-provider filters projections]} definition
        leaf-type  (expression-leaf-type expression)
        leaf-id    (expression-leaf-id expression)
        leaf-uuid  (expression-leaf-uuid expression)
        _          (when-not leaf-type
                     (throw (ex-info "Arithmetic metric math expressions are not yet supported in AST builder"
                                     {:expression expression})))
        ;; Load metadata from provider
        source-type (case leaf-type :metric :source/metric :measure :source/measure)
        metadata-type (case leaf-type :metric :metadata/metric :measure :metadata/measure)
        metadata   (first (lib.metadata.protocols/metadatas
                           metadata-provider
                           {:lib/type metadata-type :id #{leaf-id}}))
        ;; Load dimensions/mappings from source metadata
        dimensions         (lib-metric.dimension/get-persisted-dimensions metadata)
        dimension-mappings (lib-metric.dimension/get-persisted-dimension-mappings metadata)
        raw-query          (case leaf-type
                             :metric  (:dataset-query metadata)
                             :measure (:definition metadata))
        pmbql-query        (ensure-pmbql metadata-provider raw-query)
        ;; Extract flat filters for this leaf's UUID
        leaf-filters       (into []
                                 (comp (filter #(= leaf-uuid (:lib/uuid %)))
                                       (map :filter))
                                 (or filters []))
        ;; Extract flat projections for this leaf's type/id
        leaf-projections   (some #(when (and (= leaf-type (:type %)) (= leaf-id (:id %)))
                                    (:projection %))
                                 (or projections []))
        ;; Convert filters and projections to AST nodes
        ast-filter         (when (seq leaf-filters) (mbql-filters->ast-filter leaf-filters))
        ast-group-by       (when (seq leaf-projections) (mapv dimension-ref->ast-dimension-ref leaf-projections))]
    {:node/type         :ast/root
     :source            (pmbql-query->source-node source-type leaf-id metadata pmbql-query)
     :dimensions        (mapv dimension-node (or dimensions []))
     :mappings          (mapv dimension-mapping-node (or dimension-mappings []))
     :filter            ast-filter
     :group-by          (or ast-group-by [])
     :metadata-provider metadata-provider}))

