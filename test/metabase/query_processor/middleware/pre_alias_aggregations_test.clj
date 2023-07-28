(ns metabase.query-processor.middleware.pre-alias-aggregations-test
  "Tests for the `pre-alias-aggregations` middleware. For the most part we don't need to test the actual pre-alias
  logic, as that comes from the MBQL library and is tested thoroughly there -- we just need to test that it gets
  applied in the correct places."
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.query-processor.middleware.pre-alias-aggregations
    :as qp.pre-alias-aggregations]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]))

(defn- pre-alias [query]
  (mt/with-everything-store
    (driver/with-driver (or driver/*driver* :h2)
      (qp.pre-alias-aggregations/pre-alias-aggregations query))))

(deftest ^:parallel pre-alias-aggregations-test
  (is (= (mt/mbql-query checkins
           {:source-table $$checkins
            :aggregation  [[:aggregation-options [:sum $user_id]  {:name "sum"}]
                           [:aggregation-options [:sum $venue_id] {:name "sum_2"}]]})
         (pre-alias
          (mt/mbql-query checkins
            {:source-table $$checkins
             :aggregation  [[:sum $user_id] [:sum $venue_id]]})))))

(deftest ^:parallel named-aggregations-test
  (testing "if one or more aggregations are already named, do things still work correctly?"
    (is (= (mt/mbql-query checkins
             {:source-table $$checkins
              :aggregation  [[:aggregation-options [:sum $user_id]  {:name "sum"}]
                             [:aggregation-options [:sum $venue_id] {:name "sum_2"}]]})
           (pre-alias
            (mt/mbql-query checkins
              {:source-table $$checkins
               :aggregation  [[:sum $user_id]
                              [:aggregation-options [:sum $venue_id] {:name "sum"}]]}))))))

(deftest ^:parallel source-queries-test
  (testing "do aggregations inside source queries get pre-aliased?"
    (is (= (mt/mbql-query checkins
             {:source-query {:source-table $$checkins
                             :aggregation  [[:aggregation-options [:sum $user_id]  {:name "sum"}]
                                            [:aggregation-options [:sum $venue_id] {:name "sum_2"}]]}
              :aggregation  [[:aggregation-options [:count] {:name "count"}]]})
           (pre-alias
            (mt/mbql-query checkins
              {:source-query {:source-table $$checkins
                              :aggregation  [[:sum $user_id] [:sum $venue_id]]}
               :aggregation  [[:count]]}))))))

(deftest ^:parallel source-queries-inside-joins-test
  (testing "do aggregatons inside of source queries inside joins get pre-aliased?"
    (is (= (mt/mbql-query checkins
             {:source-table $$venues
              :aggregation  [[:aggregation-options [:count] {:name "count"}]]
              :joins        [{:source-query {:source-table $$checkins
                                             :aggregation  [[:aggregation-options [:sum $user_id]  {:name "sum"}]
                                                            [:aggregation-options [:sum $venue_id] {:name "sum_2"}]]
                                             :breakout     [$venue_id]}
                              :alias        "checkins"
                              :condition    [:= &checkins.venue_id $venues.id]}]})
           (pre-alias
            (mt/mbql-query checkins
              {:source-table $$venues
               :aggregation  [[:count]]
               :joins        [{:source-query {:source-table $$checkins
                                              :aggregation  [[:sum $user_id] [:sum $venue_id]]
                                              :breakout     [$venue_id]}
                               :alias        "checkins"
                               :condition    [:= &checkins.venue_id $venues.id]}]}))))))

(deftest ^:parallel expressions-test
  (testing "does pre-aliasing work the way we'd expect with expressions?"
    (is (= {:database 1
            :type     :query
            :query    {:source-table 1
                       :aggregation  [[:aggregation-options [:+ 20 [:sum [:field 2 nil]]] {:name "expression"}]]}}
           (pre-alias
            {:database 1
             :type     :query
             :query    {:source-table 1
                        :aggregation  [[:+ 20 [:sum [:field 2 nil]]]]}})))))

(deftest ^:parallel expressions-test-2
  (is (= {:database 1
          :type     :query
          :query    {:source-table 1
                     :aggregation  [[:aggregation-options
                                     [:+ 20 [:sum [:field 2 nil]]]
                                     {:name "expression"}]
                                    [:aggregation-options
                                     [:- 20 [:sum [:field 2 nil]]]
                                     {:name "expression_2"}]]}}
         (pre-alias
          {:database 1
           :type     :query
           :query    {:source-table 1
                      :aggregation  [[:+ 20 [:sum [:field 2 nil]]]
                                     [:- 20 [:sum [:field 2 nil]]]]}}))))

(driver/register! ::test-driver, :parent :sql)

(defmethod driver/escape-alias ::test-driver
  [_driver custom-field-name]
  (str \_ custom-field-name))

(deftest ^:parallel use-escape-alias-test
  (testing (str "we should use [[driver/escape-alias]] on the generated aggregation names in case the "
                "drivers need to tweak the default names we generate."))
  (is (= {:database 1
          :type     :query
          :query    {:source-table 1
                     :aggregation  [[:aggregation-options [:+ 20 [:sum [:field 2 nil]]] {:name "_expression"}]
                                    [:aggregation-options [:count] {:name "_count"}]]}}
         (let [db (mt/db)]
           (driver/with-driver ::test-driver
             (qp.store/with-store
               (qp.store/store-database! db)
               (qp.pre-alias-aggregations/pre-alias-aggregations
                {:database 1
                 :type     :query
                 :query    {:source-table 1
                            :aggregation  [[:+ 20 [:sum [:field 2 nil]]]
                                           [:count]]}})))))))
