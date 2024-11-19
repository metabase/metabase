(ns hooks.metabase.util.log.capture
  (:require
   [clj-kondo.hooks-api :as api]))

(defn with-log-messages-for-level [x]
  (letfn [(update-binding [[lhs-node _rhs-node]]
            [lhs-node (api/list-node
                       (list
                        (api/token-node 'clojure.core/fn)
                        (api/vector-node [])))])
          (update-bindings [bindings-node]
            (-> (api/vector-node
                 (into []
                       (comp (partition-all 2)
                             (mapcat update-binding))
                       (:children bindings-node)))
                (with-meta (meta bindings-node))))
          (update-node [node]
            (let [[_with-log-messages-for-level bindings & body] (:children node)]
              (-> (api/list-node
                   (list*
                    (api/token-node 'clojure.core/let)
                    (update-bindings bindings)
                    body))
                  (with-meta (meta node)))))]
    (update x :node update-node)))
