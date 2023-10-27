(ns hooks.metabase.api.automagic-dashboards-test
  (:require [clj-kondo.hooks-api :as hooks]))

(comment

  (def input (hooks/parse-string
              "(with-indexed-model [{:keys [model model-index model-index-value]}
                                    {:query :some-query}]
                  :foo :bar :body)"))

  (println (hooks/sexpr input))

  (let [f (load-file ".clj-kondo/hooks/metabase/api/automagic_dashboards_test.clj")]
    (f {:node input})))

(defn with-indexed-model
  [{node :node}]
  (let [[_macro-call binding-and-query-info & body] (:children node)
        [binding query-info] (:children binding-and-query-info)
        node* (hooks/list-node
               [(hooks/token-node 'do-with-testing-model)
                query-info
                (hooks/list-node
                 (list* (hooks/token-node 'fn)
                        (hooks/vector-node [binding])
                        body))])]
    #_(println (hooks/sexpr node*))
    {:node node*}))
