(ns metabase.query-processor.middleware.auto-bucket-datetimes-test
  (:require [clojure.test :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.middleware.auto-bucket-datetimes :as auto-bucket-datetimes]
            [metabase.test :as mt]
            [metabase.util :as u]))

(deftest should-not-be-autobucketed?-test
  (testing "Don't auto-bucket fields that are already bucketed"
    (is (= true
           (boolean
            (#'auto-bucket-datetimes/should-not-be-autobucketed?
             [:field 1 {:temporal-unit :month}]))))))

(defn- auto-bucket [query]
  (:pre (mt/test-qp-middleware auto-bucket-datetimes/auto-bucket-datetimes query)))

(defn- auto-bucket-mbql [mbql-query]
  (-> (auto-bucket {:database (mt/id), :type :query, :query mbql-query})
      :query))

(deftest auto-bucket-in-breakout-test
  (testing "does a :type/DateTime Field get auto-bucketed when present in a breakout clause?"
    (mt/with-temp Field [field {:effective_type :type/DateTime}]
      (is (= {:source-table 1
              :breakout     [[:field (u/the-id field) {:temporal-unit :day}]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field (u/the-id field) nil]]}))))))

(deftest auto-bucket-in-filter-test
  (testing "does the Field get bucketed if present in the `:filter` clause? (#8932)"
    ;;
    ;;
    ;; e.g.
    ;;
    ;;    [:= [:field <field> nil] "2018-11-19"]
    ;;
    ;; should get rewritten as
    ;;
    ;;    [:= [:field <field> {:temporal-unit :day}] "2018-11-19"]
    ;;
    ;; if `<field>` is a `:type/DateTime` Field
    (mt/with-temp Field [field {:base_type :type/DateTime, :effective_type :type/DateTime, :semantic_type nil}]
      (is (= {:source-table 1
              :filter       [:= [:field (u/the-id field) {:temporal-unit :day}] "2018-11-19"]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:= [:field (u/the-id field) nil] "2018-11-19"]}))))))

(deftest auto-bucket-in-compound-filter-clause-test
  (testing "Fields should still get auto-bucketed when present in compound filter clauses (#9127)"
    (mt/with-temp* [Field [field-1 {:effective_type :type/DateTime}]
                    Field [field-2 {:effective_type :type/Text}]]
      (is (= {:source-table 1
              :filter       [:and
                             [:= [:field (u/the-id field-1) {:temporal-unit :day}] "2018-11-19"]
                             [:= [:field (u/the-id field-2) nil] "ABC"]]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:and
                              [:= [:field (u/the-id field-1) nil] "2018-11-19"]
                              [:= [:field (u/the-id field-2) nil] "ABC"]]}))))))

(deftest auto-bucket-field-literals-test
  (testing "DateTime field literals should also get auto-bucketed (#9007)"
    (is (= {:source-query {:source-table 1}
            :filter       [:= [:field "timestamp" {:base-type :type/DateTime, :temporal-unit :day}] "2018-11-19"]}
           (auto-bucket-mbql
            {:source-query {:source-table 1}
             :filter       [:= [:field "timestamp" {:base-type :type/DateTime}] "2018-11-19"]})))))

