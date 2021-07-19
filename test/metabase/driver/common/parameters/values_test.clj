(ns metabase.driver.common.parameters.values-test
  (:require [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.common.parameters :as i]
            [metabase.driver.common.parameters.values :as values]
            [metabase.models :refer [Card Collection NativeQuerySnippet]]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.permissions :as qp.perms]
            [metabase.test :as mt]
            [metabase.util :as u]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import clojure.lang.ExceptionInfo))

(deftest variable-value-test
  (testing "Specified value"
    (is (= "2"
           (#'values/value-for-tag
            {:name "id", :display-name "ID", :type :text, :required true, :default "100"}
            [{:type :category, :target [:variable [:template-tag "id"]], :value "2"}]))))
  (testing "Multiple values with new operators"
    (is (= 20
           (#'values/value-for-tag
            {:name "number_filter", :display-name "ID", :type :number, :required true, :default "100"}
            [{:type :number/=, :value ["20"], :target [:variable [:template-tag "number_filter"]]}])))
    (is (= (i/map->CommaSeparatedNumbers {:numbers [20 40]})
           (#'values/value-for-tag
            {:name "number_filter", :display-name "ID", :type :number, :required true, :default "100"}
            [{:type :number/=, :value ["20" "40"], :target [:variable [:template-tag "number_filter"]]}]))))

  (testing "Unspecified value"
    (is (= i/no-value
           (#'values/value-for-tag {:name "id", :display-name "ID", :type :text} nil))))

  (testing "Default used"
    (is (= "100"
           (#'values/value-for-tag
            {:name "id", :display-name "ID", :type :text, :required true, :default "100"} nil)))))

(defn- extra-field-info
  "Add extra field information like coercion_strategy, semantic_type, and effective_type."
  [{:keys [base_type] :as field}]
  (merge {:coercion_strategy nil, :effective_type base_type, :semantic_type nil}
         field))

(defn value-for-tag
  "Call the private function and de-recordize the field"
  [field-info info]
  (mt/derecordize (#'values/value-for-tag field-info info)))

(defn parse-tag
  [field-info info]
  (mt/derecordize (#'values/parse-tag field-info info)))

(deftest field-filter-test
  (testing "specified"
    (testing "date range for a normal :type/Temporal field"
      (is (= {:field (extra-field-info
                      {:name          "DATE"
                       :parent_id     nil
                       :table_id      (mt/id :checkins)
                       :base_type     :type/Date
                       :semantic_type nil})
              :value {:type  :date/range
                      :value "2015-04-01~2015-05-01"}}
             (value-for-tag
              {:name         "checkin_date"
               :display-name "Checkin Date"
               :type         :dimension
               :dimension    [:field-id (mt/id :checkins :date)]}
              [{:type   :date/range
                :target [:dimension [:template-tag "checkin_date"]]
                :value  "2015-04-01~2015-05-01"}]))))

    (testing "date range for a UNIX timestamp field should work just like a :type/Temporal field (#11934)"
      (mt/dataset tupac-sightings
        (mt/$ids sightings
          (is (= {:field (extra-field-info
                          {:name              "TIMESTAMP"
                           :parent_id         nil
                           :table_id          $$sightings
                           :base_type         :type/BigInteger
                           :effective_type    :type/Instant
                           :coercion_strategy :Coercion/UNIXSeconds->DateTime})
                  :value {:type  :date/range
                          :value "2020-02-01~2020-02-29"}}
                 (value-for-tag
                   {:name         "timestamp"
                    :display-name "Sighting Timestamp"
                    :type         :dimension
                    :dimension    $timestamp
                    :widget-type  :date/range}
                   [{:type   :date/range
                     :target [:dimension [:template-tag "timestamp"]]
                     :value  "2020-02-01~2020-02-29"}])))))))

  (testing "unspecified"
    (is (= {:field (extra-field-info
                    {:name          "DATE"
                     :parent_id     nil
                     :table_id      (mt/id :checkins)
                     :base_type     :type/Date
                     :semantic_type nil})
            :value i/no-value}
           (value-for-tag
             {:name         "checkin_date"
              :display-name "Checkin Date"
              :type         :dimension
              :dimension    [:field-id (mt/id :checkins :date)]}
             nil))))

  (testing "id requiring casting"
    (is (= {:field (extra-field-info
                    {:name          "ID"
                     :parent_id     nil
                     :table_id      (mt/id :checkins)
                     :base_type     :type/BigInteger
                     :semantic_type :type/PK})
            :value {:type  :id
                    :value 5}}
           (value-for-tag
             {:name "id", :display-name "ID", :type :dimension, :dimension [:field-id (mt/id :checkins :id)]}
             [{:type :id, :target [:dimension [:template-tag "id"]], :value "5"}]))))

  (testing "required but unspecified"
    (is (thrown? Exception
                 (value-for-tag
                   {:name      "checkin_date", :display-name "Checkin Date", :type "dimension", :required true,
                    :dimension [:field (mt/id :checkins :date) nil]}
                   nil))))

  (testing "required and default specified"
    (is (= {:field (extra-field-info
                    {:name          "DATE"
                     :parent_id     nil
                     :table_id      (mt/id :checkins)
                     :base_type     :type/Date
                     :semantic_type nil})
            :value {:type  :dimension
                    :value "2015-04-01~2015-05-01"}}
           (value-for-tag
             {:name         "checkin_date"
              :display-name "Checkin Date"
              :type         :dimension
              :required     true
              :default      "2015-04-01~2015-05-01",
              :dimension    [:field-id (mt/id :checkins :date)]}
             nil))))


  (testing "multiple values for the same tag should return a vector with multiple params instead of a single param"
    (is (= {:field (extra-field-info
                    {:name          "DATE"
                     :parent_id     nil
                     :table_id      (mt/id :checkins)
                     :base_type     :type/Date
                     :semantic_type nil})
            :value [{:type  :date/range
                     :value "2015-01-01~2016-09-01"}
                    {:type  :date/single
                     :value "2015-07-01"}]}
           (value-for-tag
             {:name "checkin_date", :display-name "Checkin Date", :type :dimension, :dimension [:field-id (mt/id :checkins :date)]}
             [{:type :date/range, :target [:dimension [:template-tag "checkin_date"]], :value "2015-01-01~2016-09-01"}
              {:type :date/single, :target [:dimension [:template-tag "checkin_date"]], :value "2015-07-01"}]))))

  (testing "Make sure defaults values get picked up for field filter clauses"
    (is (= {:field (extra-field-info
                    {:name          "DATE"
                     :parent_id     nil
                     :table_id      (mt/id :checkins)
                     :base_type     :type/Date
                     :semantic_type nil})
            :value {:type  :date/all-options
                    :value "past5days"}}
           (parse-tag
             {:name         "checkin_date"
              :display-name "Checkin Date"
              :type         :dimension
              :dimension    [:field-id (mt/id :checkins :date)]
              :default      "past5days"
              :widget-type  :date/all-options}
             nil))))
  (testing "Make sure nil values result in no value"
    (is (= {:field (extra-field-info
                    {:name           "DATE"
                     :parent_id      nil
                     :table_id       (mt/id :checkins)
                     :base_type      :type/Date
                     :effective_type :type/Date})
            :value i/no-value}
           (parse-tag
             {:name         "checkin_date"
              :display-name "Checkin Date"
              :type         :dimension
              :dimension    [:field-id (mt/id :checkins :date)]
              :widget-type  :date/all-options}
                     nil)))))

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
        (is (= (i/map->ReferencedCardQuery {:card-id (u/the-id card), :query test-query})
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
                                "LIMIT 1048575")]
          (mt/with-temp Card [card {:dataset_query mbql-query}]
            (is (= (i/map->ReferencedCardQuery {:card-id (u/the-id card), :query expected-sql})
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
                        Card       [{card-1-id :id, :as card-1} {:collection_id (u/the-id collection)
                                                                 :dataset_query (mt/mbql-query venues
                                                                                  {:order-by [[:asc $id]], :limit 2})}]
                        Card       [card-2 {:collection_id (u/the-id collection)
                                            :dataset_query (mt/native-query
                                                             {:query         "SELECT * FROM {{card}}"
                                                              :template-tags {"card" {:name         "card"
                                                                                      :display-name "card"
                                                                                      :type         :card
                                                                                      :card-id      card-1-id}}})}]]
          (perms/grant-collection-read-permissions! (group/all-users) collection)
          (mt/with-test-user :rasta
            (binding [qp.perms/*card-id* (u/the-id card-2)]
              (is (= [[1 "Red Medicine"           4 10.0646 -165.374 3]
                      [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2]]
                     (mt/rows
                       (qp/process-query (:dataset_query card-2))))))))))))

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

(deftest dont-be-too-strict-test
  (testing "values-for-tag should allow unknown keys (used only by FE) (#13868)"
    (testing "\nUnknown key 'filteringParameters'"
      (testing "in tag"
        (is (= "2"
               (#'values/value-for-tag
                {:name                "id"
                 :display-name        "ID"
                 :type                :text
                 :required            true
                 :default             "100"
                 :filteringParameters "222b245f"}
                [{:type   :category
                  :target [:variable [:template-tag "id"]]
                  :value  "2"}]))))
      (testing "in params"
        (is (= "2"
               (#'values/value-for-tag
                {:name         "id"
                 :display-name "ID"
                 :type         :text
                 :required     true
                 :default      "100"}
                [{:type                :category
                  :target              [:variable [:template-tag "id"]]
                  :value               "2"
                  :filteringParameters "222b245f"}])))))))

(deftest parse-card-include-parameters-test
  (testing "Parsing a Card reference should return a `ReferencedCardQuery` record that includes its parameters (#12236)"
    (mt/dataset sample-dataset
      (mt/with-temp Card [card {:dataset_query (mt/mbql-query orders
                                                 {:filter      [:between $total 30 60]
                                                  :aggregation [[:aggregation-options
                                                                 [:count-where [:starts-with $product_id->products.category "G"]]
                                                                 {:name "G Monies", :display-name "G Monies"}]]
                                                  :breakout    [!month.created_at]})}]
        (let [card-tag (str "#" (u/the-id card))]
          (is (schema= {:card-id  (s/eq (u/the-id card))
                        :query    su/NonBlankString
                        :params   (s/eq ["G%"])
                        s/Keyword s/Any}
                       (#'values/parse-tag
                        {:id           "5aa37572-058f-14f6-179d-a158ad6c029d"
                         :name         card-tag
                         :display-name card-tag
                         :type         :card
                         :card-id      (u/the-id card)}
                        nil))))))))
