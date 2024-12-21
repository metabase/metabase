(ns hooks.metabase.api.macros
  (:require
   [clj-kondo.hooks-api :as api]))

(defn defendpoint
  [arg]
  (letfn [(update-defendpoint [node]
            (let [[defendpoint method route & more] (:children node)
                  [result-schema & more] (if (= (api/sexpr (first more)) :-)
                                           (drop 1 more)
                                           (cons nil more))
                  [_docstring & more] (if (api/string-node? (first more))
                                        more
                                        (cons nil more))
                  [metadata & more] (if (api/map-node? (first more))
                                      more
                                      (cons nil more))
                  [params & body] more
                  [bindings schemas] (when (api/vector-node? params)
                                       (loop [bindings [], schemas [], [x y & more] (:children params)]
                                         (cond
                                           (not x)
                                           [bindings schemas]

                                           (= (api/sexpr x) :-)
                                           (recur bindings (conj schemas y) more)

                                           :else
                                           (recur (conj bindings x) schemas (cons y more)))))]
              (-> (api/list-node
                   (list
                    (api/token-node 'do)
                    defendpoint
                    method
                    route
                    (api/list-node
                     (list*
                      (api/token-node 'do)
                      (filter some? (list* metadata result-schema schemas))))
                    (api/list-node
                     (list*
                      (api/token-node `let)
                      (api/vector-node (into []
                                             (mapcat (fn [a-binding]
                                                       [a-binding (api/token-node nil)]))
                                             bindings))
                      body))))
                  (with-meta (meta node)))))]
    (update arg :node update-defendpoint)))
