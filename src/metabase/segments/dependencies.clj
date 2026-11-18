(ns metabase.segments.dependencies
  "The functions of the dependencies spec of a Segment."
  (:require
   [metabase.dependencies.core :as dependencies]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]))

(set! *warn-on-reflection* true)

(defn analysis
  "The errors of the definition of `segment`."
  [{:keys [definition]}]
  (dependencies/query-errors (lib-be/normalize-query definition)))

(defn dependencies
  "The dependencies of `segment`: the segments its definition uses, and its table and those it joins implicitly."
  [{:keys [table_id definition]}]
  {:segment (or (lib/all-segment-ids definition) #{})
   :table   (cond-> (into #{} (lib/all-implicitly-joined-table-ids definition))
              table_id (conj table_id))})
