(ns metabase.query-processor.middleware.auto-bucket-datetimes-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.normalize :as lib.normalize]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.auto-bucket-datetimes :as qp.auto-bucket-datetimes]
   ;; binds mock metadata providers via the ambient store, which the code under test reads
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]))

(deftest ^:parallel should-not-be-autobucketed?-test
  (testing "Don't auto-bucket fields that are already bucketed"
    (is (= :do-not-bucket-reason/field-with-bucketing-or-binning
           (#'qp.auto-bucket-datetimes/should-not-be-autobucketed?
            (lib/query meta/metadata-provider (meta/table-metadata :checkins))
            [:stages 0]
            (lib.normalize/normalize :mbql.clause/field [:field {:temporal-unit :month} (meta/id :checkins :date)]))))))

(defn- metadata-provider []
  (if (qp.store/initialized?)
    (qp.store/metadata-provider)
    meta/metadata-provider))

(defn- auto-bucket
  "Run the middleware on `query`, upgrading a legacy `query` to MBQL 5 first."
  [query]
  (qp.auto-bucket-datetimes/auto-bucket-datetimes
   (if (= (:lib/type query) :mbql/query)
     query
     (lib/query (metadata-provider) query))))

(defn- mbql5-query
  "Build an MBQL 5 query from `legacy-query`, the `:query` map of a legacy MBQL query."
  [legacy-query]
  (lib/query (metadata-provider) {:database (meta/id), :type :query, :query legacy-query}))

(defn- auto-bucket-mbql [legacy-query]
  (auto-bucket (mbql5-query legacy-query)))

(deftest ^:parallel auto-bucket-in-breakout-test
  (testing "does a :type/DateTime Field get auto-bucketed when present in a breakout clause?"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (=? {:stages [{:source-table 1
                         :breakout     [[:field {:temporal-unit :day} (meta/id :checkins :date)]]}]}
              (auto-bucket-mbql
               {:source-table 1
                :breakout     [[:field (meta/id :checkins :date) nil]]}))))))

(deftest ^:parallel auto-bucket-in-filter-test
  (testing "does the Field get bucketed if present in the `:filters`? (#8932)"
    ;;
    ;; e.g.
    ;;
    ;;    [:= {} [:field {} <field>] "2018-11-19"]
    ;;
    ;; should get rewritten as
    ;;
    ;;    [:= {} [:field {:temporal-unit :day} <field>] "2018-11-19"]
    ;;
    ;; if `<field>` is a `:type/DateTime` Field
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (=? {:stages [{:source-table 1
                         :filters      [[:= {} [:field {:temporal-unit :day} (meta/id :checkins :date)] "2018-11-19"]]}]}
              (auto-bucket-mbql
               {:source-table 1
                :filter       [:= [:field (meta/id :checkins :date) nil] "2018-11-19"]}))))))

(deftest ^:parallel auto-bucket-expressions-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing "Expression in filter gets temporal unit added"
      (is (=? {:stages [{:filters [[:= {} [:expression {:base-type :type/DateTime, :temporal-unit :day} "cc"] "2019-02-11"]]}]}
              (auto-bucket-mbql
               {:source-table 1
                :expressions {"cc" [:convert-timezone
                                    [:field (meta/id :orders :created-at) {:base-type :type/DateTime}]
                                    "America/Argentina/Buenos_Aires"
                                    "UTC"]}
                :filter      [:= [:expression "cc" {:base-type :type/DateTime}] "2019-02-11"]}))))
    (testing "Expressions not appropriate for bucketing are left untouched"
      (let [query (mbql5-query
                   {:source-table 1
                    :expressions {"cc" [:convert-timezone
                                        [:field (meta/id :orders :created-at) {:base-type :type/DateTime}]
                                        "America/Argentina/Buenos_Aires"
                                        "UTC"]}
                    :filter      [:= [:expression "cc" {:base-type :type/DateTime}] "2024-07-16T13:24:00"]})]
        (is (= query
               (auto-bucket query))))
      (let [query (mbql5-query
                   {:source-table 1
                    :expressions {"cc" [:+ (meta/id :orders :id) 1]}
                    :filter      [:= [:expression "cc" {:base-type :type/DateTime}] 1]})]
        (is (= query
               (auto-bucket query))))
      (let [query (mbql5-query
                   {:source-table 1
                    :expressions {"cc" [:convert-timezone
                                        [:field (meta/id :orders :created-at) {:base-type :type/Time}]
                                        "America/Argentina/Buenos_Aires"
                                        "UTC"]}
                    :filter      [:= [:expression "cc" {:base-type :type/Time}] "10:00:00"]})]
        (is (= query
               (auto-bucket query)))))))

