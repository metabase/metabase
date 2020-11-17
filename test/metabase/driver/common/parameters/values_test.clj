(ns metabase.driver.common.parameters.values-test
  (:require [clojure.test :refer :all]
            [metabase
             [driver :as driver]
             [models :refer [Card Collection NativeQuerySnippet]]
             [query-processor :as qp]
             [test :as mt]
             [util :as u]]
            [metabase.driver.common.parameters :as i]
            [metabase.driver.common.parameters.values :as values]
            [metabase.models
             [field :refer [map->FieldInstance]]
             [permissions :as perms]
             [permissions-group :as group]])
  (:import clojure.lang.ExceptionInfo))

(deftest variable-value-test
  (testing "Specified value"
    (is (= "2"
           (#'values/value-for-tag
            {:name "id", :display-name "ID", :type :text, :required true, :default "100"}
            [{:type :category, :target [:variable [:template-tag "id"]], :value "2"}]))))

  (testing "Unspecified value"
    (is (= i/no-value
           (#'values/value-for-tag {:name "id", :display-name "ID", :type :text} nil))))

  (testing "Default used"
    (is (= "100"
           (#'values/value-for-tag
            {:name "id", :display-name "ID", :type :text, :required true, :default "100"} nil)))))

(deftest field-filter-test
  (testing "specified"
    (testing "date range for a normal :type/Temporal field"
      (is (= {:field (map->FieldInstance
                      {:name         "DATE"
                       :parent_id    nil
                       :table_id     (mt/id :checkins)
                       :base_type    :type/Date
                       :special_type nil})
              :value {:type  :date/range
                      :value "2015-04-01~2015-05-01"}}
             (into {} (#'values/value-for-tag
                       {:name         "checkin_date"
                        :display-name "Checkin Date"
                        :type         :dimension
                        :dimension    [:field-id (mt/id :checkins :date)]}
                       [{:type   :date/range
                         :target [:dimension [:template-tag "checkin_date"]]
                         :value  "2015-04-01~2015-05-01"}])))))

    (testing "date range for a UNIX timestamp field should work just like a :type/Temporal field (#11934)"
      (mt/dataset tupac-sightings
        (mt/$ids sightings
          (is (= {:field (map->FieldInstance
                          {:name         "TIMESTAMP"
                           :parent_id    nil
                           :table_id     $$sightings
                           :base_type    :type/BigInteger
                           :special_type :type/UNIXTimestampSeconds})
                  :value {:type  :date/range
                          :value "2020-02-01~2020-02-29"}}
                 (into {} (#'values/value-for-tag
                           {:name         "timestamp"
                            :display-name "Sighting Timestamp"
                            :type         :dimension
                            :dimension    $timestamp
                            :widget-type  :date/range}
                           [{:type   :date/range
                             :target [:dimension [:template-tag "timestamp"]]
                             :value  "2020-02-01~2020-02-29"}]))))))))

  (testing "unspecified"
    (is (= {:field (map->FieldInstance
                    {:name         "DATE"
                     :parent_id    nil
                     :table_id     (mt/id :checkins)
                     :base_type    :type/Date
                     :special_type nil})
            :value i/no-value}
           (into {} (#'values/value-for-tag
                     {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field-id (mt/id :checkins :date)]}
                     nil)))))

  (testing "id requiring casting"
    (is (= {:field (map->FieldInstance
                    {:name         "ID"
                     :parent_id    nil
                     :table_id     (mt/id :checkins)
                     :base_type    :type/BigInteger
                     :special_type :type/PK})
            :value {:type  :id
                    :value 5}}
           (into {} (#'values/value-for-tag
                     {:name "id", :display-name "ID", :type :dimension, :dimension [:field-id (mt/id :checkins :id)]}
                     [{:type :id, :target [:dimension [:template-tag "id"]], :value "5"}])))))

  (testing "required but unspecified"
    (is (thrown? Exception
                 (into {} (#'values/value-for-tag
                           {:name      "checkin_date", :display-name "Checkin Date", :type "dimension", :required true,
                            :dimension ["field-id" (mt/id :checkins :date)]}
                           nil)))))

  (testing "required and default specified"
    (is (= {:field (map->FieldInstance
                    {:name         "DATE"
                     :parent_id    nil
                     :table_id     (mt/id :checkins)
                     :base_type    :type/Date
                     :special_type nil})
            :value {:type  :dimension
                    :value "2015-04-01~2015-05-01"}}
           (into {} (#'values/value-for-tag
                     {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :required     true
                      :default      "2015-04-01~2015-05-01",
                      :dimension    [:field-id (mt/id :checkins :date)]}
                     nil)))))


  (testing "multiple values for the same tag should return a vector with multiple params instead of a single param"
    (is (= {:field (map->FieldInstance
                    {:name         "DATE"
                     :parent_id    nil
                     :table_id     (mt/id :checkins)
                     :base_type    :type/Date
                     :special_type nil})
            :value [{:type  :date/range
                     :value "2015-01-01~2016-09-01"}
                    {:type  :date/single
                     :value "2015-07-01"}]}
           (into {} (#'values/value-for-tag
                     {:name "checkin_date", :display-name "Checkin Date", :type :dimension, :dimension [:field-id (mt/id :checkins :date)]}
                     [{:type :date/range, :target [:dimension [:template-tag "checkin_date"]], :value "2015-01-01~2016-09-01"}
                      {:type :date/single, :target [:dimension [:template-tag "checkin_date"]], :value "2015-07-01"}])))))

  (testing "Make sure defaults values get picked up for field filter clauses"
    (is (= {:field (map->FieldInstance
                    {:name         "DATE"
                     :parent_id    nil
                     :table_id     (mt/id :checkins)
                     :base_type    :type/Date
                     :special_type nil})
            :value {:type  :date/all-options
                    :value "past5days"}}
           (into {} (#'values/parse-tag
                     {:name         "checkin_date"
                      :display-name "Checkin Date"
                      :type         :dimension
                      :dimension    [:field-id (mt/id :checkins :date)]
                      :default      "past5days"
                      :widget-type  :date/all-options}
                     nil))))))

(deftest field-filter-errors-test
  (testing "error conditions for field filter (:dimension) parameters"
    (testing "Should throw an Exception if Field does not exist"
      (let [query (assoc (mt/native-query "SELECT * FROM table WHERE {{x}}")
                         :template-tags {"x" {:name         "x"
                                              :display-name "X"
                                              :type         :dimension
                                              :dimension    [:field-id Integer/MAX_VALUE]}})]
        (is (thrown?
             clojure.lang.ExceptionInfo
             (values/query->params-map query)))))))

(deftest card-query-test
  (testing "Card query template tag gets card's native query"
    (let [test-query "SELECT 1"]
      (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                :type     "native"
                                                :native   {:query test-query}}}]
        (is (= (i/->ReferencedCardQuery (:id card) test-query)
               (#'values/value-for-tag
                {:name         "card-template-tag-test"
                 :display-name "Card template tag test"
                 :type         :card
                 :card-id      (:id card)}
                []))))))

  (testing "Card query template tag generates native query for MBQL query"
    (mt/with-everything-store
      (driver/with-driver :h2
        (let [mbql-query   (mt/mbql-query venues
                             {:database (mt/id)
                              :filter   [:< [:field-id $price] 3]})
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
          (mt/with-temp Card [card {:dataset_query mbql-query}]
            (is (= (i/->ReferencedCardQuery (:id card) expected-sql)
                   (#'values/value-for-tag
                    {:name         "card-template-tag-test"
                     :display-name "Card template tag test"
                     :type         :card
                     :card-id      (:id card)}
                    []))))))))

  (testing "Card query template tag wraps error in tag details"
    (mt/with-temp Card [param-card {:dataset_query
                                    (mt/native-query
                                      {:query "SELECT {{x}}"
                                       :template-tags
                                       {"x"
                                        {:id   "x-tag", :name     "x", :display-name "Number x",
                                         :type :number, :required false}}})}]
      (let [param-card-id  (:id param-card)
            param-card-tag (str "#" param-card-id)]
        (mt/with-temp Card [card {:dataset_query
                                  (mt/native-query
                                    {:query (str "SELECT * FROM {{#" param-card-id "}} AS y")
                                     :template-tags
                                     {param-card-tag
                                      {:id   param-card-tag, :name    param-card-tag, :display-name param-card-tag
                                       :type "card",         :card-id param-card-id}}})}]
          (let [card-id  (:id card)
                tag      {:name "card-template-tag-test", :display-name "Card template tag test",
                          :type :card,                    :card-id      card-id}
                e        (try
                           (#'values/value-for-tag tag [])
                           (catch ExceptionInfo e
                             e))
                exc-data (some (fn [e]
                                 (when (:card-query-error? (ex-data e))
                                   (ex-data e)))
                               (take-while some? (iterate ex-cause e)))]
            (testing "should be a card Query error"
              (is (= true
                     (boolean (:card-query-error? exc-data)))))
            (testing "card-id"
              (is (= card-id
                     (:card-id exc-data))))
            (testing "tag"
              (is (= tag
                     (:tag exc-data))))))))))

(deftest card-query-permissions-test
  (testing "We should be able to run a query referenced via a template tag if we have perms for the Card in question (#12354)"
    (mt/with-non-admin-groups-no-root-collection-perms
      (mt/with-temp-copy-of-db
        (perms/revoke-permissions! (group/all-users) (mt/id))
        (mt/with-temp* [Collection [collection]
                        Card       [{card-1-id :id, :as card-1} {:collection_id (u/get-id collection)
                                                                 :dataset_query (mt/mbql-query venues
                                                                                  {:order-by [[:asc $id]], :limit 2})}]
                        Card       [card-2 {:collection_id (u/get-id collection)
                                            :dataset_query (mt/native-query
                                                             {:query         "SELECT * FROM {{card}}"
                                                              :template-tags {"card" {:name         "card"
                                                                                      :display-name "card"
                                                                                      :type         :card
                                                                                      :card-id      card-1-id}}})}]]
          (perms/grant-collection-read-permissions! (group/all-users) collection)
          (mt/with-test-user :rasta
            (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3]
                    [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]
                   (mt/rows
                     (qp/process-userland-query (assoc (:dataset_query card-2)
                                                       :info {:executed-by (mt/user->id :rasta)
                                                              :card-id     (u/get-id card-2)})))))))))))

