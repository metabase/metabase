(ns macros.metabase.parameters.chain-filter-test)

(defmacro chain-filter [& _]
  `(metabase.parameters.chain-filter/chain-filter nil nil))
