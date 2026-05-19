(ns metabase.agent-lib.validate.program
  "Recursive semantic program validation for agent-lib.

  The local `letfn` in `validate-program-body!` is intentional: this namespace
  is the recursive validation boundary for nested structured programs."
  (:require
   [clojure.string :as str]
   [metabase.agent-lib.common.errors :refer [invalid-program!]]
   [metabase.agent-lib.runtime :as runtime]
   [metabase.agent-lib.schema :as schema]
   [metabase.agent-lib.syntax :as syntax]
   [metabase.agent-lib.validate.context :as validate.context]
   [metabase.agent-lib.validate.cross-checks :as cross-checks]
   [metabase.agent-lib.validate.operators :as operators]
   [metabase.agent-lib.validate.walker :as walker]))

(set! *warn-on-reflection* true)

(defn validate-program-body!
  "Validate a repaired structured program body, threading traversal state."
  [allowed-ids context path program depth state]
  (letfn [(semantic-visit [path value depth state]
            (cond
              (schema/program-literal? value)
              (validate-program* (conj path :program) (:program value) (inc depth)
                                 (update state :program-nesting (fnil inc 0)))

              (vector? value)
              (do
                (when (and (some-> (first value) syntax/raw-op-name)
                           (str/ends-with? (some-> (first value) syntax/raw-op-name) "-ref")
                           (not (#{"expression-ref" "aggregation-ref"}
                                 (some-> (first value) syntax/raw-op-name))))
                  (invalid-program! (conj path 0)
                                    "unknown helper reference"
                                    {:operator (syntax/raw-op-name (first value))}))
                (when (syntax/operator-tuple? value)
                  (let [[raw-op & args] value
                        op             (runtime/op-symbol raw-op)]
                    (operators/validate-operator-specific! allowed-ids context path value)
                    (operators/ensure-arity! path op (count args))))
                state)

              :else
              state))
          (validate-node [path value depth state]
            (walker/walk-node path value depth state semantic-visit))
          (validate-program* [path program depth state]
            (let [nesting (get state :program-nesting 0)]
              (when (> nesting walker/max-program-nesting)
                (invalid-program! path "program source nesting exceeds maximum depth")))
            (when (> (count (:operations program)) walker/max-operations)
              (invalid-program! (conj path :operations) "program exceeds maximum operation count"))
            (let [state (validate.context/validate-source! validate-program*
                                                           allowed-ids
                                                           (conj path :source)
                                                           (:source program)
                                                           depth
                                                           state)]
              (reduce (fn [state [idx operation]]
                        (let [operation-path (into path [:operations idx])]
                          (cross-checks/validate-no-metric-order-by! operation-path operation)
                          (cross-checks/validate-no-source-metric-reuse! context operation-path operation)
                          (operators/validate-top-level-operation! validate-node
                                                                   operation-path
                                                                   operation
                                                                   state)))
                      state
                      (map-indexed vector (:operations program)))))]
    (validate-program* path program depth state)))
