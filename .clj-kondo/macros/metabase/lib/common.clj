(ns macros.metabase.lib.common)

(defmacro defop
  [op-name & argvecs]
  `(do
     (defn ~(symbol (str (name op-name) "-clause"))
       ~(format "Create a standalone clause of type `%s`." (name op-name))
       ~@(for [argvec argvecs
               :let [arglist-expr (if (contains? (set argvec) '&)
                                    (cons 'list* (remove #{'&} argvec))
                                    argvec)]]
           `([~'query ~'stage-number ~@argvec]
             [~(keyword op-name) ~'query ~'stage-number ~@arglist-expr])))

     (defn ~op-name
       ~(format "Create a closure of clause of type `%s`." (name op-name))
       ~@(for [argvec argvecs
               :let [arglist-expr (if (contains? (set argvec) '&)
                                    (cons 'list* (remove #{'&} argvec))
                                    argvec)]]
           `([~@argvec]
             (fn ~(symbol (str (name op-name) "-closure"))
               [~'query ~'stage-number]
               (apply ~(symbol (str (name op-name) "-clause")) ~'query ~'stage-number ~@arglist-expr)))))))
