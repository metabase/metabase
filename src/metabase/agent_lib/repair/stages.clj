(ns metabase.agent-lib.repair.stages
  "Stage-boundary inference and aggregation-stage helpers for structured repair."
  (:require
   [metabase.agent-lib.syntax :as syntax]))

(set! *warn-on-reflection* true)

(def ^:private max-repair-depth
  "Maximum recursion depth for repair-phase tree walks."
  64)

(defn contains-aggregation-ref?
  "True when `value` contains an `aggregation-ref` anywhere inside it."
  ([value]
   (contains-aggregation-ref? value 0))
  ([value depth]
   (if (> depth max-repair-depth)
     false
     (cond
       (and (vector? value)
            (= "aggregation-ref" (syntax/canonical-op-name (first value))))
       true

       (map? value)
       (boolean (some #(contains-aggregation-ref? % (inc depth)) (vals value)))

       (sequential? value)
       (boolean (some #(contains-aggregation-ref? % (inc depth)) value))

       :else
       false))))

(defn aggregate-over-aggregation-ref?
  "True when `operation` is an aggregate over an aggregation-ref."
  [operation]
  (and (vector? operation)
       (= "aggregate" (syntax/canonical-op-name (first operation)))
       (contains-aggregation-ref? (rest operation))))

(defn- operation-defines-aggregation?
  [operation]
  (and (vector? operation)
       (= "aggregate" (syntax/canonical-op-name (first operation)))))

(defn- operation-requires-post-aggregation-stage?
  [operation]
  (and (vector? operation)
       (contains-aggregation-ref? (rest operation))
       (#{"aggregate" "expression" "with-fields"}
        (syntax/canonical-op-name (first operation)))))

(defn source-final-stage-has-aggregations?
  "True when the source program ends in an aggregated stage."
  [source]
  (cond
    (not (map? source))
    false

    (= "metric" (:type source))
    true

    (= "program" (:type source))
    (let [nested-program (:program source)]
      (:current-stage-has-aggregations?
       (reduce (fn [state operation]
                 (cond
                   (and (vector? operation)
                        (= "append-stage" (syntax/canonical-op-name (first operation))))
                   (assoc state :current-stage-has-aggregations? false)

                   (operation-defines-aggregation? operation)
                   (assoc state :current-stage-has-aggregations? true)

                   :else
                   state))
               {:current-stage-has-aggregations? (source-final-stage-has-aggregations? (:source nested-program))}
               (:operations nested-program))))

    :else
    false))

(defn insert-stage-boundaries
  "Insert `append-stage` before operations that must run after an aggregation stage."
  [source operations]
  (:operations
   (reduce (fn [{:keys [current-stage-has-aggregations? operations]} operation]
             (let [op-name (when (vector? operation)
                             (syntax/canonical-op-name (first operation)))
                   needs-stage? (and current-stage-has-aggregations?
                                     (operation-requires-post-aggregation-stage? operation)
                                     (not= "append-stage"
                                           (some-> operations last first syntax/canonical-op-name)))
                   operations'  (cond-> operations
                                  needs-stage? (conj ["append-stage"])
                                  true        (conj operation))]
               (cond
                 (= "append-stage" op-name)
                 {:current-stage-has-aggregations? false
                  :operations                      operations'}

                 :else
                 {:current-stage-has-aggregations? (or (and (not needs-stage?) current-stage-has-aggregations?)
                                                       (operation-defines-aggregation? operation))
                  :operations                      operations'})))
           {:current-stage-has-aggregations? (source-final-stage-has-aggregations? source)
            :operations                      []}
           operations)))