(deftest ^:parallel auto-bucket-in-compound-filter-clause-test
  (testing "Fields should still get auto-bucketed when present in compound filter clauses (#9127)"
    (testing "a top-level `:and` (MBQL 5 splits it into separate `:filters`)"
      (is (=? {:stages [{:source-table 1
                         :filters      [[:= {} [:field {:temporal-unit :day} (meta/id :checkins :date)] "2018-11-19"]
                                        [:=
                                         {}
                                         [:field
                                          {:temporal-unit (symbol "nil #_\"key is not present.\"")}
                                          (meta/id :venues :name)]
                                         "ABC"]]}]}
              (auto-bucket-mbql
               {:source-table 1
                :filter       [:and
                               [:= [:field (meta/id :checkins :date) nil] "2018-11-19"]
                               [:= [:field (meta/id :venues :name) nil] "ABC"]]}))))
    (testing "an `:or`, which stays one compound filter in MBQL 5"
      (is (=? {:stages [{:source-table 1
                         :filters      [[:or
                                         {}
                                         [:= {} [:field {:temporal-unit :day} (meta/id :checkins :date)] "2018-11-19"]
                                         [:=
                                          {}
                                          [:field
                                           {:temporal-unit (symbol "nil #_\"key is not present.\"")}
                                           (meta/id :venues :name)]
                                          "ABC"]]]}]}
              (auto-bucket-mbql
               {:source-table 1
                :filter       [:or
                               [:= [:field (meta/id :checkins :date) nil] "2018-11-19"]
                               [:= [:field (meta/id :venues :name) nil] "ABC"]]}))))))

(deftest ^:parallel auto-bucket-field-literals-test
  (testing "DateTime field literals should also get auto-bucketed (#9007)"
    (is (=? {:stages [{:source-table 1}
                      {:filters [[:=
                                  {}
                                  [:field {:base-type :type/DateTime, :temporal-unit :day} "timestamp"]
                                  "2018-11-19"]]}]}
            (auto-bucket-mbql
             {:source-query {:source-table 1}
              :filter       [:= [:field "timestamp" {:base-type :type/DateTime}] "2018-11-19"]})))))

(deftest ^:parallel do-not-autobucket-when-compared-to-non-yyyy-MM-dd-strings-test
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing (str "On the other hand, we shouldn't auto-bucket Fields inside a filter clause if they are being compared "
                  "against a datetime string that includes more than just yyyy-MM-dd:")
      (let [query (mbql5-query
                   {:source-table 1
                    :filter       [:= [:field (meta/id :checkins :date) nil] "2018-11-19T14:11:00"]})]
        (is (= query
               (auto-bucket query)))))))

(deftest ^:parallel do-not-autobucket-when-compared-to-non-yyyy-MM-dd-strings-test-2
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing (str "On the other hand, we shouldn't auto-bucket Fields inside a filter clause if they are being compared "
                  "against a datetime string that includes more than just yyyy-MM-dd:")
      (let [query (mbql5-query
                   {:source-query {:source-table 1}
                    :filter       [:= [:field "timestamp" {:base-type :type/DateTime}] "2018-11-19T14:11:00"]})]
        (is (= query
               (auto-bucket query)))))))

(deftest ^:parallel do-not-autobucket-when-compared-to-non-yyyy-MM-dd-strings-test-3
  (qp.store/with-metadata-provider meta/metadata-provider
    (testing (str "On the other hand, we shouldn't auto-bucket Fields inside a filter clause if they are being compared "
                  "against a datetime string that includes more than just yyyy-MM-dd:")
      (testing "for breakouts or other filters with multiple args, all args must be yyyy-MM-dd"
        (is (=? {:stages [{:source-table 1
                           :filters      [[:between
                                           {}
                                           [:field {:temporal-unit :day} (meta/id :checkins :date)]
                                           "2018-11-19"
                                           "2018-11-20"]]}]}
                (auto-bucket-mbql
                 {:source-table 1
                  :filter       [:between [:field (meta/id :checkins :date) nil] "2018-11-19" "2018-11-20"]})))
        (let [query (mbql5-query
                     {:source-table 1
                      :filter       [:between [:field (meta/id :checkins :date) nil] "2018-11-19" "2018-11-20T14:20:00.000Z"]})]
          (is (= query
                 (auto-bucket query))))))))

