(ns metabase.agent-lib.validate.cross-checks
  "Cross-operation semantic checks for structured programs."
  (:require
   [metabase.agent-lib.common.errors :refer [invalid-program!]]
   [metabase.agent-lib.runtime :as runtime]
   [metabase.agent-lib.syntax :as syntax]
   [metabase.agent-lib.validate.walker :as walker]))

(set! *warn-on-reflection* true)

(defn validate-no-metric-order-by!
  "Reject direct metric helpers nested inside `order-by`."
  [operation-path operation]
  (when (= 'order-by (runtime/op-symbol (first operation)))
    (when-let [metric-path
               (walker/find-tuple-path #(and (syntax/operator-tuple? %)
                                             (= 'metric (runtime/op-symbol (first %))))
                                       operation)]
      (invalid-program! (into operation-path metric-path)
                        "metric helpers cannot be used directly inside order-by. Order by a breakout field or a non-metric aggregation instead."
                        {:operator "metric"}))))

(defn validate-no-source-metric-reuse!
  "Reject reusing the same metric already selected as the source."
  [context operation-path operation]
  (let [source-entity (:source-entity context)
        source-id     (:id source-entity)]
    (when (and (= "metric" (:model source-entity))
               (pos-int? source-id))
      (when-let [metric-path
                 (walker/find-tuple-path #(and (syntax/operator-tuple? %)
                                               (= 'metric (runtime/op-symbol (first %)))
                                               (= source-id (second %)))
                                         operation)]
        (invalid-program! (into operation-path metric-path)
                          (str "source is already metric " source-id
                               ". Do not reference that same metric again inside operations; start "
                               "from the source query and build on it.")
                          {:operator "metric"
                           :id       source-id})))))
