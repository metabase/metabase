(ns macros.metabase.lib.filter)

(defmacro deffilter
  [filter-name argv]
  `(defn ~filter-name "docstring" ~argv
     ~(remove #{'&} argv)))
