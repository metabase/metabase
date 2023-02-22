(ns macros.metabase.api.common)

(defmacro define-routes [& args]
  `(do (def ~'routes "docstring" nil)
       ~@args))
