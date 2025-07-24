(ns metabase.query-processor.middleware.auto-bucket-datetimes-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.convert :as lib.convert]
   [metabase.lib.core :as lib]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.auto-bucket-datetimes :as qp.auto-bucket-datetimes]
   [metabase.query-processor.store :as qp.store]
   [metabase.util.malli :as mu]))

(deftest ^:parallel should-not-be-autobucketed?-test
  (testing "Don't auto-bucket fields that are already bucketed"
    (is (= :do-not-bucket-reason/field-with-bucketing-or-binning
           (#'qp.auto-bucket-datetimes/should-not-be-autobucketed?
            (lib/query meta/metadata-provider (meta/table-metadata :checkins))
            [:stages 0]
            (lib.normalize/normalize :mbql.clause/field [:field {:temporal-unit :month} (meta/id :checkins :date)]))))))

(mu/defn- auto-bucket [query :- :map]
  (if (= (:lib/type query) :mbql/query)
    (qp.auto-bucket-datetimes/auto-bucket-datetimes query)
    (let [metadata-provider (if (qp.store/initialized?)
                              (qp.store/metadata-provider)
                              meta/metadata-provider)
          query (lib/query metadata-provider query)]
      (-> query
          qp.auto-bucket-datetimes/auto-bucket-datetimes
          lib.convert/->legacy-MBQL))))

(defn- auto-bucket-mbql [mbql-query]
  (-> (auto-bucket {:database (meta/id), :type :query, :query mbql-query})
      :query))

(deftest ^:parallel auto-bucket-in-breakout-test
  (testing "does a :type/DateTime Field get auto-bucketed when present in a breakout clause?"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:source-table 1
              :breakout     [[:field (meta/id :checkins :date) {:temporal-unit :day}]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field (meta/id :checkins :date) nil]]}))))))

(deftest ^:parallel auto-bucket-in-filter-test
  (testing "does the Field get bucketed if present in the `:filter` clause? (#8932)"
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
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:source-table 1
              :filter       [:= [:field (meta/id :checkins :date) {:temporal-unit :day}] "2018-11-19"]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:= [:field (meta/id :checkins :date) nil] "2018-11-19"]}))))))

(deftest ^:parallel auto-bucket-expressions-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing "Expression in filter gets temporal unit added"
      (is (= [:= [:expression "cc" {:base-type :type/DateTime, :temporal-unit :day}] "2019-02-11"]
             (:filter (auto-bucket-mbql
                       {:source-table 1
                        :expressions {"cc" [:convert-timezone
                                            [:field (meta/id :orders :created-at) {:base-type :type/DateTime}]
                                            "America/Argentina/Buenos_Aires"
                                            "UTC"]}
                        :filter      [:= [:expression "cc" {:base-type :type/DateTime}] "2019-02-11"]})))))
    (testing "Expressions not appropriate for bucketing are left untouched"
      (is (= [:= [:expression "cc" {:base-type :type/DateTime}] "2024-07-16T13:24:00"]
             (:filter (auto-bucket-mbql
                       {:source-table 1
                        :expressions {"cc" [:convert-timezone
                                            [:field (meta/id :orders :created-at) {:base-type :type/DateTime}]
                                            "America/Argentina/Buenos_Aires"
                                            "UTC"]}
                        :filter      [:= [:expression "cc" {:base-type :type/DateTime}] "2024-07-16T13:24:00"]}))))
      (is (= [:= [:expression "cc" {:base-type :type/DateTime}] 1]
             (:filter (auto-bucket-mbql
                       {:source-table 1
                        :expressions {"cc" [:+ (meta/id :orders :id) 1]}
                        :filter      [:= [:expression "cc" {:base-type :type/DateTime}] 1]}))))
      (is (= [:= [:expression "cc" {:base-type :type/Time}] "10:00:00"]
             (:filter (auto-bucket-mbql
                       {:source-table 1
                        :expressions {"cc" [:convert-timezone
                                            [:field (meta/id :orders :created-at) {:base-type :type/Time}]
                                            "America/Argentina/Buenos_Aires"
                                            "UTC"]}
                        :filter      [:= [:expression "cc" {:base-type :type/Time}] "10:00:00"]})))))))

