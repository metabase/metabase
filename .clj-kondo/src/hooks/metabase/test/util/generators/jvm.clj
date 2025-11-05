(ns hooks.metabase.test.util.generators.jvm
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn with-random-cards
  "(with-random-cards <metadata-provider> <integer-count-value> & body-forms)"
  [{{:keys [children] :as node} :node :as orig}]
  (let [[token num-cards & body-nodes] children
        node* (-> (hooks/list-node
                   (list token num-cards
                         (hooks/list-node (list* (hooks/token-node 'let)
                                                 (hooks/vector-node [(hooks/token-node '&cards) (hooks/list-node ())])
                                                 body-nodes))))
                  (with-meta (meta node)))]
    (assoc orig :node node*)))
