(ns metabase.lib-metric.ast.build
  "Functions for building AST nodes from MetricDefinitions."
  (:require
   [metabase.lib-metric.dimension :as lib-metric.dimension]
   [metabase.lib-metric.operators :as operators]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.lib.util :as lib.util]
   [metabase.util.performance :as perf]))

;;; -------------------- Helper Functions --------------------

(defn- ensure-mbql5
  "Ensure query is in MBQL 5 format. Converts legacy MBQL if needed."
  [metadata-provider mbql-query]
  (lib/query metadata-provider mbql-query))

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
        source-field (:source-field opts)
        base-type    (:base-type opts)]
    {:node/type    :ast/dimension-mapping
     :dimension-id dimension-id
     :table-id     table-id
     :column       (cond-> (column-node field-id nil table-id)
                     source-field (assoc :source-field source-field)
                     base-type    (assoc :base-type base-type))}))

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
                                (and (string? v) (contains? #{:temporal-unit :strategy} norm-key)) (keyword v)
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

;;; -------------------- Dimension Expression Detection --------------------

(defn- expression-wrapped-dimension?
  "Returns true if clause is a temporal extraction expression wrapping a dimension ref."
  [clause]
  (and (sequential? clause)
       (operators/temporal-extraction? (first clause))))

(defn- dimension-ref-or-expression
  "Convert a dimension ref or expression-wrapped dimension ref to an AST node.
   If the clause is a temporal extraction expression, builds a :ast/dimension-expression node.
   Otherwise delegates to dimension-ref->ast-dimension-ref."
  [clause]
  (if (expression-wrapped-dimension? clause)
    (let [[expression-op _opts inner-dim & extra-args] clause]
      (cond-> {:node/type     :ast/dimension-expression
               :expression-op expression-op
               :dimension     (dimension-ref->ast-dimension-ref inner-dim)}
        (seq extra-args) (assoc :args (vec extra-args))))
    (dimension-ref->ast-dimension-ref clause)))

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
          _                   (when-not (keyword? op)
                                (throw (ex-info (str "Expected keyword operator in MBQL filter clause, got: " (pr-str op))
                                                {:op op :clause mbql-clause})))
          operator            op]
      (cond
        ;; Compound filters
        (= :and operator)
        {:node/type :filter/and
         :children  (perf/mapv mbql-filter->ast-filter args)}

        (= :or operator)
        {:node/type :filter/or
         :children  (perf/mapv mbql-filter->ast-filter args)}

        (= :not operator)
        {:node/type :filter/not
         :child     (mbql-filter->ast-filter (first args))}

        ;; Comparison filters
        (operators/comparison? operator)
        (let [[dimension-ref & values] args]
          {:node/type :filter/comparison
           :operator  operator
           :dimension (dimension-ref-or-expression dimension-ref)
           :values    (vec values)})

        ;; Range filters (between, inside)
        (operators/range? operator)
        (case operator
          :between (let [[dimension-ref min-val max-val] args]
                     {:node/type :filter/between
                      :dimension (dimension-ref-or-expression dimension-ref)
                      :min       min-val
                      :max       max-val})
          :inside (let [[lat-ref lon-ref north east south west] args]
                    {:node/type :filter/inside
                     :lat-dimension (dimension-ref-or-expression lat-ref)
                     :lon-dimension (dimension-ref-or-expression lon-ref)
                     :north     north
                     :east      east
                     :south     south
                     :west      west}))

        ;; String filters
        (operators/string-op? operator)
        (let [[dimension-ref value] args]
          {:node/type :filter/string
           :operator  operator
           :dimension (dimension-ref-or-expression dimension-ref)
           :value     value
           :options   (perf/select-keys opts [:case-sensitive])})

        ;; Null filters
        (operators/nullary? operator)
        (let [[dimension-ref] args]
          {:node/type :filter/null
           :operator  operator
           :dimension (dimension-ref-or-expression dimension-ref)})

        ;; In filters
        (operators/multi-value? operator)
        (let [[dimension-ref & values] args]
          {:node/type :filter/in
           :operator  operator
           :dimension (dimension-ref-or-expression dimension-ref)
           :values    (vec values)})

        ;; Segment filters — passthrough, resolved by the query processor.
        (= :segment operator)
        {:node/type :filter/mbql
         :clause    mbql-clause}

        ;; Temporal filters
        (operators/temporal? operator)
        (let [[dimension-ref value unit pos-offset-value pos-offset-unit] args
              offset-value (or pos-offset-value (:offset-value opts))
              offset-unit  (or pos-offset-unit (:offset-unit opts))]
          (cond-> {:node/type :filter/temporal
                   :operator  operator
                   :dimension (dimension-ref-or-expression dimension-ref)
                   :value     value
                   :unit      (keyword unit)}
            offset-value (assoc :offset-value offset-value
                                :offset-unit (keyword offset-unit))))

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
       :children  (perf/mapv mbql-filter->ast-filter filters)})))

