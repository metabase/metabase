(ns hooks.metabase.model-persistence.test-util
  (:require
   [clj-kondo.hooks-api :as hooks]))

(defn with-persistence-enabled! [x]
  (letfn [(update-node [node]
            (let [[_symb bindings & body] (:children node)
                  [fn-binding]            (:children bindings)]
              (-> (hooks/list-node
                   (list*
                    (hooks/token-node `let)
                    (hooks/vector-node
                     [fn-binding (hooks/list-node
                                  (list
                                   (hooks/token-node `fn)
                                   (hooks/vector-node [])))])
                    body))
                  (with-meta (meta node)))))]
    (update x :node update-node)))
