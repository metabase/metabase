(ns hooks.metabase.query-processor-test.expressions-test
  (:require
   [clj-kondo.hooks-api :as hooks]
   [hooks.metabase.test.data :as data]))

(defn calculate-bird-scarcity
  [{{[_ formula filter-clause] :children} :node}]
  (let [formula*       (data/replace-$id-special-tokens formula)
        filter-clause* (or (some-> filter-clause data/replace-$id-special-tokens)
                           (hooks/token-node 'nil))
        node*          (hooks/list-node
                        (list
                         (hooks/token-node 'do)
                         formula*
                         filter-clause*))]
    {:node node*}))