(deftest ^:parallel only-auto-bucket-appropriate-instances-test
  (testing "if a Field occurs more than once we should only rewrite the instances that should be rebucketed"
    (qp.store/with-metadata-provider meta/metadata-provider
      ;; filter doesn't get auto-bucketed here because it's being compared to something with > date resolution
      (is (=? {:stages [{:source-table 1
                         :breakout     [[:field {:temporal-unit :day} (meta/id :checkins :date)]]
                         :filters      [[:=
                                         {}
                                         [:field
                                          {:temporal-unit (symbol "nil #_\"key is not present.\"")}
                                          (meta/id :checkins :date)]
                                         "2018-11-20T14:20:00.000Z"]]}]}
              (auto-bucket-mbql
               {:source-table    1
                :breakout        [[:field (meta/id :checkins :date) nil]]
                :filter          [:= [:field (meta/id :checkins :date) nil] "2018-11-20T14:20:00.000Z"]})))
      (is (=? {:stages [{:source-table 1
                         :breakout     [[:field {:temporal-unit :month} (meta/id :checkins :date)]]
                         :filters      [[:= {} [:field {:temporal-unit :day} (meta/id :checkins :date)] "2018-11-20"]]}]}
              (auto-bucket-mbql
               {:source-table    1
                :breakout        [[:field (meta/id :checkins :date) {:temporal-unit :month}]]
                :filter          [:= [:field (meta/id :checkins :date) nil] "2018-11-20"]}))))))

(deftest ^:parallel do-not-auto-bucket-inside-time-interval-test
  (testing "We should not try to bucket Fields inside a `time-interval` clause as that would be invalid"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [query (mbql5-query
                   {:source-table 1
                    :filter       [:time-interval [:field (meta/id :checkins :date) nil] -30 :day]})]
        (is (= query
               (auto-bucket query)))))))

(deftest ^:parallel do-not-auto-bucket-inappropriate-filter-clauses-test
  (testing "Don't auto-bucket fields in non-equality or non-comparison filter clauses, for example `:is-null`:"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [query (mbql5-query
                   {:source-table 1
                    :filter       [:is-null [:field (meta/id :checkins :date) nil]]})]
        (is (= query
               (auto-bucket query)))))))

(deftest ^:parallel do-not-auto-bucket-time-fields-test
  (testing (str "we also should not auto-bucket Fields that are `:type/Time`, because grouping a Time Field by day "
                "makes ZERO SENSE.")
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:fields [(merge (meta/field-metadata :checkins :date)
                                                       {:id             1
                                                        :base-type      :type/Time
                                                        :effective-type :type/Time})]})
      (let [query (mbql5-query
                   {:source-table 1
                    :breakout     [[:field 1 nil]]})]
        (is (= query
               (auto-bucket query)))))))

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
      (is (=? {:stages [{:source-table 1
                         :breakout     [[:field {:temporal-unit :day} 1]]}]}
              (auto-bucket-mbql
               {:source-table 1
                :breakout     [[:field 1 nil]]}))))))

(deftest ^:parallel ignore-native-queries-test
  (testing "do native queries pass thru unchanged?"
    (let [query (lib/native-query meta/metadata-provider "SELECT COUNT(cans) FROM birds;")]
      (is (= query
             (auto-bucket query))))))

(deftest ^:parallel ignore-queries-with-no-breakouts-test
  (testing "do MBQL queries w/o breakouts pass thru unchanged?"
    (let [query (mbql5-query {:source-table 1})]
      (is (= query
             (auto-bucket query))))))

(deftest ^:parallel ignore-non-temporal-breakouts-test
  (testing "does a breakout Field that isn't temporal pass thru unchnaged?"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [query (mbql5-query
                   {:source-table 1
                    :breakout     [[:field (meta/id :venues :id) nil]]})]
        (is (= query
               (auto-bucket query)))))))

(deftest ^:parallel do-not-auto-bucket-already-bucketed-test
  (testing "does a :type/DateTime breakout Field that is already bucketed pass thru unchanged?"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [query (mbql5-query
                   {:source-table 1
                    :breakout     [[:field (meta/id :checkins :date) {:temporal-unit :month}]]})]
        (is (= query
               (auto-bucket query)))))))

