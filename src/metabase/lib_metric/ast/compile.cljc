(ns metabase.lib-metric.ast.compile
  "Compile AST to MBQL queries."
  (:require
   [medley.core :as m]
   [metabase.lib-metric.ast.schema :as ast.schema]
   [metabase.util.malli :as mu]))

(comment ast.schema/keep-me)

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
  [{:keys [id]} options]
  [:field (merge {:lib/uuid (random-uuid-str)} options) id])

(defn- resolve-dimension-ref
  "Resolve dimension ref node to MBQL field ref using mappings."
  [{:keys [dimension-id options]} mappings]
  (if-let [mapping (find-mapping dimension-id mappings)]
    (column-node->field-ref (:column mapping) (or options {}))
    (throw (ex-info "Unable to resolve dimension" {:dimension-id dimension-id}))))

;;; -------------------- Filter Compilation --------------------

(defmulti compile-filter-node
  "Compile filter AST node to MBQL filter clause."
  (fn [node _mappings] (:node/type node)))

(defmethod compile-filter-node :filter/comparison
  [{:keys [operator dimension value]} mappings]
  [operator {:lib/uuid (random-uuid-str)}
   (resolve-dimension-ref dimension mappings)
   value])

(defmethod compile-filter-node :filter/between
  [{:keys [dimension min max]} mappings]
  [:between {:lib/uuid (random-uuid-str)}
   (resolve-dimension-ref dimension mappings)
   min max])

(defmethod compile-filter-node :filter/string
  [{:keys [operator dimension value options]} mappings]
  [operator (merge {:lib/uuid (random-uuid-str)} options)
   (resolve-dimension-ref dimension mappings)
   value])

(defmethod compile-filter-node :filter/null
  [{:keys [operator dimension]} mappings]
  [operator {:lib/uuid (random-uuid-str)}
   (resolve-dimension-ref dimension mappings)])

(defmethod compile-filter-node :filter/in
  [{:keys [operator dimension values]} mappings]
  (into [operator {:lib/uuid (random-uuid-str)}
         (resolve-dimension-ref dimension mappings)]
        values))

(defmethod compile-filter-node :filter/temporal
  [{:keys [operator dimension value unit]} mappings]
  [operator {:lib/uuid (random-uuid-str)}
   (resolve-dimension-ref dimension mappings)
   value unit])

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

(defn- compile-aggregation-node
  "Compile aggregation node to MBQL aggregation clause."
  [node]
  (case (:node/type node)
    :aggregation/count    [:count {:lib/uuid (random-uuid-str)}]
    :aggregation/sum      [:sum {:lib/uuid (random-uuid-str)}
                           (column-node->field-ref (:column node) {})]
    :aggregation/avg      [:avg {:lib/uuid (random-uuid-str)}
                           (column-node->field-ref (:column node) {})]
    :aggregation/min      [:min {:lib/uuid (random-uuid-str)}
                           (column-node->field-ref (:column node) {})]
    :aggregation/max      [:max {:lib/uuid (random-uuid-str)}
                           (column-node->field-ref (:column node) {})]
    :aggregation/distinct [:distinct {:lib/uuid (random-uuid-str)}
                           (column-node->field-ref (:column node) {})]
    :aggregation/mbql     (:clause node)))

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
     (get-in metadata [:dataset-query :database])
     ;; From measure definition
     (get-in metadata [:definition :database])
     ;; Default fallback
     1)))

;;; -------------------- Main Compilation --------------------

(mu/defn compile-to-mbql
  "Compile AST to MBQL query.

   Options:
   - :limit - add limit to query"
  [{:keys [source mappings filter group-by metadata-provider]} :- ::ast.schema/ast
   & {:keys [limit]}]
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
                    (mapv #(resolve-dimension-ref % mappings) group-by))

        ;; Build stage
        stage (cond-> {:lib/type     :mbql.stage/mbql
                       :source-table (get-in source [:base-table :id])
                       :aggregation  [(compile-aggregation-node (:aggregation source))]}
                (seq all-filters) (assoc :filters all-filters)
                (seq breakouts)   (assoc :breakout breakouts)
                limit             (assoc :limit limit))

        ;; Get database ID from source
        database-id (get-database-id source)]
    ;; Note: We don't include :lib/metadata here because the query processor
    ;; will create its own metadata provider based on the database ID.
    ;; The MetricContextMetadataProvider doesn't have a single database context
    ;; which causes issues with the QP store initialization.
    {:lib/type :mbql/query
     :database database-id
     :stages   [stage]}))

