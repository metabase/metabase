(ns macros.metabase.api.common)

(defmacro define-routes [& args]
  `(do (def ~'routes)
       ~@args))
