(ns macros.metabase.lib.filter)

(defmacro deffilter
  [filter-name argv]
  `(defn ~filter-name "docstring" [~'query ~'stage ~@argv]
     ~(into ['query 'stage] (remove #{'&} argv))))
