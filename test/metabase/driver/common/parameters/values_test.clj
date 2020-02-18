(ns metabase.driver.common.parameters.values-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.common.parameters :as i]
            [metabase.driver.common.parameters.values :as values]
            [metabase.models
             [card :refer [Card]]
             [field :refer [map->FieldInstance]]]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test.data :as data]
            [toucan.util.test :as tt])
  (:import clojure.lang.ExceptionInfo))

(deftest variable-value-test
  (testing "Specified value"
    (is (= "2"
           (#'values/value-for-tag
            {:name "id", :display-name "ID", :type :text, :required true, :default "100"}
            [{:type :category, :target [:variable [:template-tag "id"]], :value "2"}]))))

  (testing "Unspecified value"
    (is (=
         i/no-value
         (#'values/value-for-tag
          {:name "id", :display-name "ID", :type :text} nil))))

  (testing "Default used"
    (is (=
         "100"
         (#'values/value-for-tag
          {:name "id", :display-name "ID", :type :text, :required true, :default "100"} nil)))))

(deftest field-filter-tests
  (testing "specified"
    (is (= {:field (map->FieldInstance
                    {:name      "DATE"
                     :parent_id nil
                     :table_id  (data/id :checkins)
                     :base_type :type/Date})
            :value {:type  :date/range
                    :value "2015-04-01~2015-05-01"}}
           (into {} (#'values/value-for-tag
                     {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field-id (data/id :checkins :date)]}
                     [{:type :date/range, :target [:dimension [:template-tag "checkin_date"]], :value
                       "2015-04-01~2015-05-01"}])))))

  (testing "unspecified"
    (is (= {:field (map->FieldInstance
                    {:name      "DATE"
                     :parent_id nil
                     :table_id  (data/id :checkins)
                     :base_type :type/Date})
            :value i/no-value}
           (into {} (#'values/value-for-tag
                     {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field-id (data/id :checkins :date)]}
                     nil)))))

  (testing "id requiring casting"
    (is (= {:field (map->FieldInstance
                    {:name      "ID"
                     :parent_id nil
                     :table_id  (data/id :checkins)
                     :base_type :type/BigInteger})
            :value {:type  :id
                    :value 5}}
           (into {} (#'values/value-for-tag
                     {:name "id", :display-name "ID", :type :dimension, :dimension [:field-id (data/id :checkins :id)]}
                     [{:type :id, :target [:dimension [:template-tag "id"]], :value "5"}])))))

  (testing "required but unspecified"
    (is (thrown? Exception
                 (into {} (#'values/value-for-tag
                           {:name "checkin_date", :display-name "Checkin Date", :type "dimension", :required true,
                            :dimension ["field-id" (data/id :checkins :date)]}
                           nil)))))

  (testing "required and default specified"
    (is (= {:field (map->FieldInstance
                    {:name      "DATE"
                     :parent_id nil
                     :table_id  (data/id :checkins)
                     :base_type :type/Date})
            :value {:type  :dimension
                    :value "2015-04-01~2015-05-01"}}
           (into {} (#'values/value-for-tag
                     {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :required     true
                      :default      "2015-04-01~2015-05-01",
                      :dimension    [:field-id (data/id :checkins :date)]}
                     nil)))))


  (testing "multiple values for the same tag should return a vector with multiple params instead of a single param"
    (is (= {:field (map->FieldInstance
                    {:name      "DATE"
                     :parent_id nil
                     :table_id  (data/id :checkins)
                     :base_type :type/Date})
            :value [{:type  :date/range
                     :value "2015-01-01~2016-09-01"}
                    {:type  :date/single
                     :value "2015-07-01"}]}
           (into {} (#'values/value-for-tag
                     {:name "checkin_date", :display-name "Checkin Date", :type :dimension, :dimension [:field-id (data/id :checkins :date)]}
                     [{:type :date/range, :target [:dimension [:template-tag "checkin_date"]], :value "2015-01-01~2016-09-01"}
                      {:type :date/single, :target [:dimension [:template-tag "checkin_date"]], :value "2015-07-01"}])))))

  (testing "Make sure defaults values get picked up for field filter clauses"
    (is (= {:field (map->FieldInstance
                    {:name "DATE", :parent_id nil, :table_id (data/id :checkins), :base_type :type/Date})
            :value {:type  :date/all-options
                    :value "past5days"}}
           (into {} (#'values/field-filter-value-for-tag
                     {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field-id (data/id :checkins :date)]
                      :default      "past5days"
                      :widget-type  :date/all-options}
                     nil))))))

