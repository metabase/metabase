(ns macros.metabase.queries-rest.api.card-test)

(defmacro with-ordered-items
  [collection model-and-name-syms & body]
  `(let ~(into []
               (comp (partition-all 2)
                     (mapcat (fn [[model binding]]
                               [binding model])))
               model-and-name-syms)
     ~collection
     ~@(->> (partition-all 2 model-and-name-syms)
            (map second))
     ~@body))
