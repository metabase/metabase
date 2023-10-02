(ns hooks.metabase.lib.test-util.macros
  (:require [clj-kondo.hooks-api :as hooks]))

(defn with-testing-against-standard-queries [{{[_ & args] :children} :node}]
  (let [[query-sym & body] args
        node* (hooks/list-node
                (list*
                  (hooks/token-node 'let)
                  (hooks/vector-node
                    [query-sym (hooks/token-node 'nil)])
                  body))]
    {:node node*}))
