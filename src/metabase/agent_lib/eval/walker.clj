(ns metabase.agent-lib.eval.walker
  "Recursive structured-value evaluation for agent-lib.

  The local `letfn` in `evaluate-node` is intentional: this namespace is the
  recursive evaluation boundary for nested structured program values."
  (:require
   [metabase.agent-lib.common.coercions :refer [normalize-map-key]]
   [metabase.agent-lib.common.errors :refer [invalid-program!]]
   [metabase.agent-lib.common.literals :refer [scalar-literal?]]
   [metabase.agent-lib.eval.args :as eval.args]
   [metabase.agent-lib.eval.invoke :as eval.invoke]
   [metabase.agent-lib.runtime :as runtime]
   [metabase.agent-lib.schema :as schema]
   [metabase.agent-lib.syntax :as syntax]))

(set! *warn-on-reflection* true)

(defn evaluate-args
  "Evaluate and normalize helper arguments in the current query context."
  [evaluate-node current-query node-path op raw-args]
  (->> raw-args
       (map-indexed (fn [idx arg]
                      (evaluate-node current-query (conj node-path (inc idx)) arg)))
       vec
       (eval.args/normalize-helper-args node-path op)))

(defn evaluate-node
  "Evaluate a nested structured value in the current query context."
  [evaluate-program runtime current-query node-path value]
  (letfn [(walk [current-query node-path value]
            (cond
              (scalar-literal? value)
              value

              (map? value)
              (if (schema/program-literal? value)
                (evaluate-program (conj node-path :program) (:program value))
                (into {}
                      (map (fn [[k v]]
                             [(normalize-map-key k)
                              (walk current-query (conj node-path (normalize-map-key k)) v)]))
                      value))

              (vector? value)
              (if (syntax/operator-tuple? value)
                (let [[raw-op & raw-args] value
                      op                 (runtime/op-symbol raw-op)
                      op-name            (name op)]
                  (cond
                    (syntax/top-level-operation-symbols op)
                    (invalid-program! node-path
                                      (format "`%s` is a top-level operation and cannot be nested" op-name)
                                      {:operator op-name})

                    (= op 'query)
                    (invalid-program! node-path
                                      "`query` cannot appear inside operations; the program source already defines the base query."
                                      {:operator "query"})

                    (= op 'field)
                    (eval.invoke/invoke-field-helper! runtime
                                                      current-query
                                                      node-path
                                                      (evaluate-args walk current-query node-path 'field raw-args))

                    ('#{expression-ref aggregation-ref} op)
                    (eval.invoke/invoke-query-aware-helper! runtime
                                                            current-query
                                                            node-path
                                                            op
                                                            (evaluate-args walk current-query node-path op raw-args))

                    :else
                    (eval.invoke/invoke-helper! runtime
                                                node-path
                                                op
                                                (evaluate-args walk current-query node-path op raw-args))))
                (mapv (fn [[idx element]]
                        (walk current-query (conj node-path idx) element))
                      (map-indexed vector value)))

              (sequential? value)
              (mapv (fn [[idx element]]
                      (walk current-query (conj node-path idx) element))
                    (map-indexed vector value))

              :else
              value))]
    (walk current-query node-path value)))
