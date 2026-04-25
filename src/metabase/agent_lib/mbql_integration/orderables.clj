(ns metabase.agent-lib.mbql-integration.orderables
  "Expression and orderable resolution helpers for the agent-lib MBQL bridge."
  (:require
   [clojure.string :as str]
   [metabase.agent-lib.common.errors :as errors]
   [metabase.agent-lib.mbql-integration.common :as common]
   [metabase.lib.core :as lib]
   [metabase.lib.expression :as lib.expression]
   [metabase.lib.ref :as lib.ref]
   [metabase.lib.schema.util :as lib.schema.util]
   [metabase.lib.util :as lib.util]))

(set! *warn-on-reflection* true)

(def ^:private aggregation-orderable-ops
  #{:count
    :sum
    :avg
    :min
    :max
    :distinct
    :median
    :stddev
    :var
    :count-where
    :sum-where
    :distinct-where
    :share
    :percentile
    :cum-count
    :cum-sum
    :metric})

(defn- normalize-expression-comparison
  "Strip volatile metadata from an expression tree before structural
  comparison."
  [expr]
  (cond
    (map? expr)
    (-> expr
        (dissoc :lib/uuid :lib/expression-name :display-name :name)
        (update-vals normalize-expression-comparison))

    (vector? expr)
    (mapv normalize-expression-comparison expr)

    (sequential? expr)
    (mapv normalize-expression-comparison expr)

    :else
    expr))

(defn matching-expression-ref
  "Return the expression ref for the current query expression that is
  semantically equal to `orderable`."
  [query orderable]
  (let [normalized-orderable (normalize-expression-comparison
                              (lib.schema.util/remove-lib-uuids orderable))]
    (some (fn [expr]
            (when-let [expr-name (lib.util/expression-name expr)]
              (when (= normalized-orderable
                       (normalize-expression-comparison
                        (lib.schema.util/remove-lib-uuids expr)))
                (lib/expression-ref query expr-name))))
          (lib/expressions query))))

(defn matching-previous-stage-column-by-name
  "Return a unique previous-stage column whose visible names match
  `column-name`."
  [query column-name]
  (let [normalized-column-name (common/normalized-name column-name)]
    (when normalized-column-name
      (->> [(lib/returned-columns query)
            (common/current-query-field-candidates query)]
           (apply concat)
           common/dedupe-candidate-columns
           (filter #(and (= :source/previous-stage (:lib/source %))
                         (contains? (common/column-names %) normalized-column-name)))
           vec
           common/unique-query-candidate))))

(defn current-stage-expression-ref
  "Return an expression ref when `expr-name` still resolves as a current-stage
  expression name."
  [query expr-name]
  (when (lib.expression/maybe-resolve-expression query expr-name)
    (lib/expression-ref query expr-name)))

(defn expression-ref-or-current-stage-column
  "Resolve an expression name to the thing the current stage can actually order
  or project by."
  [query expr-name]
  (or (current-stage-expression-ref query expr-name)
      (matching-previous-stage-column-by-name query expr-name)
      (errors/lookup-error! (str "Expression not found in the current query stage: " (pr-str expr-name))
                            {:expression-name expr-name})))

(defn ensure-query-expression-ref
  "Ensure a query contains an expression definition for `expression`, returning
  `[query expr-ref]`."
  [query expression prefix]
  (if-let [expr-ref (matching-expression-ref query expression)]
    [query expr-ref]
    (let [expr-name (str "__" prefix "_expression_" (inc (count (lib/expressions query))))
          query'    (lib/expression query expr-name expression)]
      [query' (lib/expression-ref query' expr-name)])))

(defn orderable-column-key
  "Return the structural identity used when deduplicating orderable columns."
  [column]
  [(:id column)
   (:name column)
   (:lib/source column)
   (:lib/source-uuid column)
   (:source-field column)
   (:fk-field-id column)
   (:lib/original-fk-field-id column)
   (:lib/expression-name column)])

(defn current-query-orderable-candidates
  "Return the distinct orderable columns for the current stage."
  [query]
  (vals
   (reduce (fn [acc column]
             (assoc acc (orderable-column-key column) column))
           {}
           (lib/orderable-columns query))))