(deftest do-not-autobucket-when-compared-to-non-yyyy-MM-dd-strings-test
  (mt/with-temp Field [field {:base_type :type/DateTime, :effective_type :type/DateTime, :semantic_type nil}]
    (testing (str "On the other hand, we shouldn't auto-bucket Fields inside a filter clause if they are being compared "
                  "against a datetime string that includes more than just yyyy-MM-dd:")
      (is (= {:source-table 1
              :filter       [:= [:field (u/the-id field) nil] "2018-11-19T14:11:00"]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:= [:field (u/the-id field) nil] "2018-11-19T14:11:00"]})))

      (is (= {:source-query {:source-table 1}
              :filter       [:= [:field "timestamp" {:base-type :type/DateTime}] "2018-11-19T14:11:00"]}
             (auto-bucket-mbql
              {:source-query {:source-table 1}
               :filter       [:= [:field "timestamp" {:base-type :type/DateTime}] "2018-11-19T14:11:00"]})))

      (testing "for breakouts or other filters with multiple args, all args must be yyyy-MM-dd"
        (is (= {:source-table 1
                :filter       [:between [:field (u/the-id field) {:temporal-unit :day }] "2018-11-19" "2018-11-20"]}
               (auto-bucket-mbql
                {:source-table 1
                 :filter       [:between [:field (u/the-id field) nil] "2018-11-19" "2018-11-20"]})))

        (is (= {:source-table 1
                :filter       [:between [:field (u/the-id field) nil] "2018-11-19" "2018-11-20T14:20:00.000Z"]}
               (auto-bucket-mbql
                {:source-table 1
                 :filter       [:between [:field (u/the-id field) nil] "2018-11-19" "2018-11-20T14:20:00.000Z"]})))))))

(deftest only-auto-bucket-appropriate-instances-test
  (testing "if a Field occurs more than once we should only rewrite the instances that should be rebucketed"
    (mt/with-temp Field [field {:base_type :type/DateTime, :effective_type :type/DateTime, :semantic_type nil}]
      ;; filter doesn't get auto-bucketed here because it's being compared to something with > date resolution
      (is (= {:source-table 1
              :breakout     [[:field (u/the-id field) {:temporal-unit :day}]]
              :filter       [:= [:field (u/the-id field) nil] "2018-11-20T14:20:00.000Z"]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field (u/the-id field) nil]]
               :filter       [:= [:field (u/the-id field) nil] "2018-11-20T14:20:00.000Z"]})))

      (is (= {:source-table 1
              :breakout     [[:field (u/the-id field) {:temporal-unit :month}]]
              :filter       [:= [:field (u/the-id field) {:temporal-unit :day}] "2018-11-20"]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field (u/the-id field) {:temporal-unit :month}]]
               :filter       [:= [:field (u/the-id field) nil] "2018-11-20"]}))))))

(deftest do-not-auto-bucket-inside-time-interval-test
  (testing "We should not try to bucket Fields inside a `time-interval` clause as that would be invalid"
    (mt/with-temp Field [field {:effective_type :type/DateTime}]
      (is (= {:source-table 1
              :filter       [:time-interval [:field (u/the-id field) nil] -30 :day]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:time-interval [:field (u/the-id field) nil] -30 :day]}))))))

(deftest do-not-auto-bucket-inappropriate-filter-clauses-test
  (testing "Don't auto-bucket fields in non-equality or non-comparison filter clauses, for example `:is-null`:"
    (mt/with-temp Field [field {:effective_type :type/DateTime}]
      (is (= {:source-table 1
              :filter       [:is-null [:field (u/the-id field) nil]]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:is-null [:field (u/the-id field) nil]]}))))))

(deftest do-not-auto-bucket-time-fields-test
  (testing (str "we also should not auto-bucket Fields that are `:type/Time`, because grouping a Time Field by day "
                "makes ZERO SENSE.")
    (mt/with-temp Field [field {:effective_type :type/Time}]
      (is (= {:source-table 1
              :breakout     [[:field (u/the-id field) nil]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field (u/the-id field) nil]]}))))))

(deftest auto-bucket-by-semantic-type-test
  (testing "should be considered to be :type/DateTime based on `semantic_type` as well"
    (mt/with-temp Field [field {:base_type :type/Integer, :effective_type :type/DateTime
                                :coercion_strategy :Coercion/UNIXSeconds->DateTime}]
      (is (= {:source-table 1
              :breakout     [[:field (u/the-id field) {:temporal-unit :day}]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field (u/the-id field) nil]]}))))))

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
    (mt/with-temp Field [field {:effective_type :type/Integer}]
      (is (= {:source-table 1
              :breakout     [[:field (u/the-id field) nil]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field (u/the-id field) nil]]}))))))

