(ns macros.metabase.lib.common)

(defmacro defop
  [op-name & argvecs]
  `(defn ~op-name
     ~(format "Create a standalone clause of type `%s`." (name op-name))
     ~@(for [argvec argvecs
             :let [arglist-expr (if (contains? (set argvec) '&)
                                  (cons 'list* (remove #{'&} argvec))
                                  argvec)]]
         `([~@argvec]
           [~(keyword op-name) ~@arglist-expr]))))