(deftest ^:parallel do-not-fail-on-invalid-field-test
  (testing "does the middleware avoid barfing if for some reason the Field could not be resolved in the DB?"
    ;; (That is the job of the resolve middleware to worry about that stuff.)
    (let [query (mbql5-query
                 {:source-table 1
                  :breakout     [[:field Integer/MAX_VALUE nil]]})]
      (is (= query
             (auto-bucket query))))))

(deftest ^:parallel do-not-auto-bucket-relative-time-interval-test
  (testing "does a :type/DateTime breakout Field that is already bucketed pass thru unchanged?"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [query (mbql5-query
                   {:source-table (meta/id :orders)
                    :filter       [:relative-time-interval [:field (meta/id :orders :created-at) nil] 1 :day 2 :month]})]
        (is (= query
               (auto-bucket query)))))))

(deftest ^:parallel auto-bucket-unix-timestamp-fields-test
  (testing "do UNIX TIMESTAMP fields get auto-bucketed?"
    (qp.store/with-metadata-provider unix-timestamp-metadata-provider
      (lib.tu.macros/$ids checkins
        (is (=? {:stages [{:source-table $$checkins
                           :breakout     [[:field {:temporal-unit :day} %date]]}]}
                (auto-bucket-mbql
                 {:source-table $$checkins
                  :breakout     [$date]})))))))

(deftest ^:parallel relative-datetime-test
  (testing "Fields being compared against `:relative-datetime`s should be subject to auto-bucketing. (#9014)"
    (is (=? {:stages [{:filters [[:=
                                  {}
                                  [:field {:temporal-unit :day} (meta/id :checkins :date)]
                                  [:relative-datetime {} :current]]]}]}
            (auto-bucket
             (lib.tu.macros/mbql-query checkins
               {:filter [:= $date [:relative-datetime :current]]}))))))

(deftest ^:parallel auto-bucket-joined-fields-test
  (testing "Joined fields should get auto-bucketed (#12872)"
    (testing "only joined-field reference to Field"
      (let [query (lib.tu.macros/mbql-query checkins
                    {:filter [:between [:field %date {:join-alias "Checkins"}] "2019-11-01" "2019-11-01"]
                     :joins  [{:alias        "Checkins"
                               :condition    [:= $id [:field %id {:join-alias "Checkins"}]]
                               :fields       :all
                               :source-table $$checkins}]})]
        (is (=? {:stages [{:filters [[:between
                                      {}
                                      [:field {:join-alias "Checkins", :temporal-unit :day} (meta/id :checkins :date)]
                                      "2019-11-01"
                                      "2019-11-01"]]}]}
                (auto-bucket query)))))))

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
        (is (=? {:stages [{:filters [[:between
                                      {}
                                      [:field
                                       {:join-alias    (symbol "nil #_\"key is not present.\"")
                                        :temporal-unit :day}
                                       (meta/id :checkins :date)]
                                      "2019-11-01"
                                      "2019-11-01"]
                                     [:between
                                      {}
                                      [:field {:join-alias "Checkins", :temporal-unit :day} (meta/id :checkins :date)]
                                      "2019-11-01"
                                      "2019-11-01"]]}]}
                (auto-bucket query)))))))

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
        (let [query (lib/query
                     meta/metadata-provider
                     (lib.tu.macros/mbql-query checkins
                       {:filter filter-clause
                        :joins  [{:alias        "Checkins"
                                  :condition    [:= $id [:field %id {:join-alias "Checkins"}]]
                                  :fields       :all
                                  :source-table $$checkins}]}))]
          (is (= query
                 (auto-bucket query))))))))

(deftest ^:parallel nested-queries-test
  (testing "Datetime fields inside nested MBQL queries should get auto-bucketed the same way as at the top-level (#15352)"
    (let [q1             (lib.tu.macros/mbql-query orders
                           {:aggregation [[:count]]
                            :filter      [:between $created-at "2020-02-01" "2020-02-29"]})
          expected-stage (lib.tu.macros/$ids orders
                           {:source-table $$orders
                            :aggregation  [[:count {}]]
                            :filters      [[:between
                                            {}
                                            [:field {:temporal-unit :day} %created-at]
                                            "2020-02-01"
                                            "2020-02-29"]]})]
      (testing "original query"
        (is (=? {:database (meta/id)
                 :stages   [expected-stage]}
                (auto-bucket q1))))
      (testing "nested query"
        (let [q2 (lib.tu.macros/mbql-query nil
                   {:source-query (:query q1)})]
          (is (=? {:database (meta/id)
                   :stages   [expected-stage
                              {}]}
                  (auto-bucket q2))))))))
