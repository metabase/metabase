(ns httpkit.with-channel
  (:require [clj-kondo.hooks-api :as api]))

(defn with-channel [{node :node}]
  (let [[request channel & body] (rest (:children node))]
    (when-not (and request     channel) (throw (ex-info "No request or channel provided" {})))
    (when-not (api/token-node? channel) (throw (ex-info "Missing channel argument" {})))
    (let [new-node
          (api/list-node
            (list*
              (api/token-node 'let)
              (api/vector-node [channel (api/vector-node [])])
              request
              body))]

      {:node new-node})))
