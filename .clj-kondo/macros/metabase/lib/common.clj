(ns macros.metabase.lib.common)

(defmacro defop
  [op-name & argvecs]
  `(defn ~op-name
     ~(format "Create a standalone clause of type `%s`." (name op-name))
     ~@(for [argvec argvecs]
         `([~@argvec]
           [~(keyword op-name) ~@(remove #{'&} argvec)]))))
