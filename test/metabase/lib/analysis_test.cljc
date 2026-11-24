(ns metabase.lib.analysis-test
  (:require
   #?@(:cljs ([metabase.test-runner.assert-exprs.approximately-equal]))
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.analysis :as analysis]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.column :as column]
   [metabase.lib.test-metadata :as meta]))

#?(:cljs (comment metabase.test-runner.assert-exprs.approximately-equal/keep-me))

(deftest ^:parallel basic-habit-test
  (let [mp meta/metadata-provider
        table (lib.metadata/table mp (meta/id :orders))
        query (lib/query mp table)
        columns (zipmap (map :display-name (lib/returned-columns query))
                        (lib/returned-columns query))
        created-at-field (column/column-unique-key (columns "Created At"))
        user-id-field (column/column-unique-key (columns "User ID"))
        analysis {:kind :habit
                  :base-query query
                  :columns.person user-id-field
                  :columns.timestamp created-at-field
                  :habit.values :count ; or :percent
                  :granularity :day}]
    (testing "basic habit"
      (is (=? {:lib/type :mbql/query
               :stages [{:lib/type :mbql.stage/mbql
                         :source-table (:id table)
                         :aggregation
                         [[:distinct {:name "periods"}
                           [:field {:effective-type :type/DateTimeWithLocalTZ
                                    :base-type :type/DateTimeWithLocalTZ
                                    :temporal-unit :day}
                            (:id (columns "Created At"))]]]
                         :breakout [[:field {:effective-type :type/Integer
                                             :base-type :type/Integer}
                                     (:id (columns "User ID"))]]}
                        {:lib/type :mbql.stage/mbql
                         :aggregation [[:count {:name "people"}]]
                         :breakout [[:field {:effective-type :type/Integer
                                             :base-type :type/Integer}
                                     "periods"]]}]}
              (analysis/->mbql analysis))))
    (testing "habit with percent"
      (let [analysis (assoc analysis :habit.values :percent)]
        (is (=? {:lib/type :mbql.stage/mbql
                 :aggregation [[:/ {:name "people"}
                                [:count {}]
                                [:window {}
                                 [:sum {} [:count {}]]
                                 {:partition-by []}]]]}
                (-> (analysis/->mbql analysis)
                    :stages
                    second)))))))
