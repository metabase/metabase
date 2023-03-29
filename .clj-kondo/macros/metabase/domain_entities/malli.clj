(ns macros.metabase.domain-entities.malli)

(defmacro define-getters-and-setters [schema & defs]
  `(do
     (comment ~schema) ;; Reference the schema
     ~@(for [[sym _path] (partition 2 defs)]
         `(do
            (defn ~sym "docs" [_x#] nil)
            (defn ~(symbol (str "with-" (name sym))) "docs" [x# _new#] x#)
            (defn ~(symbol (str (name sym) "-js")) "docs" [x#] x#)))))
