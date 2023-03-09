(ns macros.metabase.lib.expression)

(defmacro defexpression
  [expression-name argv]
  `(defn ~expression-name "docstring" ~argv
     ~(remove #{'&} argv)))
