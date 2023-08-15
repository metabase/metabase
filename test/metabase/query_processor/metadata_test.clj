(ns metabase.query-processor.metadata-test
  "Tests for [[metabase.query-processor/query->expected-cols]]."
  (:require
   [clojure.test :refer :all]
   [metabase.query-processor.metadata :as qp.metadata]
   [metabase.test :as mt]))

(deftest deduplicate-column-names-test
  (testing "`qp/query->expected-cols` should return deduplicated column names"
    (is (= ["ID" "DATE" "USER_ID" "VENUE_ID" "u__ID" "u__NAME" "u__LAST_LOGIN"]
           #_["ID" "DATE" "USER_ID" "VENUE_ID" "ID_2" "NAME" "LAST_LOGIN"]
           (map :name (qp.metadata/query->expected-cols
                       (mt/mbql-query checkins
                         {:source-table $$checkins
                          :joins [{:fields       :all
                                   :alias        "u"
                                   :source-table $$users
                                   :condition    [:= $user_id &u.users.id]}]})))))))

(deftest ^:parallel query->expected-cols-test
  (is (=? [{:base_type     :type/Integer
            :name          "count"
            :display_name  "Count"
            :semantic_type :type/Quantity
            :source        :aggregation
            :field_ref     [:aggregation 0]}
           {:base_type     :type/Integer
            :name          "count_2"
            :display_name  "Count"
            :semantic_type :type/Quantity
            :source        :aggregation
            :field_ref     [:aggregation 1]}
           {:base_type     :type/Integer
            :name          "count_3"
            :display_name  "Count"
            :semantic_type :type/Quantity
            :source        :aggregation
            :field_ref     [:aggregation 2]}]
          (qp.metadata/query->expected-cols
           {:database (mt/id)
            :type     :query
            :query    {:source-table (mt/id :venues)
                       :aggregation  [[:aggregation-options [:count] {:name "count"}]
                                      [:count]
                                      [:count]]}}))))
