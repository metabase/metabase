(ns metabase.lib.analysis-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.lib.analysis :as analysis]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.column :as column]
   [metabase.lib.test-metadata :as meta]
   [metabase.test-runner.assert-exprs.approximately-equal]))

(deftest ^:parallel basic-habit-test
  (let [mp meta/metadata-provider
        table (lib.metadata/table mp (meta/id :orders))
        query (lib/query mp table)
        columns (zipmap (map :display-name (lib/returned-columns query))
                        (lib/returned-columns query))
        created-at-field (column/column-unique-key (columns "Created At"))
        user-id-field (column/column-unique-key (columns "User ID"))
        analysis {:kind "habit"
                  :base_query query
                  :columns.person user-id-field
                  :columns.timestamp created-at-field
                  :habit.values "count" ; or "percent"
                  :granularity "day"}]
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
    ;; TODO: blocked on window functions
    #_(testing "habit with percent"
        (let [analysis (assoc analysis :habit.values "percent")]
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
    #_(testing "breakout field ref setting")))
