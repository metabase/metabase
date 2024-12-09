(ns macros.metabase.util.namespaces)

(defmacro import-fn
  "Kondo macro replacement for [[metabase.util.namespaces/import-fn]]."
  ([sym]
   `(def ~(-> sym name symbol) "docstring" ~sym))
  ([sym name]
   `(def ~name "docstring" ~sym)))
