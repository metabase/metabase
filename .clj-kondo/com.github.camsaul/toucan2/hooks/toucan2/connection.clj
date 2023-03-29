(ns hooks.toucan2.connection
  (:require [clj-kondo.hooks-api :as hooks]))

(defn with-connection [{{[_ bindings & body] :children} :node}]
  (let [[conn-binding connectable] (:children bindings)]
    {:node (hooks/list-node
            (list*
             (hooks/token-node 'let)
             (hooks/vector-node [conn-binding (or connectable
                                                  (hooks/token-node 'nil))])
             body))}))

(defn with-transaction [node]
  (with-connection node))
