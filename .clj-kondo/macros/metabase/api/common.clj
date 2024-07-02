(ns macros.metabase.api.common)

(defmacro define-routes
  "Macro for api.common/define-routes"
  [& args]
  `(do (def ~'routes "docstring" nil)
       ~@args))
