(ns metabase.agent-lib.eval
  "Structured MBQL program interpretation."
  (:require
   [metabase.agent-lib.common.errors :refer [invalid-program!]]
   [metabase.agent-lib.eval.invoke :as eval.invoke]
   [metabase.agent-lib.eval.source :as eval.source]
   [metabase.agent-lib.eval.walker :as eval.walker]
   [metabase.agent-lib.mbql-integration :as mbql]
   [metabase.agent-lib.runtime :as runtime]
   [metabase.agent-lib.validate :as validate]
   [metabase.agent-lib.validate.walker :as walker]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(defn- skip-operation?
  "True when an operation is a redundant implicit join that should be elided."
  [runtime query op operation]
  (and (= op 'join)
       ((get (:bindings runtime) 'skip-join?) query operation)))

(defn- apply-operation
  "Evaluate a single operation's args and invoke its helper against `query`."
  [evaluate-node runtime query op-path [raw-op & raw-args]]
  (let [op   (runtime/op-symbol raw-op)
        args (eval.walker/evaluate-args evaluate-node query op-path op raw-args)]
    (eval.invoke/invoke-helper! runtime op-path op (into [query] args))))

(defn- evaluate-program*
  [runtime context path program program-depth]
  (when (> program-depth walker/max-program-nesting)
    (invalid-program! path "program source nesting exceeds maximum depth"))
  (let [evaluate-program (fn [nested-path nested-program]
                           (evaluate-program* runtime context nested-path nested-program (inc program-depth)))
        evaluate-node    (fn [current-query node-path value]
                           (eval.walker/evaluate-node evaluate-program
                                                      runtime
                                                      current-query
                                                      node-path
                                                      value))
        resolved-source (eval.source/resolve-source evaluate-program
                                                    runtime
                                                    (conj path :source)
                                                    (:source program))
        source-query    (if (mbql/query? resolved-source)
                          resolved-source
                          (eval.invoke/invoke-helper! runtime (conj path :source) 'query [resolved-source]))
        final-query     (reduce (fn [query [op-idx operation]]
                                  (let [op-path (into path [:operations op-idx])
                                        op      (runtime/op-symbol (first operation))]
                                    (if (skip-operation? runtime query op operation)
                                      query
                                      (apply-operation evaluate-node runtime query op-path operation))))
                                source-query
                                (map-indexed vector (:operations program)))]
    (eval.invoke/ensure-query-result! final-query)))

(mu/defn evaluate-program :- :map
  "Validate and interpret a structured MBQL program."
  [program              :- :map
   metadata-providerable :- :any
   context               :- validate/EvaluationContext]
  (log/debugf "Evaluating structured program with %d operations" (count (:operations program)))
  (let [program (validate/validated-program program context)
        runtime (runtime/build-runtime metadata-providerable {'source (:source-metadata context)})]
    (evaluate-program* runtime context [] program 0)))
