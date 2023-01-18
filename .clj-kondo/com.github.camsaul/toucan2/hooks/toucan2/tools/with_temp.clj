(ns hooks.toucan2.tools.with-temp
  (:require [clj-kondo.hooks-api :as hooks]))

(defn with-temp [{{[_with-temp {bindings :children} & body] :children} :node}]
  (let [bindings* (into
                   []
                   (comp (partition-all 3)
                         (mapcat (fn [[model binding attributes]]
                                   (let [binding    (or binding (hooks/token-node '_))
                                         attributes (or attributes (hooks/token-node 'nil))]
                                     [binding (hooks/list-node
                                               (list
                                                (hooks/token-node 'do)
                                                model
                                                attributes))]))))
                   bindings)
        node*         (hooks/list-node
                       (list*
                        (hooks/token-node 'let)
                        (hooks/vector-node bindings*)
                        body))]
    {:node node*}))
