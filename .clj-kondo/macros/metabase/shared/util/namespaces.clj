(ns macros.metabase.shared.util.namespaces)

(defmacro import-fn
  ([sym]
   `(def ~(-> sym name symbol) "docstring" ~sym))
  ([sym name]
   `(def ~name "docstring" ~sym)))