(deftest card-query-errors-test
  (testing "error conditions for :card parameters"
    (testing "should throw an Exception if Card does not exist"
      (let [query (assoc (mt/native-query "SELECT * FROM table WHERE {{x}}")
                         :template-tags {"x" {:name         "x"
                                              :display-name "X"
                                              :type         :card
                                              :card-id      Integer/MAX_VALUE}})]
        (is (thrown?
             clojure.lang.ExceptionInfo
             (values/query->params-map query)))))))

(deftest snippet-test
  (letfn [(query-with-snippet [& {:as snippet-properties}]
            (assoc (mt/native-query "SELECT * FROM {{expensive-venues}}")
                   :template-tags {"expensive-venues" (merge
                                                       {:type         :snippet
                                                        :name         "expensive-venues"
                                                        :display-name "Expensive Venues"
                                                        :snippet-name "expensive-venues"}
                                                       snippet-properties)}))]
    (testing "`:snippet-id` should be required"
      (is (thrown?
           clojure.lang.ExceptionInfo
           (values/query->params-map (query-with-snippet)))))

    (testing "If no such Snippet exists, it should throw an Exception"
      (is (thrown?
           clojure.lang.ExceptionInfo
           (values/query->params-map (query-with-snippet :snippet-id Integer/MAX_VALUE)))))

    (testing "Snippet parsing should work correctly for a valid Snippet"
      (mt/with-temp NativeQuerySnippet [{snippet-id :id} {:name    "expensive-venues"
                                                          :content "venues WHERE price = 4"}]
        (let [expected {"expensive-venues" (i/map->ReferencedQuerySnippet {:snippet-id snippet-id
                                                                           :content    "venues WHERE price = 4"})}]
          (is (= expected
                 (values/query->params-map (query-with-snippet :snippet-id snippet-id))))

          (testing "`:snippet-name` property in query shouldn't have to match `:name` of Snippet in DB"
            (is (= expected
                   (values/query->params-map (query-with-snippet :snippet-id snippet-id, :snippet-name "Old Name"))))))))))

(deftest invalid-param-test
  (testing "Should throw an Exception if we try to pass with a `:type` we don't understand"
    (let [query (assoc (mt/native-query "SELECT * FROM table WHERE {{x}}")
                       :template-tags {"x" {:name "x"
                                            :type :writer}})]
      (is (thrown?
           clojure.lang.ExceptionInfo
           (values/query->params-map query))))))
