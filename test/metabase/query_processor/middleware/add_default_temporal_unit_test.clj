(ns metabase.query-processor.middleware.add-default-temporal-unit-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.add-default-temporal-unit
    :as add-default-temporal-unit]
   [metabase.query-processor.store :as qp.store]))

(defn- add-default-temporal-unit [query]
  (qp.store/with-metadata-provider meta/metadata-provider
    (add-default-temporal-unit/add-default-temporal-unit query)))

(deftest ^:parallel add-default-temporal-unit-test
  (testing "Should add temporal-unit :default to a :field clause"
    (testing "with a Field ID"
      (is (= (lib.tu.macros/mbql-query checkins
               {:filter [:> !default.date "2021-05-13T00:00:00Z"]})
             (add-default-temporal-unit
              (lib.tu.macros/mbql-query checkins
                {:filter [:> $date "2021-05-13T00:00:00Z"]})))))))

(deftest ^:parallel add-default-temporal-unit-test-2
  (testing "Should add temporal-unit :default to a :field clause"
    (testing "with a Field name and temporal base type"
      (is (= (lib.tu.macros/mbql-query checkins
               {:filter [:>
                         [:field "date" {:base-type :type/TimeWithLocalTZ, :temporal-unit :default}]
                         "2021-05-13T00:00:00Z"]})
             (add-default-temporal-unit
              (lib.tu.macros/mbql-query checkins
                {:filter [:>
                          [:field "date" {:base-type :type/TimeWithLocalTZ}]
                          "2021-05-13T00:00:00Z"]})))))))

(deftest ^:parallel add-default-temporal-unit-test-3
  (testing "Should ignore fields that already have a temporal unit"
    (testing "with an ID"
      (let [query (lib.tu.macros/mbql-query checkins
                    {:filter [:> !month.date "2021-05-13T00:00:00Z"]})]
        (is (= query
               (add-default-temporal-unit query)))))
    (testing "with a field name"
      (let [query (lib.tu.macros/mbql-query checkins
                    {:filter [:>
                              [:field "date" {:base-type :type/TimeWithLocalTZ, :temporal-unit :month}]
                              "2021-05-13T00:00:00Z"]})]
        (is (= query
               (add-default-temporal-unit query)))))))

(deftest ^:parallel add-default-temporal-unit-test-4
  (testing "Should add temporal-unit :default to a :field clause"
    (testing "with a Field ID"
      (is (= (lib.tu.macros/mbql-query checkins
               {:filter [:> !default.date "2021-05-13T00:00:00Z"]})
             (add-default-temporal-unit
              (lib.tu.macros/mbql-query checkins
                {:filter [:> $date "2021-05-13T00:00:00Z"]})))))))

(deftest ^:parallel add-default-temporal-unit-test-5
  (testing "Should add temporal-unit :default to a :field clause"
    (testing "with a Field name and temporal base type"
      (is (= (lib.tu.macros/mbql-query checkins
               {:filter [:>
                         [:field "date" {:base-type :type/TimeWithLocalTZ, :temporal-unit :default}]
                         "2021-05-13T00:00:00Z"]})
             (add-default-temporal-unit
              (lib.tu.macros/mbql-query checkins
                {:filter [:>
                          [:field "date" {:base-type :type/TimeWithLocalTZ}]
                          "2021-05-13T00:00:00Z"]})))))))

(deftest ^:parallel ignore-parameters-test
  (testing "Don't try to update query `:parameters`"
    (let [query {:database   (meta/id)
                 :type       :native
                 :native     {:query "select 111 as my_number, 'foo' as my_string"}
                 :parameters [{:type   "category"
                               :value  [:param-value]
                               :target [:dimension
                                        [:field
                                         (meta/id :categories :id)
                                         {:source-field (meta/id :venues :category-id)}]]}]}]
      (is (= query
             (add-default-temporal-unit query))))))
