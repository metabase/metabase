(ns metabase.lib.analysis-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.analysis :as analysis]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.test :as mt]))

(deftest basic-habit-test
  (let [mp (mt/metadata-provider)
        table (lib.metadata/table (mt/metadata-provider) (mt/id :orders))
        created-at-field (lib.metadata/field mp (mt/id :orders :created_at))
        user-id-field (lib.metadata/field mp (mt/id :orders :user_id))
        analysis {:table_id (:id table)
                  :timestamp_column (:id created-at-field)
                  :person_column (:id user-id-field)
                  :kind "habit"
                  :filters []}]
    (is (=? {:lib/type :mbql/query
             :stages [{:lib/type :mbql.stage/mbql
                       :source-table (:id table)
                       :aggregation
                       [[:distinct {}
                         [:field {:effective-type :type/DateTimeWithLocalTZ
                                  :base-type :type/DateTimeWithLocalTZ}
                          (:id created-at-field)]]]
                       :breakout [[:field {:effective-type :type/Integer
                                           :base-type :type/Integer}
                                   (:id user-id-field)]]}
                      {:lib/type :mbql.stage/mbql
                       :aggregation [[:count {}]]
                       :breakout [[:field {:effective-type :type/Integer
                                           :base-type :type/Integer}
                                   "count"]]}]}
            (analysis/->mbql mp analysis)))))
