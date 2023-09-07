(ns metabase.query-processor.middleware.wrap-value-literals-test
  (:require
   [clojure.test :refer :all]
   [java-time :as t]
   [metabase.driver :as driver]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.wrap-value-literals
    :as qp.wrap-value-literals]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.test :as mt]))

(driver/register! ::tz-driver, :abstract? true)

(defmethod driver/database-supports? [::tz-driver :set-timezone] [_driver _feature _db] true)

(defn- wrap-value-literals
  ([query]
   (wrap-value-literals query "UTC"))

  ([query ^String timezone-id]
   (letfn [(thunk []
             (mt/with-results-timezone-id timezone-id
               (qp.wrap-value-literals/wrap-value-literals query)))]
     (if (qp.store/initialized?)
       (thunk)
       (qp.store/with-metadata-provider meta/metadata-provider
         (thunk))))))

(deftest ^:parallel wrap-integers-test
  (is (= (lib.tu.macros/mbql-query venues
           {:filter [:>
                     $id
                     [:value 50 {:base_type         :type/BigInteger
                                 :effective_type    :type/BigInteger
                                 :coercion_strategy nil
                                 :semantic_type     :type/PK
                                 :database_type     "BIGINT"
                                 :name              "ID"}]]})
         (wrap-value-literals
          (lib.tu.macros/mbql-query venues
            {:filter [:> $id 50]})))))

(deftest ^:parallel wrap-integers-test-2
  (is (= (lib.tu.macros/mbql-query venues
           {:filter [:and
                     [:> $id [:value 50 {:base_type         :type/BigInteger
                                         :effective_type    :type/BigInteger
                                         :coercion_strategy nil
                                         :semantic_type     :type/PK
                                         :database_type     "BIGINT"
                                         :name              "ID"}]]
                     [:< $price [:value 5 {:base_type         :type/Integer
                                           :effective_type    :type/Integer
                                           :coercion_strategy nil
                                           :semantic_type     :type/Category
                                           :database_type     "INTEGER"
                                           :name              "PRICE"}]]]})
         (wrap-value-literals
          (lib.tu.macros/mbql-query venues
            {:filter [:and
                      [:> $id 50]
                      [:< $price 5]]})))))

(defn- parse-with-timezone [datetime-str ^String timezone-id]
  (driver/with-driver ::tz-driver
    (mt/with-report-timezone-id timezone-id
      (is (= (qp.timezone/results-timezone-id)
             timezone-id)
          "Make sure `results-timezone-id` is returning the bound value")
      (second (#'qp.wrap-value-literals/add-type-info datetime-str
                                                      {:unit :day})))))

(deftest ^:parallel parse-datetime-literal-strings-test
  (doseq [[timezone expected] {"UTC"        (t/zoned-date-time "2018-10-01T00:00:00Z[UTC]")
                               "US/Pacific" (t/zoned-date-time "2018-10-01T00:00:00-07:00[US/Pacific]")}]
    (is (= expected
           (parse-with-timezone "2018-10-01" timezone))
        (format "datetime literal string '2018-10-01' parsed with the %s timezone should be %s" timezone expected))))

(deftest ^:parallel wrap-datetime-literal-strings-test
  (is (= (:query
          (lib.tu.macros/mbql-query checkins
            {:filter [:= !month.date [:absolute-datetime (t/zoned-date-time "2018-10-01T00:00Z[UTC]") :month]]}))
         (-> (lib.tu.macros/$ids checkins
               (lib.tu.macros/mbql-query checkins
                 {:filter [:= !month.date "2018-10-01"]}))
             wrap-value-literals
             :query))
      "do datetime literal strings get wrapped in `absolute-datetime` clauses when in appropriate filters?"))

