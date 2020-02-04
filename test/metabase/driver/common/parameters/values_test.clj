(ns metabase.driver.common.parameters.values-test
  (:require [clojure.test :refer :all]
            [metabase.driver.common.parameters :as i]
            [metabase.driver.common.parameters.values :as values]
            [metabase.models
             [card :refer [Card]]
             [field :refer [map->FieldInstance]]]
            [metabase.test.data :as data]
            [toucan.util.test :as tt]))

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
      (tt/with-temp Card [card {:dataset_query {:native {:query test-query}}}]
        (is (= (i/map->CardQuery {:card-id (:id card)
                                  :query   {:native {:query test-query}}})
               (#'values/value-for-tag
                {:name "card-template-tag-test", :display-name "Card template tag test",
                 :type :card, :card (:id card)}
                [])))))))
