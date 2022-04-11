(ns hooks.toucan.util.test
  (:require [clj-kondo.hooks-api :as api]))

(defn with-temp [{:keys [node]}]
  (let [[_ db-ref binding+opts & body] (:children node)
        [args opts] (:children binding+opts)]
    {:node (api/vector-node [db-ref
                             opts
                             (api/list-node (list* (api/token-node 'fn)
                                                   (api/vector-node [args])
                                                   body))])}))
