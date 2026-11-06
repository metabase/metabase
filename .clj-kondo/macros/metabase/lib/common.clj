(ns macros.metabase.lib.common)

(defmacro defop
  [op-name & argvecs]
  ;; `/-clause` is not a valid symbol name, so the helpers for `/` are named `divide-clause` and `divide-closure`.
  (let [helper-prefix (if (= "/" (name op-name)) "divide" (name op-name))]
    `(do
       (defn ~(symbol (str helper-prefix "-clause"))
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
               (fn ~(symbol (str helper-prefix "-closure"))
                 [~'query ~'stage-number]
                 (apply ~(symbol (str helper-prefix "-clause")) ~'query ~'stage-number ~@arglist-expr))))))))