(defn column-field-ids
  "Return every field id represented by a column's lineage metadata."
  [column]
  (->> [(:id column)
        (:source-field column)
        (:fk-field-id column)
        (:lib/original-fk-field-id column)]
       (filter pos-int?)
       set))

(defn breakout-expression-name
  "Return the expression name for a breakout when the breakout is an
  expression-ref."
  [breakout]
  (when (lib.util/clause-of-type? breakout :expression)
    (lib.ref/expression-ref-name breakout)))

(defn previous-stage-aggregation-column
  "Resolve an aggregation index to the column that represents that aggregation
  in the previous stage."
  [query ag-index]
  (when-let [previous-stage-number (lib.util/previous-stage-number query -1)]
    (let [candidate-columns (concat (lib/returned-columns query)
                                    (lib/filterable-columns query)
                                    (lib/orderable-columns query)
                                    (lib/visible-columns query))]
      (or (try
            (lib/find-matching-column query
                                      -1
                                      (lib/aggregation-ref query previous-stage-number ag-index)
                                      candidate-columns)
            (catch Exception _
              nil))
          (when-let [source-uuid (:lib/source-uuid
                                  (get (vec (lib/aggregations-metadata query previous-stage-number))
                                       ag-index))]
            (some #(when (= source-uuid (:lib/source-uuid %))
                     %)
                  candidate-columns))))))

(defn aggregation-ref-or-current-stage-column
  "Resolve an aggregation index to the right current-stage orderable or
  projectable value."
  [query ag-index]
  (if (get (vec (lib/aggregations query)) ag-index)
    (lib/aggregation-ref query ag-index)
    (or (previous-stage-aggregation-column query ag-index)
        (errors/lookup-error! (str "Undefined aggregation " ag-index)
                              {:aggregation-index ag-index
                               :stage-number      -1}))))

(defn aggregation-signature
  "Return the semantic signature used to compare aggregation definitions."
  [aggregation]
  [(first aggregation) (common/extract-field-ids aggregation)])

(defn aggregation-columns
  "Return the current-stage orderable columns backed by aggregation outputs."
  [query]
  (filterv #(= (:lib/source %) :source/aggregations)
           (lib/orderable-columns query)))