(deftest ^:parallel auto-bucket-in-compound-filter-clause-test
  (testing "Fields should still get auto-bucketed when present in compound filter clauses (#9127)"
    (is (= {:source-table 1
            :filter       [:and
                           [:= [:field (meta/id :checkins :date) {:temporal-unit :day}] "2018-11-19"]
                           [:= [:field (meta/id :venues :name) nil] "ABC"]]}
           (auto-bucket-mbql
            {:source-table 1
             :filter       [:and
                            [:= [:field (meta/id :checkins :date) nil] "2018-11-19"]
                            [:= [:field (meta/id :venues :name) nil] "ABC"]]})))))

(deftest ^:parallel auto-bucket-field-literals-test
  (testing "DateTime field literals should also get auto-bucketed (#9007)"
    (is (= {:source-query {:source-table 1}
            :filter       [:= [:field "timestamp" {:base-type :type/DateTime, :temporal-unit :day}] "2018-11-19"]}
           (auto-bucket-mbql
            {:source-query {:source-table 1}
             :filter       [:= [:field "timestamp" {:base-type :type/DateTime}] "2018-11-19"]})))))

(deftest ^:parallel do-not-autobucket-when-compared-to-non-yyyy-MM-dd-strings-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing (str "On the other hand, we shouldn't auto-bucket Fields inside a filter clause if they are being compared "
                  "against a datetime string that includes more than just yyyy-MM-dd:")
      (is (= {:source-table 1
              :filter       [:= [:field (meta/id :checkins :date) nil] "2018-11-19T14:11:00"]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:= [:field (meta/id :checkins :date) nil] "2018-11-19T14:11:00"]}))))))

(deftest ^:parallel do-not-autobucket-when-compared-to-non-yyyy-MM-dd-strings-test-2
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing (str "On the other hand, we shouldn't auto-bucket Fields inside a filter clause if they are being compared "
                  "against a datetime string that includes more than just yyyy-MM-dd:")
      (is (= {:source-query {:source-table 1}
              :filter       [:= [:field "timestamp" {:base-type :type/DateTime}] "2018-11-19T14:11:00"]}
             (auto-bucket-mbql
              {:source-query {:source-table 1}
               :filter       [:= [:field "timestamp" {:base-type :type/DateTime}] "2018-11-19T14:11:00"]}))))))

(deftest ^:parallel do-not-autobucket-when-compared-to-non-yyyy-MM-dd-strings-test-3
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing (str "On the other hand, we shouldn't auto-bucket Fields inside a filter clause if they are being compared "
                  "against a datetime string that includes more than just yyyy-MM-dd:")
      (testing "for breakouts or other filters with multiple args, all args must be yyyy-MM-dd"
        (is (= {:source-table 1
                :filter       [:between [:field (meta/id :checkins :date) {:temporal-unit :day}] "2018-11-19" "2018-11-20"]}
               (auto-bucket-mbql
                {:source-table 1
                 :filter       [:between [:field (meta/id :checkins :date) nil] "2018-11-19" "2018-11-20"]})))
        (is (= {:source-table 1
                :filter       [:between [:field (meta/id :checkins :date) nil] "2018-11-19" "2018-11-20T14:20:00.000Z"]}
               (auto-bucket-mbql
                {:source-table 1
                 :filter       [:between [:field (meta/id :checkins :date) nil] "2018-11-19" "2018-11-20T14:20:00.000Z"]})))))))

(deftest ^:parallel only-auto-bucket-appropriate-instances-test
  (testing "if a Field occurs more than once we should only rewrite the instances that should be rebucketed"
    (qp.store/with-metadata-provider meta/metadata-provider
      ;; filter doesn't get auto-bucketed here because it's being compared to something with > date resolution
      (is (= {:source-table    1
              :breakout        [[:field (meta/id :checkins :date) {:temporal-unit :day}]]
              :filter          [:= [:field (meta/id :checkins :date) nil] "2018-11-20T14:20:00.000Z"]}
             (auto-bucket-mbql
              {:source-table    1
               :breakout        [[:field (meta/id :checkins :date) nil]]
               :filter          [:= [:field (meta/id :checkins :date) nil] "2018-11-20T14:20:00.000Z"]})))
      (is (= {:source-table    1
              :breakout        [[:field (meta/id :checkins :date) {:temporal-unit :month}]]
              :filter          [:= [:field (meta/id :checkins :date) {:temporal-unit :day}] "2018-11-20"]}
             (auto-bucket-mbql
              {:source-table    1
               :breakout        [[:field (meta/id :checkins :date) {:temporal-unit :month}]]
               :filter          [:= [:field (meta/id :checkins :date) nil] "2018-11-20"]}))))))

