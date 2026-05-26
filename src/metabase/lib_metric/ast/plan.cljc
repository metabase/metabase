(ns metabase.lib-metric.ast.plan
  "Query planning and execution for metric ASTs.
   Takes an AST (from ast.build/from-definition) and produces a query plan
   that can be compiled and executed."
  (:require
   [clojure.set :as set]
   [metabase.lib-metric.ast.compile :as ast.compile]
   [metabase.lib-metric.ast.walk :as ast.walk]
   [metabase.lib-metric.operators :as operators]
   [metabase.types.core]
   [metabase.util.performance :as perf]))

;; Ensure type hierarchy is loaded
(comment metabase.types.core/keep-me)

;;; -------------------- Plan Data Structures --------------------
;;;
;;; Leaf plan (single-source, pass-through):
;;;   {:plan/type  :leaf
;;;    :plan/mbql  <compiled-mbql-query>}
;;;
;;; Arithmetic plan (multi-query):
;;;   {:plan/type           :arithmetic
;;;    :plan/expression     <expression-node from AST>
;;;    :plan/leaves         {"uuid-a" {:leaf/uuid "a" :leaf/mbql <mbql>} ...}
;;;    :plan/breakout-count 2
;;;    :plan/limit          10000}

;;; -------------------- Validation --------------------

