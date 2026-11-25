(ns metabase.measures.dependencies
  "The functions of the dependencies spec of a Measure."
  (:require
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(defn dependencies
  "The dependencies of `measure`: the measures and segments its definition uses, and its table and those it joins
  implicitly."
  [{:keys [table_id definition]}]
  {:measure (or (lib/all-measure-ids definition) #{})
   :segment (or (lib/all-segment-ids definition) #{})
   :table   (cond-> (into #{} (lib/all-implicitly-joined-table-ids definition))
              table_id (conj table_id))})