(deftest card-query-test
  (testing "Card query template tag gets card's native query"
    (let [test-query "SELECT 1"]
      (tt/with-temp Card [card {:dataset_query {:database (data/id)
                                                :type     "native"
                                                :native   {:query test-query}}}]
        (is (= (i/->ReferencedCardQuery (:id card) test-query)
               (#'values/value-for-tag
                {:name "card-template-tag-test", :display-name "Card template tag test",
                 :type :card, :card-id (:id card)}
                []))))))

  (testing "Card query template tag generates native query for MBQL query"
    (qp.test-util/with-everything-store
      (driver/with-driver :h2
        (let [mbql-query   (data/mbql-query venues
                             {:database (data/id)
                              :filter [:< [:field-id $price] 3]})
              expected-sql (str "SELECT "
                                  "\"PUBLIC\".\"VENUES\".\"ID\" AS \"ID\", "
                                  "\"PUBLIC\".\"VENUES\".\"NAME\" AS \"NAME\", "
                                  "\"PUBLIC\".\"VENUES\".\"CATEGORY_ID\" AS \"CATEGORY_ID\", "
                                  "\"PUBLIC\".\"VENUES\".\"LATITUDE\" AS \"LATITUDE\", "
                                  "\"PUBLIC\".\"VENUES\".\"LONGITUDE\" AS \"LONGITUDE\", "
                                  "\"PUBLIC\".\"VENUES\".\"PRICE\" AS \"PRICE\" "
                                "FROM \"PUBLIC\".\"VENUES\" "
                                "WHERE \"PUBLIC\".\"VENUES\".\"PRICE\" < 3 "
                                "LIMIT 1048576")]
          (tt/with-temp Card [card {:dataset_query mbql-query}]
            (is (= (i/->ReferencedCardQuery (:id card) expected-sql)
                   (#'values/value-for-tag
                    {:name "card-template-tag-test", :display-name "Card template tag test",
                     :type :card, :card-id (:id card)}
                    []))))))))

  (testing "Card query template tag wraps error in tag details"
    (tt/with-temp Card [param-card {:dataset_query
                                    (data/native-query
                                     {:query "SELECT {{x}}"
                                      :template-tags
                                      {"x"
                                       {:id "x-tag", :name "x", :display-name "Number x",
                                        :type :number, :required false}}})}]
      (let [param-card-id  (:id param-card)
            param-card-tag (str "#" param-card-id)]
        (tt/with-temp Card [card {:dataset_query
                                  (data/native-query
                                   {:query         (str "SELECT * FROM {{#" param-card-id "}} AS y")
                                    :template-tags
                                    {param-card-tag
                                     {:id param-card-tag, :name param-card-tag, :display-name param-card-tag
                                      :type "card", :card-id param-card-id}}})}]
          (let [card-id  (:id card)
                tag      {:name "card-template-tag-test", :display-name "Card template tag test",
                          :type :card, :card-id card-id}
                exc-data (try
                          (#'values/value-for-tag tag [])
                          (catch ExceptionInfo e
                            (ex-data e)))]
            (is (true?     (:card-query-error? exc-data)))
            (is (= card-id (:card-id exc-data)))
            (is (= tag     (:tag exc-data)))))))))