(deftest ^:parallel do-not-auto-bucket-inside-time-interval-test
  (testing "We should not try to bucket Fields inside a `time-interval` clause as that would be invalid"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:source-table 1
              :filter       [:time-interval [:field (meta/id :checkins :date) nil] -30 :day]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:time-interval [:field (meta/id :checkins :date) nil] -30 :day]}))))))

(deftest ^:parallel do-not-auto-bucket-inappropriate-filter-clauses-test
  (testing "Don't auto-bucket fields in non-equality or non-comparison filter clauses, for example `:is-null`:"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:source-table 1
              :filter       [:is-null [:field (meta/id :checkins :date) nil]]}
             (auto-bucket-mbql
              {:source-table 1
               :filter       [:is-null [:field (meta/id :checkins :date) nil]]}))))))

(deftest ^:parallel do-not-auto-bucket-time-fields-test
  (testing (str "we also should not auto-bucket Fields that are `:type/Time`, because grouping a Time Field by day "
                "makes ZERO SENSE.")
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:fields [(merge (meta/field-metadata :checkins :date)
                                                       {:id             1
                                                        :base-type      :type/Time
                                                        :effective-type :type/Time})]})
      (is (= {:source-table 1
              :breakout     [[:field 1 nil]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field 1 nil]]}))))))

(def ^:private unix-timestamp-metadata-provider
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:fields [(merge (meta/field-metadata :checkins :date)
                    {:id                1
                     :base-type         :type/Integer
                     :effective-type    :type/DateTime
                     :coercion-strategy :Coercion/UNIXSeconds->DateTime})]}))

(deftest ^:parallel auto-bucket-by-effective-type-test
  (testing "UNIX timestamps should be considered to be :type/DateTime based on effective type"
    (qp.store/with-metadata-provider unix-timestamp-metadata-provider
      (is (= {:source-table 1
              :breakout     [[:field 1 {:temporal-unit :day}]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field 1 nil]]}))))))

(deftest ^:parallel ignore-native-queries-test
  (testing "do native queries pass thru unchanged?"
    (let [native-query {:database (meta/id), :type :native, :native {:query "SELECT COUNT(cans) FROM birds;"}}]
      (is (= native-query
             (auto-bucket native-query))))))

(deftest ^:parallel ignore-queries-with-no-breakouts-test
  (testing "do MBQL queries w/o breakouts pass thru unchanged?"
    (is (= {:source-table 1}
           (auto-bucket-mbql
            {:source-table 1})))))

(deftest ^:parallel ignore-non-temporal-breakouts-test
  (testing "does a breakout Field that isn't temporal pass thru unchnaged?"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:source-table 1
              :breakout     [[:field (meta/id :venues :id) nil]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field (meta/id :venues :id) nil]]}))))))

(deftest ^:parallel do-not-auto-bucket-already-bucketed-test
  (testing "does a :type/DateTime breakout Field that is already bucketed pass thru unchanged?"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:source-table 1
              :breakout     [[:field (meta/id :checkins :date) {:temporal-unit :month}]]}
             (auto-bucket-mbql
              {:source-table 1
               :breakout     [[:field (meta/id :checkins :date) {:temporal-unit :month}]]}))))))

(deftest ^:parallel do-not-fail-on-invalid-field-test
  (testing "does the middleware avoid barfing if for some reason the Field could not be resolved in the DB?"
    ;; (That is the job of the resolve middleware to worry about that stuff.)
    (is (= {:source-table 1
            :breakout     [[:field Integer/MAX_VALUE nil]]}
           (auto-bucket-mbql
            {:source-table 1
             :breakout     [[:field Integer/MAX_VALUE nil]]})))))

(deftest ^:parallel do-not-auto-bucket-relative-time-interval-test
  (testing "does a :type/DateTime breakout Field that is already bucketed pass thru unchanged?"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (= {:source-table (meta/id :orders)
              :filter       [:relative-time-interval [:field (meta/id :orders :created-at) nil] 1 :day 2 :month]}
             (auto-bucket-mbql
              {:source-table (meta/id :orders)
               :filter      [:relative-time-interval [:field (meta/id :orders :created-at) nil] 1 :day 2 :month]}))))))

(deftest ^:parallel auto-bucket-unix-timestamp-fields-test
  (testing "do UNIX TIMESTAMP fields get auto-bucketed?"
    (qp.store/with-metadata-provider unix-timestamp-metadata-provider
      (lib.tu.macros/$ids checkins
        (is (= {:source-table $$checkins
                :breakout     [!day.date]}
               (auto-bucket-mbql
                {:source-table $$checkins
                 :breakout     [$date]})))))))

