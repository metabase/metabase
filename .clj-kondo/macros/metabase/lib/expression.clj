(ns macros.metabase.lib.expression)

(defmacro defexpression
  [expression-name argv]
  `(defn ~expression-name "docstring" [~'query ~'stage ~@argv]
     ~(into ['query 'stage] (remove #{'&} argv))))
