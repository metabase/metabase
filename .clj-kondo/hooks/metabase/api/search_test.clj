(ns hooks.metabase.api.search-test
  (:require [clj-kondo.hooks-api :as hooks]))

(defn with-search-items-in-collection [{{[_ & args] :children, :as node} :node}]
  ;; (println \newline)
  ;; (clojure.pprint/pprint (hooks/sexpr node))
  (let [[created-items-sym search-string & body] args
        node*                                    (hooks/list-node
                                                  (list*
                                                   (hooks/token-node 'let)
                                                   (hooks/vector-node
                                                    [created-items-sym (hooks/token-node 'nil)])
                                                   search-string
                                                   body))]
    ;; (println '=>)
    ;; (clojure.pprint/pprint (hooks/sexpr node*))
    {:node node*}))
