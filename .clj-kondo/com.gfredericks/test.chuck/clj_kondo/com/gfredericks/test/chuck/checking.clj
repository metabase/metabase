(ns clj-kondo.com.gfredericks.test.chuck.checking
  (:require
   [clj-kondo.hooks-api :as api]))

(defn checking
  [{{:keys [children]} :node}]
  (let [[_checking desc & opt+bindings+body] children
        [opts binding-vec & body]             (if (api/vector-node? (first opt+bindings+body))
                                                (into [(api/map-node {})] opt+bindings+body)
                                                opt+bindings+body)]
    (when-not (even? (count (:children binding-vec)))
      (throw (ex-info "checking requires an even number of bindings" {})))
    {:node (api/list-node
            (list*
             (api/token-node 'let)
             (api/vector-node (into [(api/token-node (symbol (gensym "_checking-desc"))) desc]
                                    (:children binding-vec)))
             opts
             body))}))
