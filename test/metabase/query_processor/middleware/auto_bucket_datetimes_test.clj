(ns metabase.query-processor.middleware.auto-bucket-datetimes-test
  (:require [clojure.test :refer :all]
            [metabase
             [test :as mt]
             [util :as u]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware.auto-bucket-datetimes :as auto-bucket-datetimes]))

(defn- auto-bucket [query]
  (:pre (mt/test-qp-middleware auto-bucket-datetimes/auto-bucket-datetimes query)))

(defn- auto-bucket-mbql [mbql-query]
  (-> (auto-bucket {:database (mt/id), :type :query, :query mbql-query})
      :query))

(deftest auto-bucket-in-breakout-test
  (testing "does a :type/DateTime Field get auto-bucketed when present in a breakout clause?"
    (mt/with-temp Field [field {:base_type :type/DateTime, :special_type nil}]
      (is (= {:source-table 1
              :breakout     [[:datetime-field [:field-id (u/get-id field)] :day]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field-id (u/get-id field)]]}))))))

(deftest auto-bucket-in-filter-test
  (testing "does the Field get bucketed if present in the `:filter` clause? (#8932)"
    ;;
    ;;
    ;; e.g. `[:= <field> "2018-11-19"] should get rewritten as `[:= [:datetime-field <field> :day] "2018-11-19"]` if
    ;; `<field>` is a `:type/DateTime` Field
    (mt/with-temp Field [field {:base_type :type/DateTime, :special_type nil}]
      (is (= {:source-table 1
              :filter       [:= [:datetime-field [:field-id (u/get-id field)] :day] "2018-11-19"]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:= [:field-id (u/get-id field)] "2018-11-19"]}))))))

(deftest auto-bucket-in-compound-filter-clause-test
  (testing "Fields should still get auto-bucketed when present in compound filter clauses (#9127)"
    (mt/with-temp* [Field [field-1 {:base_type :type/DateTime, :special_type nil}]
                    Field [field-2 {:base_type :type/Text, :special_type nil}]]
      (is (= {:source-table 1
              :filter       [:and
                             [:= [:datetime-field [:field-id (u/get-id field-1)] :day] "2018-11-19"]
                             [:= [:field-id (u/get-id field-2)] "ABC"]]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:and
                              [:= [:field-id (u/get-id field-1)] "2018-11-19"]
                              [:= [:field-id (u/get-id field-2)] "ABC"]]}))))))

(deftest auto-bucket-field-literals-test
  (testing "DateTime field literals should also get auto-bucketed (#9007)"
    (is (= {:source-query {:source-table 1}
            :filter       [:= [:datetime-field [:field-literal "timestamp" :type/DateTime] :day] "2018-11-19"]}
           (auto-bucket-mbql
            {:source-query {:source-table 1}
             :filter       [:= [:field-literal "timestamp" :type/DateTime] "2018-11-19"]})))))

(deftest do-not-autobucket-when-compared-to-non-yyyy-MM-dd-strings-test
  (testing (str "On the other hand, we shouldn't auto-bucket Fields inside a filter clause if they are being compared "
                "against a datetime string that includes more than just yyyy-MM-dd:")
    (mt/with-temp Field [field {:base_type :type/DateTime, :special_type nil}]
      (is (= {:source-table 1
              :filter       [:= [:field-id (u/get-id field)] "2018-11-19T14:11:00"]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:= [:field-id (u/get-id field)] "2018-11-19T14:11:00"]}))))

    (is (= {:source-query {:source-table 1}
            :filter       [:= [:field-literal "timestamp" :type/DateTime] "2018-11-19T14:11:00"]}
           (auto-bucket-mbql
            {:source-query {:source-table 1}
             :filter       [:= [:field-literal "timestamp" :type/DateTime] "2018-11-19T14:11:00"]})))

    (testing "for breakouts or other filters with multiple args, all args must be yyyy-MM-dd"
      (mt/with-temp Field [field {:base_type :type/DateTime, :special_type nil}]
        (is (= {:source-table 1
                :filter       [:between [:datetime-field [:field-id (u/get-id field)] :day] "2018-11-19" "2018-11-20"]}
               (auto-bucket-mbql
                {:source-table 1
                 :filter       [:between [:field-id (u/get-id field)] "2018-11-19" "2018-11-20"]}))))

      (mt/with-temp Field [field {:base_type :type/DateTime, :special_type nil}]
        (is (= {:source-table 1
                :filter       [:between [:field-id (u/get-id field)] "2018-11-19" "2018-11-20T14:20:00.000Z"]}
               (auto-bucket-mbql
                {:source-table 1
                 :filter       [:between [:field-id (u/get-id field)] "2018-11-19" "2018-11-20T14:20:00.000Z"]})))))))

(deftest only-auto-bucket-appropriate-instances-test
  (testing "if a Field occurs more than once we should only rewrite the instances that should be rebucketed"
    (mt/with-temp Field [field {:base_type :type/DateTime, :special_type nil}]
      (is (= {:source-table 1
              :breakout     [[:datetime-field [:field-id (u/get-id field)] :day]]
              :filter       [:= [:field-id (u/get-id field)] "2018-11-20T14:20:00.000Z"]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field-id (u/get-id field)]]
               :filter       [:= [:field-id (u/get-id field)] "2018-11-20T14:20:00.000Z"]}))))

    (mt/with-temp Field [field {:base_type :type/DateTime, :special_type nil}]
      (is (= {:source-table 1
              :breakout     [[:datetime-field [:field-id (u/get-id field)] :month]]
              :filter       [:= [:datetime-field [:field-id (u/get-id field)] :day] "2018-11-20"]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:datetime-field [:field-id (u/get-id field)] :month]]
               :filter       [:= [:field-id (u/get-id field)] "2018-11-20"]}))))))

(deftest do-not-auto-bucket-inside-time-interval-test
  (testing "We should not try to bucket Fields inside a `time-interval` clause as that would be invalid"
    (mt/with-temp Field [field {:base_type :type/DateTime, :special_type nil}]
      (is (= {:source-table 1
              :filter       [:time-interval [:field-id (u/get-id field)] -30 :day]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:time-interval [:field-id (u/get-id field)] -30 :day]}))))))

(deftest do-not-auto-bucket-inappropriate-filter-clauses-test
  (testing "Don't auto-bucket fields in non-equality or non-comparison filter clauses, for example `:is-null`:"
    (mt/with-temp Field [field {:base_type :type/DateTime, :special_type nil}]
      (is (= {:source-table 1
              :filter       [:is-null [:field-id (u/get-id field)]]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:is-null [:field-id (u/get-id field)]]}))))))

(deftest do-not-auto-bucket-time-fields-test
  (testing (str "we also should not auto-bucket Fields that are `:type/Time`, because grouping a Time Field by day "
                "makes ZERO SENSE.")
    (mt/with-temp Field [field {:base_type :type/Time, :special_type nil}]
      (is (= {:source-table 1
              :breakout     [[:field-id (u/get-id field)]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field-id (u/get-id field)]]}))))))

(deftest auto-bucket-by-special-type-test
  (testing "should be considered to be :type/DateTime based on `special_type` as well"
    (mt/with-temp Field [field {:base_type :type/Integer, :special_type :type/DateTime}]
      (is (= {:source-table 1
              :breakout     [[:datetime-field [:field-id (u/get-id field)] :day]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field-id (u/get-id field)]]}))))))

(deftest ignore-native-queries-test
  (testing "do native queries pass thru unchanged?"
    (let [native-query {:database 1, :type :native, :native {:query "SELECT COUNT(cans) FROM birds;"}}]
      (is (= native-query
             (auto-bucket native-query))))))

(deftest ignore-queries-with-no-breakouts-test
  (testing "do MBQL queries w/o breakouts pass thru unchanged?"
    (is (= {:source-table 1}
           (auto-bucket-mbql
            {:source-table 1})))))

(deftest ignore-non-temporal-breakouts-test
  (testing "does a breakout Field that isn't temporal pass thru unchnaged?"
    (mt/with-temp Field [field {:base_type :type/Integer, :special_type nil}]
      (is (= {:source-table 1
              :breakout     [[:field-id (u/get-id field)]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field-id (u/get-id field)]]}))))))

(deftest do-not-auto-bucket-already-bucketed-test
  (testing "does a :type/DateTime breakout Field that is already bucketed pass thru unchanged?"
    (mt/with-temp Field [field {:base_type :type/DateTime, :special_type nil}]
      (is (= {:source-table 1
              :breakout     [[:datetime-field [:field-id (u/get-id field)] :month]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:datetime-field [:field-id (u/get-id field)] :month]]}))))))

(deftest do-not-fail-on-invalid-field-test
  (testing "does the middleware avoid barfing if for some reason the Field could not be resolved in the DB?"
    ;; (That is the job of the resolve middleware to worry about that stuff.)
    (is (= {:source-table 1
            :breakout     [[:field-id Integer/MAX_VALUE]]}
           (auto-bucket-mbql
            {:source-table 1
             :breakout     [[:field-id Integer/MAX_VALUE]]})))))

(deftest auto-bucket-unix-timestamp-fields-test
  (testing "do UNIX TIMESTAMP fields get auto-bucketed?"
    (mt/dataset sad-toucan-incidents
      (mt/$ids incidents
        (is (= {:source-table $$incidents
                :breakout     [!day.timestamp]}
               (auto-bucket-mbql
                {:source-table $$incidents
                 :breakout     [$timestamp]})))))))

(deftest relative-datetime-test
  (testing "Fields being compared against `:relative-datetime`s should be subject to auto-bucketing. (#9014)"
    (is (= (->
            (mt/mbql-query checkins
              {:filter [:= [:datetime-field $date :day] [:relative-datetime :current]]})
            :query :filter)
           (->
            (auto-bucket
             (mt/mbql-query checkins
               {:filter [:= $date [:relative-datetime :current]]}))
            :query :filter)))))

(deftest auto-bucket-joined-fields-test
  (testing "Joined fields should get auto-bucketed (#12872)"
    (testing "only joined-field reference to Field"
      (let [query (mt/mbql-query checkins
                    {:filter [:between [:joined-field "Checkins" $date] "2019-11-01" "2019-11-01"]
                     :joins  [{:alias        "Checkins"
                               :condition    [:= $id [:joined-field "Checkins" $id]]
                               :fields       :all
                               :source-table $$checkins}]})]
        (is (= (mt/$ids checkins
                 [:between [:datetime-field [:joined-field "Checkins" $date] :day] "2019-11-01" "2019-11-01"])
               (get-in (auto-bucket query) [:query :filter])))))
    (testing "joined-field and normal reference to same Field"
      (let [query (mt/mbql-query checkins
                    {:filter [:and
                              [:between $date "2019-11-01" "2019-11-01"]
                              [:between [:joined-field "Checkins" $date] "2019-11-01" "2019-11-01"]]
                     :joins  [{:alias        "Checkins"
                               :condition    [:= $id [:joined-field "Checkins" $id]]
                               :fields       :all
                               :source-table $$checkins}]})]
        (is (= (mt/$ids checkins
                 [:and
                  [:between [:datetime-field $date :day] "2019-11-01" "2019-11-01"]
                  [:between [:datetime-field [:joined-field "Checkins" $date] :day] "2019-11-01" "2019-11-01"]])
               (get-in (auto-bucket query) [:query :filter])))))
    (doseq [[message filter-clause] (mt/$ids checkins
                                      {"Don't auto-bucket non-temporal joined-field"
                                       [:= [:joined-field "Checkins" $id] 1]

                                       "Don't auto-bucket an already-bucketed joined-field"
                                       [:between [:datetime-field [:joined-field "Checkins" $date] :month] "2019-11-01" "2019-11-01"]

                                       "Don't auto-bucket joined-field for non-comparison filter clauses"
                                       [:not-null [:joined-field "Checkins" $date]]})]
      (testing message
        (let [query (mt/mbql-query checkins
                      {:filter filter-clause
                       :joins  [{:alias        "Checkins"
                                 :condition    [:= $id [:joined-field "Checkins" $id]]
                                 :fields       :all
                                 :source-table $$checkins}]})]
          (is (= filter-clause
                 (get-in (auto-bucket query) [:query :filter]))))))))
