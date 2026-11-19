(ns metabase.measures.replacement
  "The functions of the replacement spec of a Measure."
  (:require
   [metabase.queries.core :as queries]
   [metabase.replacement.core :as replacement]))

(set! *warn-on-reflection* true)

(defn upgrade-field-refs
  "The writes that upgrade the field refs of the definition of `measure`."
  [measure]
  (replacement/upgrade-definition-field-refs :model/Measure measure))

(defn swap-source
  "The writes that swap `old-source` for `new-source` in the definition of `measure`, or nil when it is not valid."
  [measure old-source new-source]
  (replacement/swap-definition-source :model/Measure measure old-source new-source
                                      queries/query->database-and-table-ids))
