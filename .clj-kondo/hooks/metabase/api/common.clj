(ns hooks.metabase.api.common
  (:require
   [clj-kondo.hooks-api :as api]
   [clojure.string :as str]))

(defn route-fn-name
  [method route]
  (let [route (if (vector? route) (first route) route)]
    (-> (str (name method) route)
        (str/replace #"/" "_")
        symbol)))

(defn defendpoint [{:keys [node]}]
  (let [[method route ?doc ?argvec & body] (rest (:children node))]
    {:node
     (api/list-node (list* (api/token-node 'clojure.core/defn)
                           (route-fn-name (api/sexpr method) (api/sexpr route))
                           ?doc ?argvec
                           (api/token-node (symbol (str "compojure.core")
                                                   (str method)))
                           body))}))