(defn- dimension-signature
  "Build a signature for a group-by dimension ref that captures its type compatibility.
   Two dimensions are compatible for joining if they have the same effective type
   and the same bucketing/binning options."
  [dim-ref sub-ast]
  (let [dim-id      (:dimension-id dim-ref)
        ;; Look up the dimension node to get effective-type
        dim-node    (perf/some #(when (= dim-id (:id %)) %) (:dimensions sub-ast))
        ;; Get bucketing/binning from the ref options
        ref-options (:options dim-ref)]
    {:effective-type (:effective-type dim-node)
     :temporal-unit  (:temporal-unit ref-options)
     :binning        (:binning ref-options)}))

(defn- collect-leaf-group-bys
  "Collect group-by info from all expression leaves in an expression AST.
   Returns a vector of maps with :uuid, :has-group-by, :breakout-count,
   and :signatures (a vector of dimension signatures in group-by order)."
  [expression-node]
  (let [leaves (ast.walk/collect #(= :expression/leaf (:node/type %)) expression-node)]
    (perf/mapv (fn [leaf]
                 (let [sub-ast  (:ast leaf)
                       group-by (:group-by sub-ast)]
                   {:uuid           (:uuid leaf)
                    :has-group-by   (boolean (seq group-by))
                    :breakout-count (count group-by)
                    :signatures     (perf/mapv #(dimension-signature % sub-ast) group-by)}))
               leaves)))

(defn- effective-types-compatible?
  "Check if two effective types are compatible for dimension joining.
   Types are compatible if they are equal, or if both are date/datetime types
   (Date, DateTime, DateTimeWithLocalTZ, etc.), or if both are time types."
  [type-a type-b]
  (or (= type-a type-b)
      ;; Both have a date component — Date, DateTime, DateTimeWithLocalTZ, etc.
      (and (isa? type-a :type/HasDate)
           (isa? type-b :type/HasDate))
      ;; Both are pure time types — Time, TimeWithLocalTZ
      (and (isa? type-a :type/Time)
           (isa? type-b :type/Time))))

(defn- signatures-compatible?
  "Check if two dimension signatures are compatible for joining.
   nil values are treated as unknown and compatible with any known value.
   Only rejects when both sides have known but different values.
   Effective types are matched using [[effective-types-compatible?]] which allows
   compatible-but-not-identical temporal types (e.g. Date vs DateTimeWithLocalTZ)."
  [sig-a sig-b]
  (and (or (nil? (:effective-type sig-a))
           (nil? (:effective-type sig-b))
           (effective-types-compatible? (:effective-type sig-a) (:effective-type sig-b)))
       (or (nil? (:temporal-unit sig-a))
           (nil? (:temporal-unit sig-b))
           (= (:temporal-unit sig-a) (:temporal-unit sig-b)))
       (or (nil? (:binning sig-a))
           (nil? (:binning sig-b))
           (= (:binning sig-a) (:binning sig-b)))))

(defn- all-signatures-compatible?
  "Check that all leaves' signature vectors are pairwise compatible at each position."
  [sig-vecs]
  (let [positions (count (first sig-vecs))]
    (perf/every? (fn [pos]
                   (let [sigs-at-pos (map #(nth % pos) sig-vecs)]
                     (perf/every? #(signatures-compatible? (first sigs-at-pos) %)
                                  (rest sigs-at-pos))))
                 (range positions))))

(defn validate-arithmetic-ast!
  "Validate that an arithmetic expression AST has consistent group-by dimensions.
   All leaves must have the same number of breakout dimensions, and those dimensions must be
   type-compatible (same effective type, temporal unit, and binning) across all leaves.
   nil values are treated as unknown and compatible with any known value.
   Throws ex-info with :status-code 400 on validation failure."
  [expression-node]
  (let [leaf-infos (collect-leaf-group-bys expression-node)]
    (let [breakout-counts (map :breakout-count leaf-infos)]
      (when-not (apply = breakout-counts)
        (throw (ex-info "All leaves in arithmetic expression must have the same number of breakout dimensions"
                        {:status-code 400
                         :breakout-counts (zipmap (map :uuid leaf-infos) breakout-counts)}))))
    (let [sig-vecs (map :signatures leaf-infos)]
      (when-not (all-signatures-compatible? sig-vecs)
        (throw (ex-info "All leaves in arithmetic expression must have the same breakout dimension types and bucketing"
                        {:status-code 400
                         :signatures (zipmap (map :uuid leaf-infos) sig-vecs)}))))))

;;; -------------------- Plan Construction --------------------

(defn- compile-leaf-queries
  "Walk the expression AST, compile each leaf's sub-AST to MBQL.
   Returns a map of {uuid -> {:leaf/uuid uuid :leaf/mbql mbql}}."
  [expression-node opts]
  (let [leaves (ast.walk/collect #(= :expression/leaf (:node/type %)) expression-node)]
    (into {}
          (map (fn [leaf]
                 (let [uuid (:uuid leaf)
                       mbql (if-let [limit (:limit opts)]
                              (ast.compile/compile-to-mbql (:ast leaf) :limit limit)
                              (ast.compile/compile-to-mbql (:ast leaf)))]
                   [uuid {:leaf/uuid uuid :leaf/mbql mbql}])))
          leaves)))

(defn- single-leaf?
  "Returns true if the expression is a single leaf (no arithmetic operator)."
  [expression-node]
  (= :expression/leaf (:node/type expression-node)))

(defn plan-from-ast
  "Take a complete AST (from from-definition) and produce a query plan.
   Single-leaf expressions produce a :leaf plan.
   Arithmetic expressions validate and produce an :arithmetic plan.

   Options:
   - :limit - add limit to compiled queries
   - :values-only - if true, compile as values query (no aggregation, for breakout values)"
  [ast & {:as opts}]
  (let [expression (:expression ast)
        compile-fn (if (:values-only opts) ast.compile/compile-to-values-query ast.compile/compile-to-mbql)]
    (if (single-leaf? expression)
      ;; Single leaf — compile the sub-AST directly
      {:plan/type :leaf
       :plan/mbql (if-let [limit (:limit opts)]
                    (compile-fn (:ast expression) :limit limit)
                    (compile-fn (:ast expression)))}
      ;; Arithmetic — validate and compile each leaf
      (do
        (validate-arithmetic-ast! expression)
        (let [leaf-infos  (collect-leaf-group-bys expression)
              breakout-ct (:breakout-count (first leaf-infos))
              leaves      (compile-leaf-queries expression opts)]
          {:plan/type           :arithmetic
           :plan/expression     expression
           :plan/leaves         leaves
           :plan/breakout-count breakout-ct
           :plan/limit          (:limit opts)})))))

;;; -------------------- Expression Evaluation --------------------

(defn evaluate-expression
  "Recursively evaluate an expression AST node given {uuid -> numeric-value}.
   Returns nil on nil inputs or division by zero.
   Operator behavior is driven by metadata in [[operators/operator-metadata]]."
  [expression-node uuid->value]
  (case (:node/type expression-node)
    :expression/leaf
    (get uuid->value (:uuid expression-node))

    :expression/constant
    (:value expression-node)

    :expression/arithmetic
    (let [{:keys [operator children]} expression-node
          child-vals (perf/mapv #(evaluate-expression % uuid->value) children)]
      (when (perf/every? some? child-vals)
        (let [f              (operators/eval-fn operator)
              [init & rest-vals] child-vals]
          (when-not (and (operators/zero-guard? operator)
                         (perf/some zero? rest-vals))
            (reduce f init rest-vals)))))))

;;; -------------------- Result Joining --------------------

(defn index-result-by-dimensions
  "Index QP result rows as {dim-value-tuple -> agg-value}.
   The first `breakout-count` columns are dimension values, the rest is the aggregate."
  [result breakout-count]
  (let [rows (perf/get-in result [:data :rows])]
    (into {}
          (map (fn [row]
                 [(vec (take breakout-count row))
                  (nth row breakout-count)]))
          rows)))

(defn join-and-compute
  "Inner-join all leaf results on dimension tuples, evaluate expression per row.
   Returns {:cols [...] :rows [...]}."
  [expression-node leaf-results breakout-count]
  (let [;; Index each leaf's results by dimension tuple
        uuid->indexed (into {}
                            (map (fn [[uuid result]]
                                   [uuid (index-result-by-dimensions result breakout-count)]))
                            leaf-results)
        ;; Find dimension tuples present in ALL leaves (inner join)
        all-dim-tuples (reduce (fn [acc [_uuid indexed]]
                                 (if (nil? acc)
                                   (set (keys indexed))
                                   (set/intersection acc (set (keys indexed)))))
                               nil
                               uuid->indexed)
        ;; Compute expression for each joined row
        rows (into []
                   (keep (fn [dim-tuple]
                           (let [uuid->val (into {}
                                                 (map (fn [[uuid indexed]]
                                                        [uuid (get indexed dim-tuple)]))
                                                 uuid->indexed)
                                 result    (evaluate-expression expression-node uuid->val)]
                             (when (some? result)
                               (conj dim-tuple result)))))
                   (sort all-dim-tuples))
        ;; Build column metadata from the first leaf's result
        first-result     (val (first leaf-results))
        source-cols      (perf/get-in first-result [:data :cols])
        breakout-cols    (vec (take breakout-count source-cols))
        ;; Use the last col (aggregate) with a generic name for the computed result
        agg-col          (-> (last source-cols)
                             (assoc :name "expression" :display_name "Expression"))]
    {:cols (conj breakout-cols agg-col)
     :rows rows}))