(defn aggregation-column-pairs
  "Pair each current-stage aggregation with the orderable column that lib maps
  it to, when one exists."
  [query]
  (let [agg-cols (aggregation-columns query)]
    (->> (lib/aggregations query)
         (map-indexed (fn [idx aggregation]
                        [idx aggregation
                         (lib/find-matching-column query -1 (lib/aggregation-ref query idx) agg-cols)]))
         (filter #(nth % 2))
         vec)))

(defn requested-orderable-field-ids
  "Return the field ids semantically referenced by an orderable request."
  [requested]
  (cond
    (map? requested)
    (column-field-ids requested)

    (lib.util/field-clause? requested)
    (common/extract-field-ids requested)

    :else
    #{}))

(defn orderable-field-id->query-columns
  "Return current-stage orderable columns whose lineage includes `field-id`."
  [query field-id]
  (->> (current-query-orderable-candidates query)
       (filterv #(contains? (column-field-ids %) field-id))))

(defn orderable-field-ids->query-columns
  "Return unique current-stage orderable columns whose lineage overlaps any of
  `field-ids`."
  [query field-ids]
  (->> field-ids
       (mapcat #(orderable-field-id->query-columns query %))
       (reduce (fn [acc column]
                 (assoc acc (orderable-column-key column) column))
               {})
       vals
       vec))

(defn field-id->breakout-expression-refs
  "Return breakout expression refs whose underlying expression touches
  `field-id`."
  [query field-id]
  (let [expr-fields (->> (lib/expressions query)
                         (keep (fn [expr]
                                 (when-let [expr-name (lib.util/expression-name expr)]
                                   [expr-name (common/extract-field-ids expr)])))
                         (into {}))]
    (->> (lib/breakouts query)
         (keep breakout-expression-name)
         (filter #(contains? (get expr-fields % #{}) field-id))
         distinct
         (mapv #(lib/expression-ref query %)))))

(defn field-ids->breakout-expression-ref
  "Return the unique breakout expression ref implied by `field-ids`, if one can
  be chosen unambiguously."
  [query field-ids]
  (let [matches (->> field-ids
                     (mapcat #(field-id->breakout-expression-refs query %))
                     (reduce (fn [acc expr-ref]
                               (assoc acc (pr-str expr-ref) expr-ref))
                             {})
                     vals
                     vec)]
    (when (= 1 (count matches))
      (first matches))))

(defn field-id->aggregation-columns
  "Return aggregation output columns whose defining aggregation references
  `field-id`."
  [query field-id]
  (->> (aggregation-column-pairs query)
       (keep (fn [[_idx aggregation column]]
               (when (contains? (common/extract-field-ids aggregation) field-id)
                 column)))
       vec))

(defn field-ids->aggregation-columns
  "Return unique aggregation output columns referenced by any of `field-ids`."
  [query field-ids]
  (->> field-ids
       (mapcat #(field-id->aggregation-columns query %))
       (reduce (fn [acc column]
                 (assoc acc (orderable-column-key column) column))
               {})
       vals
       vec))

(defn- sole-match
  "Return `[query match]` when `candidates` has exactly one element, else nil."
  [query candidates]
  (when (= 1 (count candidates))
    [query (first candidates)]))

(defn resolve-field-like-orderable
  "Resolve a field-like orderable request against the current query stage."
  [query requested]
  (let [field-ids   (requested-orderable-field-ids requested)
        query-match (orderable-field-ids->query-columns query field-ids)]
    (or (sole-match query query-match)
        (when-let [ref (field-ids->breakout-expression-ref query field-ids)]
          [query ref])
        (sole-match query (field-ids->aggregation-columns query field-ids))
        (sole-match query (aggregation-columns query))
        [query requested])))

(defn- resolve-aggregation-orderable
  "Resolve an aggregation-like orderable by progressively narrowing candidates."
  [query orderable]
  (let [agg-cols     (aggregation-columns query)
        op-name      (name (first orderable))
        by-name      (filterv #(str/starts-with? (or (:name %) "") op-name) agg-cols)
        target-sig   (aggregation-signature orderable)
        by-signature (when (> (count by-name) 1)
                       (->> (aggregation-column-pairs query)
                            (keep (fn [[_idx aggregation column]]
                                    (when (and (some #{column} by-name)
                                               (= target-sig (aggregation-signature aggregation)))
                                      column)))
                            vec))]
    (or (sole-match query agg-cols)
        (sole-match query by-name)
        (sole-match query by-signature)
        (cond
          (> (count by-signature) 1)
          (errors/lookup-error! (str "Ambiguous: multiple identical '" op-name "' aggregations.")
                                {:operator op-name}
                                {:available  (mapv :name agg-cols)
                                 :suggestion "Use orderable-columns to pick the specific column."})

          (> (count by-name) 1)
          (errors/lookup-error! (str "No orderable column matched aggregation '" op-name "' on those fields.")
                                {:operator op-name}
                                {:available (mapv :name agg-cols)})

          :else
          (errors/lookup-error! (str "No orderable column found for aggregation '" op-name "'.")
                                {:operator op-name}
                                {:available (mapv :name agg-cols)})))))

(defn resolve-orderable
  "Resolve an agent-program orderable against the current query, returning
  `[query resolved-orderable]`."
  [query orderable]
  (cond
    (map? orderable)
    (resolve-field-like-orderable query orderable)

    (and (lib.util/clause? orderable)
         (contains? aggregation-orderable-ops (first orderable)))
    (resolve-aggregation-orderable query orderable)

    (lib.util/field-clause? orderable)
    (resolve-field-like-orderable query orderable)

    (lib.util/clause-of-type? orderable :expression)
    [query orderable]

    (lib.util/clause-of-type? orderable :aggregation)
    [query orderable]

    (lib.util/clause? orderable)
    (ensure-query-expression-ref query orderable "order_by")

    :else
    [query orderable]))