(deftest ^:parallel relative-datetime-test
  (testing "Fields being compared against `:relative-datetime`s should be subject to auto-bucketing. (#9014)"
    (is (= (->
            (lib.tu.macros/mbql-query checkins
              {:filter [:= [:field %date {:temporal-unit :day}] [:relative-datetime :current]]})
            :query :filter)
           (->
            (auto-bucket
             (lib.tu.macros/mbql-query checkins
               {:filter [:= $date [:relative-datetime :current]]}))
            :query :filter)))))

(deftest ^:parallel auto-bucket-joined-fields-test
  (testing "Joined fields should get auto-bucketed (#12872)"
    (testing "only joined-field reference to Field"
      (let [query (lib.tu.macros/mbql-query checkins
                    {:filter [:between [:field %date {:join-alias "Checkins"}] "2019-11-01" "2019-11-01"]
                     :joins  [{:alias        "Checkins"
                               :condition    [:= $id [:field %id {:join-alias "Checkins"}]]
                               :fields       :all
                               :source-table $$checkins}]})]
        (is (= (lib.tu.macros/$ids checkins
                 [:between [:field %date {:join-alias "Checkins", :temporal-unit :day}] "2019-11-01" "2019-11-01"])
               (get-in (auto-bucket query) [:query :filter])))))))

(deftest ^:parallel auto-bucket-joined-fields-test-2
  (testing "Joined fields should get auto-bucketed (#12872)"
    (testing "joined-field and normal reference to same Field"
      (let [query (lib.tu.macros/mbql-query checkins
                    {:filter [:and
                              [:between $date "2019-11-01" "2019-11-01"]
                              [:between [:field %date {:join-alias "Checkins"}] "2019-11-01" "2019-11-01"]]
                     :joins  [{:alias        "Checkins"
                               :condition    [:= $id [:field %id {:join-alias "Checkins"}]]
                               :fields       :all
                               :source-table $$checkins}]})]
        (is (= (lib.tu.macros/$ids checkins
                 [:and
                  [:between [:field %date {:temporal-unit :day}] "2019-11-01" "2019-11-01"]
                  [:between [:field %date {:join-alias "Checkins", :temporal-unit :day}] "2019-11-01" "2019-11-01"]])
               (get-in (auto-bucket query) [:query :filter])))))))

(deftest ^:parallel auto-bucket-joined-fields-test-3
  (testing "Joined fields should get auto-bucketed (#12872)"
    (doseq [[message filter-clause] (lib.tu.macros/$ids checkins
                                      {"Don't auto-bucket non-temporal joined-field"
                                       [:= [:field %id {:join-alias "Checkins"}] 1]

                                       "Don't auto-bucket an already-bucketed joined-field"
                                       [:between
                                        [:field %date {:join-alias "Checkins", :temporal-unit :month}]
                                        "2019-11-01"
                                        "2019-11-01"]

                                       "Don't auto-bucket joined-field for non-comparison filter clauses"
                                       [:not-null [:field %date {:join-alias "Checkins"}]]})]
      (testing message
        (let [query (lib.tu.macros/mbql-query checkins
                      {:filter filter-clause
                       :joins  [{:alias        "Checkins"
                                 :condition    [:= $id [:field %id {:join-alias "Checkins"}]]
                                 :fields       :all
                                 :source-table $$checkins}]})]
          (is (= filter-clause
                 (get-in (auto-bucket query) [:query :filter]))))))))

(deftest ^:parallel nested-queries-test
  (testing "Datetime fields inside nested MBQL queries should get auto-bucketed the same way as at the top-level (#15352)"
    (let [q1 (lib.tu.macros/mbql-query orders
               {:aggregation [[:count]]
                :filter      [:between $created-at "2020-02-01" "2020-02-29"]})]
      (testing "original query"
        (is (= (lib.tu.macros/mbql-query orders
                 {:aggregation [[:count]]
                  :filter      [:between !day.created-at "2020-02-01" "2020-02-29"]})
               (auto-bucket q1))))
      (testing "nested query"
        (let [q2 (lib.tu.macros/mbql-query nil
                   {:source-query (:query q1)})]
          (is (= (lib.tu.macros/mbql-query orders
                   {:source-query {:source-table $$orders
                                   :aggregation  [[:count]]
                                   :filter       [:between !day.created-at "2020-02-01" "2020-02-29"]}})
                 (auto-bucket q2))))))))
