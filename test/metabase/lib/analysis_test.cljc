(ns metabase.lib.analysis-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.analysis :as analysis]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]))

(deftest ^:parallel basic-habit-test
  (let [mp meta/metadata-provider
        created-at-field (lib.metadata/field mp (meta/id :orders :created-at))
        user-id-field (lib.metadata/field mp (meta/id :orders :user-id))
        table (lib.metadata/table mp (meta/id :orders))
        query (lib/query mp table)
        analysis {:kind "habit"
                  :query query
                  :columns.person user-id-field
                  :columns.timestamp created-at-field
                  :from "2026-03-11"
                  :granularity "day" ; or "week"
                  ;; :breakout [field ref] (depends on window functions)
                  ;; :habit.active [expression] (second stage filter)
                  ;; :habit.values "counts" | "percent" (second stage aggregation)
                  }]
    (is (=? {:lib/type :mbql/query
             :stages [{:lib/type :mbql.stage/mbql
                       :source-table (:id table)
                       :aggregation
                       [[:distinct {}
                         [:field {:effective-type :type/DateTimeWithLocalTZ
                                  :base-type :type/DateTimeWithLocalTZ
                                  :temporal-unit :day}
                          (:id created-at-field)]]]
                       :breakout [[:field {:effective-type :type/Integer
                                           :base-type :type/Integer}
                                   (:id user-id-field)]]}
                      {:lib/type :mbql.stage/mbql
                       :aggregation [[:count {}]]
                       :breakout [[:field {:effective-type :type/Integer
                                           :base-type :type/Integer}
                                   "count"]]}]}
            (analysis/->mbql analysis)))))