(deftest ^:parallel wrap-datetime-literal-strings-test-2
  (is (= [:datetime-diff
          [:absolute-datetime #t "2018-10-01" :default]
          [:absolute-datetime #t "2019-10-01T01:02:03" :default]
          :month]
         (-> (lib.tu.macros/mbql-query checkins
               {:fields      [[:expression "a"]]
                :expressions {"a" [:datetime-diff "2018-10-01" "2019-10-01T01:02:03" :month]}})
             wrap-value-literals
             :query
             :expressions
             (get "a")))
      "do datetime literal strings get wrapped in `absolute-datetime` clauses when in datetime-diff clauses"))

(deftest ^:parallel wrap-datetime-literal-strings-test-3
  (is (= (:query
          (lib.tu.macros/mbql-query checkins
            {:source-query {:source-table $$checkins}
             :filter       [:=
                            !month.*date
                            [:absolute-datetime (t/zoned-date-time "2018-10-01T00:00Z[UTC]") :month]]}))
         (:query
          (wrap-value-literals
           (lib.tu.macros/mbql-query checkins
             {:source-query {:source-table $$checkins}
              :filter       [:= !month.*date "2018-10-01"]}))))
      (str "make sure datetime literal strings should also get wrapped in `absolute-datetime` clauses if they are "
           "being compared against a type/DateTime `field-literal`")))

(def ^:private unix-timestamp-metadata-provider
  (lib.tu/mock-metadata-provider
   meta/metadata-provider
   {:fields [(merge (meta/field-metadata :checkins :date)
                    {:id                1
                     :base-type         :type/Integer
                     :effective-type    :type/DateTime
                     :coercion-strategy :Coercion/UNIXSeconds->DateTime})]}))

(deftest ^:parallel wrap-datetime-literal-strings-test-4
  (qp.store/with-metadata-provider unix-timestamp-metadata-provider
    (is (= (:query
            (lib.tu.macros/mbql-query checkins
              {:filter [:and
                        [:>
                         !day.date
                         [:absolute-datetime (t/zoned-date-time "2015-06-01T00:00Z[UTC]") :day]]
                        [:<
                         !day.date
                         [:absolute-datetime (t/zoned-date-time "2015-06-03T00:00:00Z[UTC]") :day]]]}))
           (:query
            (wrap-value-literals
             (lib.tu.macros/mbql-query checkins
               {:filter [:and
                         [:> !day.date "2015-06-01"]
                         [:< !day.date "2015-06-03"]]}))))
        "should also apply if the Fields are UNIX timestamps or other things with semantic type of :type/Datetime")))

(deftest ^:parallel wrap-datetime-literal-strings-test-5
  (qp.store/with-metadata-provider unix-timestamp-metadata-provider
    (is (= (:query
            (lib.tu.macros/mbql-query checkins
              {:filter [:and
                        [:>
                         !day.date
                         [:absolute-datetime (t/zoned-date-time "2015-06-01T00:00Z[UTC]") :day]]
                        [:<
                         !day.date
                         [:absolute-datetime (t/zoned-date-time "2015-06-03T00:00:00Z[UTC]") :day]]]}))
           (:query
            (wrap-value-literals
             (lib.tu.macros/mbql-query checkins
               {:filter [:and
                         [:> !day.date "2015-06-01"]
                         [:< !day.date "2015-06-03"]]}))))
        "should also apply if the Fields are UNIX timestamps or other things with semantic type of :type/Datetime")))

(deftest ^:parallel wrap-datetime-literal-strings-test-6
  (mt/with-report-timezone-id "US/Pacific"
    (is (= (:query
            (lib.tu.macros/mbql-query checkins
              {:source-query {:source-table $$checkins}
               :filter       [:=
                              !day.*date
                              [:absolute-datetime (t/zoned-date-time "2018-10-01T00:00-07:00[US/Pacific]") :day]]}))
           (-> (lib.tu.macros/mbql-query checkins
                 {:source-query {:source-table $$checkins}
                  :filter       [:= !day.*date "2018-10-01"]})
               (assoc-in [:settings :report-timezone] "US/Pacific")
               (wrap-value-literals "US/Pacific")
               :query))
        "Datetime literal strings should get parsed in the current report timezone.")))

(deftest ^:parallel string-filters-test
  (testing "string filters like `starts-with` should not parse datetime strings for obvious reasons"
    (is (= (lib.tu.macros/mbql-query checkins
             {:filter [:starts-with
                       !month.date
                       [:value "2018-10-01" {:base_type         :type/Date
                                             :effective_type    :type/Date
                                             :coercion_strategy nil
                                             :semantic_type     nil
                                             :database_type     "DATE"
                                             :unit              :month
                                             :name              "DATE"}]]})
           (wrap-value-literals
            (lib.tu.macros/mbql-query checkins
              {:filter [:starts-with !month.date "2018-10-01"]}))))))

(deftest ^:parallel wrap-literals-in-source-queries-test
  (testing "does wrapping value literals work recursively on source queries as well?"
    (is (= (lib.tu.macros/mbql-query checkins
             {:source-query {:source-table $$checkins
                             :filter       [:>
                                            $date
                                            [:absolute-datetime (t/zoned-date-time "2014-01-01T00:00Z[UTC]") :default]]}})
           (wrap-value-literals
            (lib.tu.macros/mbql-query checkins
              {:source-query {:source-table $$checkins
                              :filter       [:> $date "2014-01-01"]}}))))))

(deftest ^:parallel other-clauses-test
  (testing "Make sure we apply the transformation to predicates in all parts of the query, not only `:filter`"
    (is (= (lib.tu.macros/mbql-query checkins
             {:aggregation [[:share
                             [:> !day.date [:absolute-datetime (t/zoned-date-time "2015-06-01T00:00Z[UTC]") :day]]]]})
           (wrap-value-literals
            (lib.tu.macros/mbql-query checkins
              {:aggregation [[:share [:> !day.date "2015-06-01"]]]}))))))

(deftest ^:parallel base-type-test
  (testing "Make sure base-type from `:field` w/ name is picked up correctly"
    (is (= {:order-by     [[:asc [:field "A" {:base-type :type/Text}]]]
            :filter       [:not [:starts-with
                                 [:field "A" {:base-type :type/Text}]
                                 [:value "f" {:base_type :type/Text}]]]
            :source-query {:native "select 'foo' as a union select null as a union select 'bar' as a"}}
           (#'qp.wrap-value-literals/wrap-value-literals-in-mbql-query
            {:order-by     [[:asc [:field "A" {:base-type :type/Text}]]],
             :filter       [:not [:starts-with [:field "A" {:base-type :type/Text}] "f"]],
             :source-query {:native "select 'foo' as a union select null as a union select 'bar' as a"}}
            nil)))))
