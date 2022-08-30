(ns hooks.common
  (:require [clj-kondo.hooks-api :as hooks]))

(defn do* [{{[_ & args] :children, :as node} :node}]
  #_(clojure.pprint/pprint (hooks/sexpr node))
  (let [node* (hooks/list-node
               (list*
                (hooks/token-node 'do)
                args))]
    #_(clojure.pprint/pprint (hooks/sexpr node*))
    {:node node*}))
