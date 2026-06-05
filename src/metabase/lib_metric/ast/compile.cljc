(ns metabase.lib-metric.ast.compile
  "Compile AST to MBQL queries."
  (:require
   [medley.core :as m]
   [metabase.lib-metric.ast.schema :as ast.schema]
   [metabase.lib-metric.ast.type :as ast.type]
   [metabase.util.malli :as mu]
   [metabase.util.performance :as perf]))

;;; -------------------- Helper Functions --------------------

(defn- random-uuid-str []
  (str (random-uuid)))

;;; -------------------- Resolution --------------------

(defn- find-mapping
  "Find dimension mapping by dimension ID."
  [dimension-id mappings]
  (m/find-first #(= dimension-id (:dimension-id %)) mappings))

(defn- column-node->field-ref
  "Convert column node to MBQL field reference."
  [{:keys [id source-field base-type]} options]
  [:field (cond-> (merge {:lib/uuid (random-uuid-str)} options)
            source-field (assoc :source-field source-field)
            base-type    (assoc :base-type base-type))
   id])

(defn- resolve-dimension-ref
  "Resolve dimension ref node to MBQL field ref using mappings."
  [{:keys [dimension-id options]} mappings]
  (if-let [mapping (find-mapping dimension-id mappings)]
    (column-node->field-ref (:column mapping) (or options {}))
    (throw (ex-info "Unable to resolve dimension" {:dimension-id dimension-id}))))

(defn- resolve-dimension-or-expression
  "Resolve a dimension ref or dimension expression node to MBQL.
   For :ast/dimension-ref nodes, delegates to resolve-dimension-ref.
   For :ast/dimension-expression nodes, resolves the inner dimension ref
   and wraps the result in the expression operator."
  [node mappings]
  (case (:node/type node)
    :ast/dimension-ref (resolve-dimension-ref node mappings)
    :ast/dimension-expression
    (let [{:keys [expression-op dimension args]} node
          resolved-field (resolve-dimension-ref dimension mappings)]
      (into [expression-op {:lib/uuid (random-uuid-str)} resolved-field] args))))

;;; -------------------- Filter Compilation --------------------

(defmulti compile-filter-node
  "Compile filter AST node to MBQL filter clause."
  {:arglists '([node mappings])}
  (fn [node _mappings] (:node/type node)))

(defmethod compile-filter-node :filter/comparison
  [{:keys [operator dimension values]} mappings]
  (into [operator {:lib/uuid (random-uuid-str)}
         (resolve-dimension-or-expression dimension mappings)]
        values))

(defmethod compile-filter-node :filter/between
  [{:keys [dimension min max]} mappings]
  [:between {:lib/uuid (random-uuid-str)}
   (resolve-dimension-or-expression dimension mappings)
   min max])

(defmethod compile-filter-node :filter/string
  [{:keys [operator dimension value options]} mappings]
  [operator (merge {:lib/uuid (random-uuid-str)} options)
   (resolve-dimension-or-expression dimension mappings)
   value])

(defmethod compile-filter-node :filter/null
  [{:keys [operator dimension]} mappings]
  [operator {:lib/uuid (random-uuid-str)}
   (resolve-dimension-or-expression dimension mappings)])

(defmethod compile-filter-node :filter/in
  [{:keys [operator dimension values]} mappings]
  (into [operator {:lib/uuid (random-uuid-str)}
         (resolve-dimension-or-expression dimension mappings)]
        values))

(defmethod compile-filter-node :filter/inside
  [{:keys [lat-dimension lon-dimension north east south west]} mappings]
  [:inside {:lib/uuid (random-uuid-str)}
   (resolve-dimension-or-expression lat-dimension mappings)
   (resolve-dimension-or-expression lon-dimension mappings)
   north east south west])

(defmethod compile-filter-node :filter/temporal
  [{:keys [operator dimension value unit offset-value offset-unit]} mappings]
  (let [opts (cond-> {:lib/uuid (random-uuid-str)}
               offset-value (assoc :offset-value offset-value)
               offset-unit  (assoc :offset-unit offset-unit))]
    [operator opts (resolve-dimension-or-expression dimension mappings) value unit]))

(defmethod compile-filter-node :filter/and
  [{:keys [children]} mappings]
  (into [:and {:lib/uuid (random-uuid-str)}]
        (map #(compile-filter-node % mappings) children)))

(defmethod compile-filter-node :filter/or
  [{:keys [children]} mappings]
  (into [:or {:lib/uuid (random-uuid-str)}]
        (map #(compile-filter-node % mappings) children)))

(defmethod compile-filter-node :filter/not
  [{:keys [child]} mappings]
  [:not {:lib/uuid (random-uuid-str)}
   (compile-filter-node child mappings)])

(defmethod compile-filter-node :filter/mbql
  [{:keys [clause]} _mappings]
  clause)

;;; -------------------- Aggregation Compilation --------------------

(defmulti compile-aggregation-node
  "Compile aggregation node to MBQL aggregation clause."
  {:arglists '([node])}
  :node/type
  :hierarchy #'ast.type/ast-hierarchy)

(defmethod compile-aggregation-node :aggregation/count
  [{:keys [column]}]
  (if column
    [:count {:lib/uuid (random-uuid-str)}
     (column-node->field-ref column {})]
    [:count {:lib/uuid (random-uuid-str)}]))

(defmethod compile-aggregation-node :aggregation/column
  [{:keys [column] :as node}]
  (let [agg-kw (keyword (name (:node/type node)))]
    [agg-kw {:lib/uuid (random-uuid-str)}
     (column-node->field-ref column {})]))

(defmethod compile-aggregation-node :aggregation/mbql
  [{:keys [clause]}]
  clause)

;;; -------------------- Source Compilation --------------------

(defn- compile-source-filters
  "Compile source's built-in filters."
  [source mappings]
  (when-let [filters (:filters source)]
    (compile-filter-node filters mappings)))

(defn- get-database-id
  "Extract database ID from source metadata."
  [source]
  (let [metadata (:metadata source)]
    (or
     ;; From metric dataset-query
     (perf/get-in metadata [:dataset-query :database])
     ;; From measure definition
     (perf/get-in metadata [:definition :database])
     (throw (ex-info "Cannot determine database ID for metric source"
                     {:source-metadata metadata})))))

;;; -------------------- Join Compilation --------------------

(defn- has-joins?
  "Check if source has joins that require two-stage compilation."
  [source]
  (seq (:joins source)))

(defn- source-card?
  "Check if source originates from a source-card (model or saved question)."
  [source]
  (some? (:source-card-id source)))

(defn- needs-two-stage?
  "Source-card metrics and metrics with joins both compile to two-stage queries."
  [source]
  (or (has-joins? source) (source-card? source)))

(defn- stage-0-source
  "Return the [key value] pair for stage-0's source — :source-card if the metric
   wraps a card, otherwise :source-table from the base table."
  [source]
  (if-let [card-id (:source-card-id source)]
    [:source-card card-id]
    [:source-table (perf/get-in source [:base-table :id])]))

(defn- compile-join-nodes
  "Compile AST join nodes to MBQL 5 join clauses.
   Forces `:fields :all` so that all joined columns are visible in stage 1 of
   two-stage queries (the only context that calls this function). The dimension
   system advertises all joined columns regardless of the original `:fields`
   setting, so the compile phase must match."
  [join-nodes]
  (perf/mapv (fn [join-node]
               (assoc (:mbql-join join-node) :fields :all))
             join-nodes))

;;; -------------------- Main Compilation --------------------

(defn- compile-single-stage-query
  "Compile AST to single-stage MBQL query (no joins)."
  [{:keys [source mappings filter group-by]} {:keys [limit]}]
  (let [;; Compile source filters + user filters
        source-filters (compile-source-filters source mappings)
        user-filters   (when filter (compile-filter-node filter mappings))
        all-filters    (cond
                         (and source-filters user-filters)
                         [[:and {:lib/uuid (random-uuid-str)} source-filters user-filters]]
                         source-filters [source-filters]
                         user-filters   [user-filters]
                         :else          nil)

        ;; Compile breakouts from group-by
        breakouts (when (seq group-by)
                    (perf/mapv #(resolve-dimension-ref % mappings) group-by))

        ;; Build stage
        stage (cond-> {:lib/type     :mbql.stage/mbql
                       :source-table (perf/get-in source [:base-table :id])
                       :aggregation  [(compile-aggregation-node (:aggregation source))]}
                (seq all-filters) (assoc :filters all-filters)
                (seq breakouts)   (assoc :breakout breakouts)
                limit             (assoc :limit limit))

        ;; Get database ID from source
        database-id (get-database-id source)]
    {:lib/type :mbql/query
     :database database-id
     :stages   [stage]}))

(defn- compile-two-stage-query
  "Compile AST to two-stage MBQL query when joins are present or the metric is
   based on a source-card (model / saved question).

   Stage 0: Data model - base table or source card, joins, source filters
   Stage 1: Analysis - user filters, breakouts, aggregation"
  [{:keys [source mappings filter group-by]} {:keys [limit]}]
  (let [[source-key source-val] (stage-0-source source)
        ;; Stage 0: Data model
        stage-0 (cond-> {:lib/type  :mbql.stage/mbql
                         source-key source-val}
                  (seq (:joins source))
                  (assoc :joins (compile-join-nodes (:joins source)))
                  (:filters source)
                  (assoc :filters [(compile-filter-node (:filters source) mappings)]))

        ;; Stage 1: Analysis
        user-filters (when filter [(compile-filter-node filter mappings)])
        breakouts    (when (seq group-by)
                       (perf/mapv #(resolve-dimension-ref % mappings) group-by))
        stage-1      (cond-> {:lib/type    :mbql.stage/mbql
                              :aggregation [(compile-aggregation-node (:aggregation source))]}
                       (seq user-filters) (assoc :filters user-filters)
                       (seq breakouts)    (assoc :breakout breakouts)
                       limit              (assoc :limit limit))

        database-id (get-database-id source)]
    {:lib/type :mbql/query
     :database database-id
     :stages   [stage-0 stage-1]}))

(mu/defn compile-to-mbql
  "Compile a source-query to MBQL query.

   Generates a two-stage query when the source has joins or is based on a
   source-card (model / saved question):
   - Stage 0: Data model (base table or source card + joins + source filters)
   - Stage 1: Analysis (user filters + breakouts + aggregation)

   Options:
   - :limit - add limit to query"
  [{:keys [source] :as source-query} :- ::ast.schema/source-query
   & {:as opts}]
  (if (needs-two-stage? source)
    (compile-two-stage-query source-query opts)
    (compile-single-stage-query source-query opts)))

;;; -------------------- Values Query Compilation (no aggregation) --------------------

(defn- compile-single-stage-values-query
  "Compile AST to single-stage MBQL query for distinct values (no aggregation)."
  [{:keys [source mappings filter group-by]} {:keys [limit]}]
  (let [source-filters (compile-source-filters source mappings)
        user-filters   (when filter (compile-filter-node filter mappings))
        all-filters    (cond
                         (and source-filters user-filters)
                         [[:and {:lib/uuid (random-uuid-str)} source-filters user-filters]]
                         source-filters [source-filters]
                         user-filters   [user-filters]
                         :else          nil)
        breakouts (when (seq group-by)
                    (perf/mapv #(resolve-dimension-ref % mappings) group-by))
        stage (cond-> {:lib/type     :mbql.stage/mbql
                       :source-table (perf/get-in source [:base-table :id])}
                (seq all-filters) (assoc :filters all-filters)
                (seq breakouts)   (assoc :breakout breakouts)
                limit             (assoc :limit limit))
        database-id (get-database-id source)]
    {:lib/type :mbql/query
     :database database-id
     :stages   [stage]}))

(defn- compile-two-stage-values-query
  "Compile AST to two-stage MBQL query for distinct values (no aggregation).

   Stage 0: Data model - base table or source card, joins, source filters
   Stage 1: User filters, breakouts (no aggregation)"
  [{:keys [source mappings filter group-by]} {:keys [limit]}]
  (let [[source-key source-val] (stage-0-source source)
        stage-0 (cond-> {:lib/type  :mbql.stage/mbql
                         source-key source-val}
                  (seq (:joins source))
                  (assoc :joins (compile-join-nodes (:joins source)))
                  (:filters source)
                  (assoc :filters [(compile-filter-node (:filters source) mappings)]))
        user-filters (when filter [(compile-filter-node filter mappings)])
        breakouts    (when (seq group-by)
                       (perf/mapv #(resolve-dimension-ref % mappings) group-by))
        stage-1      (cond-> {:lib/type :mbql.stage/mbql}
                       (seq user-filters) (assoc :filters user-filters)
                       (seq breakouts)    (assoc :breakout breakouts)
                       limit              (assoc :limit limit))
        database-id (get-database-id source)]
    {:lib/type :mbql/query
     :database database-id
     :stages   [stage-0 stage-1]}))

(mu/defn compile-to-values-query
  "Compile a source-query to MBQL query for fetching distinct values (no aggregation).

   Like [[compile-to-mbql]] but omits the aggregation clause, producing a query
   that returns distinct breakout values instead of aggregated results.

   Options:
   - :limit - add limit to query"
  [{:keys [source] :as source-query} :- ::ast.schema/source-query
   & {:as opts}]
  (if (needs-two-stage? source)
    (compile-two-stage-values-query source-query opts)
    (compile-single-stage-values-query source-query opts)))
