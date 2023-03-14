(ns macros.metabase.lib.common)

(defmacro defop
  [op-name argv]
  `(defn ~op-name "docstring"
     ([~@argv]
      ~(remove #{'&} argv))
     ([~'query ~'stage ~@argv]
      ~(into ['query 'stage] (remove #{'&} argv)))))
