(ns macros.metabase.models.params.chain-filter-test)

(defmacro chain-filter [& _]
  `(metabase.models.params.chain-filter/chain-filter nil nil))
