(ns macros.metabase.api.common
  (:require
   [clojure.string :as str]))

(defmacro define-routes
  "Macro for api.common/define-routes"
  [& args]
  `(do (def ~'routes "docstring" nil)
       ~@args))

(defn route-fn-name
  "route fn hook"
  [method route]
  (let [route (if (vector? route) (first route) route)]
    (-> (str (name method) route)
        (str/replace #"/" "_")
        symbol)))

(defmacro defendpoint
  "Macro for api.common/defendpoint*"
  [method route & body]
  (let [method-fn  (symbol "compojure.core" (str method))
        route-name (route-fn-name method route)]
    `(do
       ~method-fn
       (defn ~route-name ~@body))))
