(ns metabase.query-processor.middleware.add-default-temporal-unit-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.middleware.add-default-temporal-unit :as add-default-temporal-unit]
            [metabase.test :as mt]))

(defn- add-default-temporal-unit [query]
  (mt/with-everything-store
    (:pre (mt/test-qp-middleware add-default-temporal-unit/add-default-temporal-unit query))))

(deftest add-default-temporal-unit-test
  (testing "Should add temporal-unit :default to a :field clause"
    (testing "with a Field ID"
      (is (= (mt/mbql-query checkins
               {:filter [:> !default.date "2021-05-13T00:00:00Z"]})
             (add-default-temporal-unit
              (mt/mbql-query checkins
                {:filter [:> $date "2021-05-13T00:00:00Z"]})))))
    (testing "with a Field name and temporal base type"
      (is (= (mt/mbql-query checkins
               {:filter [:>
                         [:field "date" {:base-type :type/TimeWithLocalTZ, :temporal-unit :default}]
                         "2021-05-13T00:00:00Z"]})
             (add-default-temporal-unit
              (mt/mbql-query checkins
                {:filter [:>
                          [:field "date" {:base-type :type/TimeWithLocalTZ}]
                          "2021-05-13T00:00:00Z"]}))))))

  (testing "Should ignore fields that already have a temporal unit"
    (testing "with an ID"
      (let [query (mt/mbql-query checkins
                    {:filter [:> !month.date "2021-05-13T00:00:00Z"]})]
        (is (= query
               (add-default-temporal-unit query)))))
    (testing "with a field name"
      (let [query (mt/mbql-query checkins
                    {:filter [:>
                              [:field "date" {:base-type :type/TimeWithLocalTZ, :temporal-unit :month}]
                              "2021-05-13T00:00:00Z"]})]
        (is (= query
               (add-default-temporal-unit query))))))

  (testing "Should ignore non-temporal fields"
    (testing "with an ID"
      (let [query (mt/mbql-query venues
                    {:filter [:> $price 3]})]
        (is (= query
               (add-default-temporal-unit query)))))
    (testing "with a field name"
      (let [query (mt/mbql-query checkins
                    {:filter [:>
                              [:field "price" {:base-type :type/Integer}]
                              3]})]
        (is (= query
               (add-default-temporal-unit query)))))))

(deftest ignore-parameters-test
  (testing "Don't try to update query `:parameters`"
    (let [query {:database   (mt/id)
                 :type       :native
                 :native     {:query "select 111 as my_number, 'foo' as my_string"}
                 :parameters [{:type   "category"
                               :value  [:param-value]
                               :target [:dimension
                                        [:field
                                         (mt/id :categories :id)
                                         {:source-field (mt/id :venues :category_id)}]]}]}]
      (is (= query
             (add-default-temporal-unit query))))))
