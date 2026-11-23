(ns metabase.segments.replacement
  "The functions of the replacement spec of a Segment."
  (:require
   [metabase.queries.core :as queries]
   [metabase.replacement.core :as replacement]))

(set! *warn-on-reflection* true)

(defn upgrade-field-refs
  "The writes that upgrade the field refs of the definition of `segment`."
  [segment]
  (replacement/upgrade-definition-field-refs :model/Segment segment))

(defn swap-source
  "The writes that swap `old-source` for `new-source` in the definition of `segment`, or nil when it is not valid."
  [segment old-source new-source]
  (replacement/swap-definition-source :model/Segment segment old-source new-source
                                      queries/query->database-and-table-ids))
