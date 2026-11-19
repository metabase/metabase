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
                  :granularity "day"}]
    (testing "basic habit"
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
              (analysis/->mbql analysis))))
    (testing "habit with active filter and percent"
      (let [active-expr (lib/= 12 user-id-field)
            analysis (assoc analysis
                            :habit.active active-expr
                            :habit.values "percent")]
        (is (=? {:lib/type :mbql.stage/mbql
                 :aggregation [[:count {}]]
                 :filters [[:= {} 12
                            [:field {:effective-type :type/Integer
                                     :base-type :type/Integer}
                             (:id user-id-field)]]]
                 :breakout [[:field {:effective-type :type/Integer
                                     :base-type :type/Integer}
                             "count"]]}
                (-> (analysis/->mbql analysis)
                    :stages second)))))
    ;; TODO: blocked on window functions
    #_(testing "breakout field ref setting")))
