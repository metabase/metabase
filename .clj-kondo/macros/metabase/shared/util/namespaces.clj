(ns macros.metabase.shared.util.namespaces)

(defmacro import-fn
  "Kondo macro replacement for [[metabase.shared.util.namespaces/import-fn]]."
  ([sym]
   `(def ~(-> sym name symbol) "docstring" ~sym))
  ([sym name]
   `(def ~name "docstring" ~sym)))

(defmacro import-fns
  "Kondo macro replacement for [[metabase.shared.util.namespaces/import-fns]]."
  [& pairs]
  `(vector ~@(for [[from & syms] pairs
               sym           syms
               :let [args (gensym)]]
           (symbol (name from) (name sym))
           #_`(def ~sym "docstring" (fn [& ~args] (apply ~(symbol (name from) (name sym)) ~args))))))
