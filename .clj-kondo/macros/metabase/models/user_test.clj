(ns macros.metabase.models.user-test)

(defmacro with-groups [bindings & body]
  `(let ~(into []
              (comp (partition-all 3)
                    (mapcat (fn [[group-binding properties members]]
                              [group-binding [properties members]])))
              bindings)
     ~@body))
