(ns macros.metabase.lib.filter)

(defmacro deffilter
  [filter-name argv]
  (let [argv (into ['query 'stage] (remove #{'&} argv))]
    `(defn ~filter-name "docstring" ~argv
       ~argv)))
