(ns hooks.metabase.api.common
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.string :as str]
   [hooks.common]))

(defn route-fn-name
  "route fn hook"
  [method route]
  (let [route (if (vector? route) (first route) route)]
    (-> (str (name method) route)
        (str/replace #"/" "_")
        symbol)))

(defn defendpoint
  [arg]
  (letfn [(update-defendpoint [node]
            (let [[_defendpoint method route & body] (:children node)]
              (-> (api/list-node
                   (list
                    (api/token-node 'do)
                    (-> (api/token-node (symbol "compojure.core" (str (api/sexpr method))))
                        (with-meta (meta method)))
                    (api/list-node
                     (list*
                      (api/token-node 'clojure.core/defn)
                      (-> (api/token-node (route-fn-name (api/sexpr method) (api/sexpr route)))
                          (with-meta (meta route)))
                      body))))
                  (with-meta (meta node))
                  hooks.common/add-lsp-ignore-unused-public-var-metadata)))]
    (update arg :node update-defendpoint)))
