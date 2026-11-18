(ns metabase.segments.dependencies
  "The functions of the dependencies spec of a Segment."
  (:require
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(defn dependencies
  "The dependencies of `segment`: the segments its definition uses, and its table and those it joins implicitly."
  [{:keys [table_id definition]}]
  {:segment (or (lib/all-segment-ids definition) #{})
   :table   (cond-> (into #{} (lib/all-implicitly-joined-table-ids definition))
              table_id (conj table_id))})