(deftest do-not-auto-bucket-already-bucketed-test
  (testing "does a :type/DateTime breakout Field that is already bucketed pass thru unchanged?"
    (mt/with-temp Field [field {:effective_type :type/DateTime}]
      (is (= {:source-table 1
              :breakout     [[:field (u/the-id field) {:temporal-unit :month}]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field (u/the-id field) {:temporal-unit :month}]]}))))))

(deftest do-not-fail-on-invalid-field-test
  (testing "does the middleware avoid barfing if for some reason the Field could not be resolved in the DB?"
    ;; (That is the job of the resolve middleware to worry about that stuff.)
    (is (= {:source-table 1
            :breakout     [[:field Integer/MAX_VALUE nil]]}
           (auto-bucket-mbql
            {:source-table 1
             :breakout     [[:field Integer/MAX_VALUE nil]]})))))

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
              {:filter [:= [:field %date {:temporal-unit :day}] [:relative-datetime :current]]})
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
                    {:filter [:between [:field %date {:join-alias "Checkins"}] "2019-11-01" "2019-11-01"]
                     :joins  [{:alias        "Checkins"
                               :condition    [:= $id [:field %id {:join-alias "Checkins"}]]
                               :fields       :all
                               :source-table $$checkins}]})]
        (is (= (mt/$ids checkins
                 [:between [:field %date {:join-alias "Checkins", :temporal-unit :day}] "2019-11-01" "2019-11-01"])
               (get-in (auto-bucket query) [:query :filter])))))
    (testing "joined-field and normal reference to same Field"
      (let [query (mt/mbql-query checkins
                    {:filter [:and
                              [:between $date "2019-11-01" "2019-11-01"]
                              [:between [:field %date {:join-alias "Checkins"}] "2019-11-01" "2019-11-01"]]
                     :joins  [{:alias        "Checkins"
                               :condition    [:= $id [:field %id {:join-alias "Checkins"}]]
                               :fields       :all
                               :source-table $$checkins}]})]
        (is (= (mt/$ids checkins
                 [:and
                  [:between [:field %date {:temporal-unit :day}] "2019-11-01" "2019-11-01"]
                  [:between [:field %date {:join-alias "Checkins", :temporal-unit :day}] "2019-11-01" "2019-11-01"]])
               (get-in (auto-bucket query) [:query :filter])))))
    (doseq [[message filter-clause] (mt/$ids checkins
                                      {"Don't auto-bucket non-temporal joined-field"
                                       [:= [:field %id {:join-alias "Checkins"}] 1]

                                       "Don't auto-bucket an already-bucketed joined-field"
                                       [:between [:field %date {:join-alias "Checkins", :temporal-unit :month}] "2019-11-01" "2019-11-01"]

                                       "Don't auto-bucket joined-field for non-comparison filter clauses"
                                       [:not-null [:field %date {:join-alias "Checkins"}]]})]
      (testing message
        (let [query (mt/mbql-query checkins
                      {:filter filter-clause
                       :joins  [{:alias        "Checkins"
                                 :condition    [:= $id [:field %id {:join-alias "Checkins"}]]
                                 :fields       :all
                                 :source-table $$checkins}]})]
          (is (= filter-clause
                 (get-in (auto-bucket query) [:query :filter]))))))))

(deftest nested-queries-test
  (testing "Datetime fields inside nested MBQL queries should get auto-bucketed the same way as at the top-level (#15352)"
    (mt/dataset sample-dataset
      (let [q1 (mt/mbql-query orders
                 {:aggregation [[:count]]
                  :filter      [:between $created_at "2020-02-01" "2020-02-29"]})]
        (testing "original query"
          (is (= (mt/mbql-query orders
                   {:aggregation [[:count]]
                    :filter      [:between !day.created_at "2020-02-01" "2020-02-29"]})
                 (auto-bucket q1))))
        (testing "nested query"
          (let [q2 (mt/mbql-query nil
                     {:source-query (:query q1)})]
            (is (= (mt/mbql-query orders
                     {:source-query {:source-table $$orders
                                     :aggregation  [[:count]]
                                     :filter       [:between !day.created_at "2020-02-01" "2020-02-29"]}})
                   (auto-bucket q2)))))))))
