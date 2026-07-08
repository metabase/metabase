(ns hooks.taoensso.nippy
  (:require [clj-kondo.hooks-api :as api]))

(defn extend-thaw
  [{:keys [node]}]
  (let [[_ _ arglist & body] (:children node)]
    {:node (with-meta (api/list-node
                       (list*
                        (api/token-node 'fn)
                        arglist
                        body))
                      (meta node))}))

(defn extend-freeze
  [{:keys [node]}]
  (let [[_ _ _ arglist & body] (:children node)]
    {:node (with-meta (api/list-node
                       (list*
                        (api/token-node 'fn)
                        arglist
                        body))
                      (meta node))}))
