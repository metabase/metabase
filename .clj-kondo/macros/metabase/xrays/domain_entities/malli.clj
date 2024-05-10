(ns macros.metabase.xrays.domain-entities.malli)

(defmacro define-getters-and-setters [schema & defs]
  `(do
     (comment ~schema) ;; Reference the schema
     ~@(for [[sym _path] (partition 2 defs)]
         `(do
            (defn ~(vary-meta sym
                              assoc :export true)
              "docs" [_x#] nil)
            (defn ~(vary-meta (symbol (str "with-" (name sym)))
                              assoc :export true)
              "docs" [x# _new#] x#)
            (defn ~(vary-meta (symbol (str (name sym) "-js"))
                              assoc :export true)
              "docs" [x#] x#)))))
