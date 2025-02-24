(ns hooks.metabase.test.gentest
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn with-gentest
  "(with-gentest {:as limit-spec} [s1 val1 & more] body-form body-form...)"
  [{{:keys [children] :as node} :node :as orig}]
  (let [[token limit-spec bindings & body-nodes] children
        node* (-> (hooks/list-node
                   (list token limit-spec
                         (hooks/list-node (list* (hooks/token-node 'let) bindings
                                                 body-nodes))))
                  (with-meta (meta node)))]
    (assoc orig :node node*)))
