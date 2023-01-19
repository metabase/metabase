(ns hooks.com.github.seancorfield.next-jdbc
  (:require [clj-kondo.hooks-api :as api]))

(defn with-transaction
  "Expands (with-transaction [tx expr opts] body)
  to (let [tx expr] opts body) pre clj-kondo examples."
  [{:keys [:node]}]
  (let [[binding-vec & body] (rest (:children node))
        [sym val opts] (:children binding-vec)]
    (when-not (and sym val)
      (throw (ex-info "No sym and val provided" {})))
    (let [new-node (api/list-node
                    (list*
                     (api/token-node 'let)
                     (api/vector-node [sym val])
                     opts
                     body))]
      {:node new-node})))