;;; -------------------- Aggregation Construction --------------------

(defn- simple-field-ref?
  "Returns true if the argument is a simple [:field opts id] reference."
  [arg]
  (and (sequential? arg)
       (= :field (first arg))
       (pos-int? (nth arg 2 nil))))

(def ^:private mbql-agg-hierarchy
  "Hierarchy for dispatching on MBQL aggregation keywords."
  (-> (make-hierarchy)
      (derive :sum      :column-agg)
      (derive :avg      :column-agg)
      (derive :min      :column-agg)
      (derive :max      :column-agg)
      (derive :distinct :column-agg)))

(defmulti ^:private mbql-aggregation->node*
  "Convert MBQL aggregation clause to AST aggregation node.
   Dispatches on the aggregation keyword."
  {:arglists '([agg-type mbql-clause])}
  (fn [agg-type _mbql-clause] agg-type)
  :hierarchy #'mbql-agg-hierarchy)

(defmethod mbql-aggregation->node* :count
  [_ mbql-clause]
  (let [[_agg-type _opts & args] mbql-clause
        first-arg (first args)]
    (if (nil? first-arg)
      {:node/type :aggregation/count}
      (if (simple-field-ref? first-arg)
        {:node/type :aggregation/count
         :column    (let [[_field _opts field-id] first-arg]
                      (column-node field-id))}
        {:node/type :aggregation/mbql
         :clause    mbql-clause}))))

(defmethod mbql-aggregation->node* :column-agg
  [agg-type mbql-clause]
  (let [[_agg-type _opts & args] mbql-clause
        first-arg (first args)]
    (if (simple-field-ref? first-arg)
      {:node/type (keyword "aggregation" (name agg-type))
       :column    (let [[_field _opts field-id] first-arg]
                    (column-node field-id))}
      {:node/type :aggregation/mbql
       :clause    mbql-clause})))

(defmethod mbql-aggregation->node* :default
  [_ mbql-clause]
  {:node/type :aggregation/mbql
   :clause    mbql-clause})

(defn- mbql-aggregation->node
  "Convert MBQL aggregation clause to AST aggregation node.
   Simple aggregations over field references (e.g. sum(price)) produce typed nodes.
   Complex aggregations (e.g. avg(case(...))) fall through to :aggregation/mbql."
  [mbql-clause]
  (when mbql-clause
    (let [[agg-type] mbql-clause]
      (mbql-aggregation->node* agg-type mbql-clause))))

;;; -------------------- Source Construction --------------------

(defn- mbql-clause->filter-mbql-node
  "Wrap a raw MBQL filter clause as a passthrough AST node."
  [mbql-clause]
  {:node/type :filter/mbql
   :clause    mbql-clause})

(defn- extract-source-filters
  "Extract filters from MBQL 5 query and convert to AST filter node.
   Returns nil if no filters, a single filter/mbql node if one filter,
   or a filter/and node containing filter/mbql nodes if multiple."
  [mbql5-query]
  (when-let [filters (lib/filters mbql5-query 0)]
    (if (= 1 (count filters))
      (mbql-clause->filter-mbql-node (first filters))
      {:node/type :filter/and
       :children  (perf/mapv mbql-clause->filter-mbql-node filters)})))

(defn- extract-source-joins
  "Extract joins from MBQL 5 query and convert to AST join nodes."
  [mbql5-query]
  (when-let [joins (lib/joins mbql5-query 0)]
    (perf/mapv (fn [join]
                 {:node/type :ast/join
                  :mbql-join join})
               joins)))

(defn- mbql5-query->source-node
  "Parse MBQL 5 query into source node structure using lib functions.
   For source-card queries (metrics based on models or saved questions),
   falls back to the table-id from the entity metadata."
  [source-type id metadata mbql5-query]
  (let [source-card-id (lib.util/source-card-id mbql5-query)
        table-id       (or (lib.util/source-table-id mbql5-query)
                           (:table-id metadata))
        aggregation    (first (lib/aggregations mbql5-query 0))
        source-filter  (extract-source-filters mbql5-query)
        source-joins   (extract-source-joins mbql5-query)]
    (cond-> {:node/type   source-type
             :id          id
             :name        (:name metadata)
             :aggregation (or (mbql-aggregation->node aggregation)
                              {:node/type :aggregation/count})
             :base-table  (table-node table-id)
             :metadata    metadata}
      source-card-id (assoc :source-card-id source-card-id)
      source-joins   (assoc :joins source-joins)
      source-filter  (assoc :filters source-filter))))

;;; -------------------- Main Construction --------------------

(defn expression-leaf?
  "Returns true if the expression is a single leaf node ([:metric opts id] or [:measure opts id])."
  [expression]
  (and (sequential? expression)
       (= 3 (count expression))
       (#{:metric :measure} (first expression))))

(defn arithmetic-expression?
  "Returns true if the expression is an arithmetic node [op opts expr expr ...]."
  [expression]
  (and (sequential? expression)
       (>= (count expression) 4)
       (operators/arithmetic? (first expression))))

(defn expression-leaf-type
  "Returns :metric or :measure from an expression leaf."
  [expression]
  (when (expression-leaf? expression)
    (first expression)))

(defn expression-leaf-id
  "Returns the source ID from an expression leaf."
  [expression]
  (when (expression-leaf? expression)
    (nth expression 2)))

(defn expression-leaf-uuid
  "Returns the :lib/uuid from an expression leaf."
  [expression]
  (when (expression-leaf? expression)
    (get (second expression) :lib/uuid)))

;;; -------------------- Segment Pre-expansion --------------------
;;;
;;; When a user applies a segment whose table is not the metric's source
;;; table (a joined table, e.g. filtering an Orders metric by a segment on
;;; Products), the segment's stored `:definition` contains bare field refs
;;; that are missing the `:source-field` (FK) metadata required by the QP's
;;; `add-implicit-joins` middleware. If left alone, the compiled SQL references
;;; `PRODUCTS.X` without a JOIN to PRODUCTS and the database errors out.
;;;
;;; We fix this at AST-build time: expand each `[:segment _ id]` filter clause
;;; to the segment's own filter clauses, and annotate any `[:field opts col-id]`
;;; ref with `:source-field` taken from a dimension-mapping whose `:table-id`
;;; matches the field's table. Source-table segments (where no join is needed)
;;; pass through unchanged so `expand-macros` handles them as before.

(defn- segment-clause?
  "True if `clause` is a raw `[:segment _opts id]` MBQL filter clause."
  [clause]
  (and (sequential? clause)
       (= :segment (first clause))
       (pos-int? (nth clause 2 nil))))

(defn- field-ref?
  "True if `x` is a raw `[:field opts field-id]` MBQL field ref."
  [x]
  (and (sequential? x)
       (= :field (first x))
       (map? (second x))
       (pos-int? (nth x 2 nil))))

(defn- segment-table-id
  "Return the segment's table-id, preferring the metadata's `:table-id` and
   falling back to the first stage's `:source-table` if necessary."
  [segment]
  (or (:table-id segment)
      (perf/get-in segment [:definition :stages 0 :source-table])))

(defn- segment-filter-clauses
  "Return the segment's filter clauses (a seq of MBQL filter vectors) from its
   MBQL 5 `:definition`. Returns nil if none."
  [segment]
  (seq (perf/get-in segment [:definition :stages 0 :filters])))

(defn- dimension-mappings->table-annotations
  "Build a `{table-id -> {:source-field FK :base-type BT}}` map from the
   metric's dimension-mappings. First mapping per table wins (source-field is a
   property of the FK, shared by every dimension on the same joined table)."
  [dimension-mappings]
  (reduce (fn [acc {:keys [table-id target]}]
            (if (or (nil? table-id) (contains? acc table-id))
              acc
              (let [opts (second target)
                    ann  (cond-> {}
                           (:source-field opts) (assoc :source-field (:source-field opts))
                           (:base-type opts)    (assoc :base-type (:base-type opts)))]
                (if (seq ann)
                  (assoc acc table-id ann)
                  acc))))
          {}
          (or dimension-mappings [])))

(defn- field-ids-in-clause
  "Collect all field-ids referenced by `[:field _ id]` refs within `clause`."
  [clause]
  (let [ids (volatile! #{})]
    (perf/prewalk
     (fn [x]
       (when (field-ref? x)
         (vswap! ids conj (nth x 2)))
       x)
     clause)
    @ids))

(defn- fetch-field-table-ids
  "Return a `{field-id -> table-id}` map for the given field ids using the
   metadata provider."
  [metadata-provider field-ids]
  (when (seq field-ids)
    (into {}
          (map (juxt :id :table-id))
          (lib.metadata.protocols/metadatas
           metadata-provider
           {:lib/type :metadata/column :id (set field-ids)}))))

(defn- annotate-field-refs
  "Walk `clause` and annotate each bare `[:field opts field-id]` ref with
   `:source-field` / `:base-type` from `annotations-by-table`, using
   `field-id->table-id` to route to the right entry. Refs that already carry
   `:source-field` or `:join-alias` are left untouched — we only fill in the
   missing case."
  [clause field-id->table-id annotations-by-table]
  (perf/prewalk
   (fn [x]
     (if (field-ref? x)
       (let [[_field opts field-id] x
             table-id (get field-id->table-id field-id)
             ann      (get annotations-by-table table-id)]
         (if (and ann
                  (not (:source-field opts))
                  (not (:join-alias opts)))
           [:field (merge ann opts) field-id]
           x))
       x))
   clause))

(defn- expand-segment-clause
  "Given a raw `[:segment _ id]` clause, look up the segment metadata, pull its
   filter clauses, and annotate any field refs with `:source-field` from the
   metric's dimension-mappings. Returns a single MBQL filter clause (possibly
   wrapped in `:and`) or `nil` to signal 'leave the original clause alone'.

   Callers should short-circuit on source-table segments before invoking this."
  [metadata-provider annotations-by-table segment-clause]
  (let [segment-id (nth segment-clause 2)
        segment    (first (lib.metadata.protocols/metadatas
                           metadata-provider
                           {:lib/type :metadata/segment :id #{segment-id}}))
        clauses    (some-> segment segment-filter-clauses)]
    (when (seq clauses)
      (let [field-ids         (reduce into #{} (map field-ids-in-clause clauses))
            field-id->table   (fetch-field-table-ids metadata-provider field-ids)
            annotated         (perf/mapv #(annotate-field-refs % field-id->table annotations-by-table)
                                         clauses)]
        (if (= 1 (count annotated))
          (first annotated)
          (into [:and {:lib/uuid (str (random-uuid))}] annotated))))))

(defn- partition-filters-for-segment-expansion
  "Walk the flat filter list and split it into two groups:

   - `:normal-filters`   — non-segment clauses plus segment clauses on the
     source table (which `expand-macros` handles correctly). These flow through
     the usual `mbql-filter->ast-filter` pipeline.
   - `:expanded-clauses` — MBQL filter clauses expanded from joined-table
     segments, with field refs already annotated with `:source-field`. Each one
     must be emitted as a `:filter/mbql` passthrough AST node — it contains
     raw `[:field]` refs rather than `[:dimension]` refs and can't go through
     the typed-filter pipeline.

   Segments we can't resolve at all also stay in `:normal-filters`; the QP
   will error out as it would have pre-fix."
  [metadata-provider dimension-mappings source-table-id leaf-filters]
  (let [annotations-by-table (dimension-mappings->table-annotations dimension-mappings)]
    (reduce
     (fn [acc clause]
       (if-not (segment-clause? clause)
         (update acc :normal-filters conj clause)
         (let [segment-id (nth clause 2)
               segment    (first (lib.metadata.protocols/metadatas
                                  metadata-provider
                                  {:lib/type :metadata/segment :id #{segment-id}}))
               seg-table  (some-> segment segment-table-id)]
           (if (and seg-table
                    source-table-id
                    (not= seg-table source-table-id))
             (if-let [expanded (expand-segment-clause
                                metadata-provider annotations-by-table clause)]
               (update acc :expanded-clauses conj expanded)
               (update acc :normal-filters conj clause))
             (update acc :normal-filters conj clause)))))
     {:normal-filters [] :expanded-clauses []}
     leaf-filters)))

(defn- resolve-source-table-id
  "Return the metric's source table id — prefer the MBQL5 query's source-table
   so we pick it up for metrics where the metadata map doesn't carry
   `:table-id` at the top level (e.g. source-card-backed metrics, or our own
   test fixtures)."
  [metadata mbql5-query]
  (or (lib.util/source-table-id mbql5-query)
      (:table-id metadata)))

(defn- build-leaf-ast
  "Build a complete single-source AST for one expression leaf.
   Extracted from from-definition for reuse in arithmetic expressions."
  [leaf-type leaf-id leaf-uuid metadata-provider filters projections]
  (let [source-type    (case leaf-type :metric :source/metric :measure :source/measure)
        metadata-type  (case leaf-type :metric :metadata/metric :measure :metadata/measure)
        metadata       (first (lib.metadata.protocols/metadatas
                               metadata-provider
                               {:lib/type metadata-type :id #{leaf-id}}))
        dimensions         (lib-metric.dimension/get-persisted-dimensions metadata)
        dimension-mappings (lib-metric.dimension/get-persisted-dimension-mappings metadata)
        raw-query          (case leaf-type
                             :metric  (:dataset-query metadata)
                             :measure (:definition metadata))
        mbql5-query        (ensure-mbql5 metadata-provider raw-query)
        source-table-id    (resolve-source-table-id metadata mbql5-query)
        ;; Extract flat filters for this leaf's UUID
        leaf-filters       (into []
                                 (comp (filter #(= leaf-uuid (:lib/uuid %)))
                                       (map :filter))
                                 (or filters []))
        ;; Pre-expand joined-table segment filters so their field refs pick up
        ;; `:source-field` before the QP's `add-implicit-joins` middleware runs.
        ;; Source-table and unresolvable segments pass through to
        ;; `mbql-filter->ast-filter`'s existing `:segment` branch.
        {:keys [normal-filters expanded-clauses]}
        (partition-filters-for-segment-expansion
         metadata-provider dimension-mappings source-table-id leaf-filters)
        ;; Extract flat projections for this leaf's :lib/uuid
        leaf-projections   (perf/some #(when (= leaf-uuid (:lib/uuid %))
                                         (:projection %))
                                      (or projections []))
        ;; Convert filters and projections to AST nodes
        normal-ast-filter  (when (seq normal-filters) (mbql-filters->ast-filter normal-filters))
        expanded-nodes     (perf/mapv (fn [clause] {:node/type :filter/mbql :clause clause})
                                      expanded-clauses)
        ast-filter         (cond
                             (and normal-ast-filter (seq expanded-nodes))
                             {:node/type :filter/and
                              :children  (into [normal-ast-filter] expanded-nodes)}
                             normal-ast-filter             normal-ast-filter
                             (= 1 (count expanded-nodes))  (first expanded-nodes)
                             (seq expanded-nodes)          {:node/type :filter/and
                                                            :children  expanded-nodes})
        ast-group-by       (when (seq leaf-projections) (perf/mapv dimension-ref->ast-dimension-ref leaf-projections))]
    {:node/type         :ast/source-query
     :source            (mbql5-query->source-node source-type leaf-id metadata mbql5-query)
     :dimensions        (perf/mapv dimension-node (or dimensions []))
     :mappings          (perf/mapv dimension-mapping-node (or dimension-mappings []))
     :filter            ast-filter
     :group-by          (or ast-group-by [])}))

(defn- arithmetic-operator
  "Returns the arithmetic operator keyword if expression is an arithmetic node, nil otherwise."
  [expression]
  (when (arithmetic-expression? expression)
    (first expression)))

(defn- build-expression-ast
  "Recursively build expression AST from a metric-math expression tree.
   For numeric constants, produces :expression/constant.
   For leaves, calls build-leaf-ast and wraps in :expression/leaf.
   For arithmetic, recursively builds children and wraps in :expression/arithmetic."
  [expression metadata-provider filters projections]
  (cond
    (number? expression)
    {:node/type :expression/constant :value expression}

    (expression-leaf-type expression)
    (let [leaf-type (expression-leaf-type expression)
          leaf-id   (expression-leaf-id expression)
          leaf-uuid (expression-leaf-uuid expression)
          sub-ast   (build-leaf-ast leaf-type leaf-id leaf-uuid metadata-provider filters projections)]
      {:node/type :expression/leaf
       :uuid      leaf-uuid
       :ast       sub-ast})

    :else
    (let [op       (arithmetic-operator expression)
          children (drop 2 expression)]
      {:node/type :expression/arithmetic
       :operator  op
       :children  (perf/mapv #(build-expression-ast % metadata-provider filters projections) children)})))

(defn from-definition
  "Create complete AST from MetricDefinition.
   Converts legacy MBQL to MBQL 5 before processing.

   Metadata is loaded from the provider using the expression leaf's type and ID.
   Dimensions and dimension-mappings are loaded from the fetched metadata.

   Always produces a unified root shape {:node/type :ast/root, :expression ...}.
   Single-leaf definitions become a single :expression/leaf node."
  [definition]
  (let [{:keys [expression metadata-provider filters projections]} definition
        expr-ast (build-expression-ast expression metadata-provider filters projections)]
    {:node/type         :ast/root
     :expression        expr-ast
     :metadata-provider metadata-provider}))
