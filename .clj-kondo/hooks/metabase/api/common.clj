(ns hooks.metabase.api.common
  (:require
   [clj-kondo.hooks-api :as hooks]
   [clojure.string :as str]
   [hooks.common :as common]))

(defn route-fn-name
  "route fn hook"
  [method route]
  (let [route (if (vector? route) (first route) route)]
    (-> (str (name method) route)
        (str/replace #"/" "_")
        symbol)))

(defn defendpoint
  "defendpoint hook"
  [{:keys [node]}]
  (let [[method route & body] (rest (:children node))]
    {:node
     (hooks/vector-node [;; register usage of compojure core var
                         (common/with-macro-meta (hooks/token-node (symbol (str "compojure.core")
                                                                           (str method)))
                           node)
                         ;; define function with route-fn-name
                         (hooks/list-node
                           (list* (common/with-macro-meta (hooks/token-node 'clojure.core/defn)
                                    node)
                                  (route-fn-name (hooks/sexpr method) (hooks/sexpr route))
                                  body))])}))
