(ns metabase.query-processor.middleware.wrap-value-literals-test
  (:require [clojure.test :refer :all]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.query-processor.middleware.wrap-value-literals :as wrap-value-literals]
            [metabase.query-processor.timezone :as qp.timezone]))

(driver/register! ::tz-driver, :abstract? true)

(defmethod driver/supports? [::tz-driver :set-timezone] [_ _] true)

(defn- wrap-value-literals
  {:style/indent 0}
  ([query]
   (wrap-value-literals query "UTC"))

  ([query, ^String timezone-id]
   (mt/with-everything-store
     (mt/with-results-timezone-id timezone-id
       (:pre (mt/test-qp-middleware wrap-value-literals/wrap-value-literals query))))))

(deftest wrap-integers-test
  (is (= (mt/mbql-query venues
           {:filter [:>
                     $id
                     [:value 50 {:base_type     :type/BigInteger
                                 :special_type  :type/PK
                                 :database_type "BIGINT"
                                 :name "ID"}]]})
         (wrap-value-literals
           (mt/mbql-query venues
             {:filter [:> $id 50]}))))
  (is (= (mt/mbql-query venues
           {:filter [:and
                     [:> $id [:value 50 {:base_type     :type/BigInteger
                                         :special_type  :type/PK
                                         :database_type "BIGINT"
                                         :name "ID"}]]
                     [:< $price [:value 5 {:base_type     :type/Integer
                                           :special_type  :type/Category
                                           :database_type "INTEGER"
                                           :name "PRICE"}]]]})
         (wrap-value-literals
           (mt/mbql-query venues
             {:filter [:and
                       [:> $id 50]
                       [:< $price 5]]})))))

(deftest parse-datetime-literal-strings-test
  (let [parse-with-timezone (fn [datetime-str, ^String timezone-id]
                              (driver/with-driver ::tz-driver
                                (mt/with-temporary-setting-values [report-timezone timezone-id]
                                  (is (= (qp.timezone/results-timezone-id)
                                         timezone-id)
                                      "Make sure `results-timezone-id` is returning the bound value")
                                  (second (#'wrap-value-literals/add-type-info datetime-str
                                                                               {:unit :day})))))]
    (doseq [[timezone expected] {"UTC"        (t/zoned-date-time "2018-10-01T00:00:00Z[UTC]")
                                 "US/Pacific" (t/zoned-date-time "2018-10-01T00:00:00-07:00[US/Pacific]")}]
      (is (= expected
             (parse-with-timezone "2018-10-01" timezone))
          (format "datetime literal string '2018-10-01' parsed with the %s timezone should be %s" timezone expected)))))

(deftest wrap-datetime-literal-strings-test
  (is (= (:query
          (mt/mbql-query checkins
            {:filter [:= !month.date [:absolute-datetime (t/zoned-date-time "2018-10-01T00:00Z[UTC]") :month]]}))
         (-> (mt/$ids checkins
               (mt/mbql-query checkins
                 {:filter [:= !month.date "2018-10-01"]}))
             wrap-value-literals
             :query))
      "do datetime literal strings get wrapped in `absolute-datetime` clauses when in appropriate filters?")

  (is (= (:query
          (mt/mbql-query checkins
            {:source-query {:source-table $$checkins}
             :filter       [:=
                            !month.*date
                            [:absolute-datetime (t/zoned-date-time "2018-10-01T00:00Z[UTC]") :month]]}))
         (:query
          (wrap-value-literals
            (mt/mbql-query checkins
              {:source-query {:source-table $$checkins}
               :filter       [:= !month.*date "2018-10-01"]}))))
      (str "make sure datetime literal strings should also get wrapped in `absolute-datetime` clauses if they are "
           "being compared against a type/DateTime `field-literal`"))

  (is (= (:query
          (mt/mbql-query checkins
            {:filter [:= $date [:absolute-datetime (t/zoned-date-time "2018-10-01T00:00Z[UTC]") :default]]}))
         (:query
          (wrap-value-literals
            (mt/mbql-query checkins
              {:filter [:= $date "2018-10-01"]}))))
      (str "even if the Field in question is not wrapped in a datetime-field clause, we should still auto-bucket the "
           "value, but we should give it a a`:default` unit"))

  (is (= (:query
          (mt/dataset sad-toucan-incidents
            (mt/mbql-query incidents
              {:filter [:and
                        [:>
                         !day.timestamp
                         [:absolute-datetime (t/zoned-date-time "2015-06-01T00:00Z[UTC]") :day]]
                        [:<
                         !day.timestamp
                         [:absolute-datetime (t/zoned-date-time "2015-06-03T00:00:00Z[UTC]") :day]]]})))
         (:query
          (mt/dataset sad-toucan-incidents
            (wrap-value-literals
              (mt/mbql-query incidents
                {:filter [:and
                          [:> !day.timestamp "2015-06-01"]
                          [:< !day.timestamp "2015-06-03"]]})))))
      "should also apply if the Fields are UNIX timestamps or other things with special type of :type/Datetime")

  (mt/with-temporary-setting-values [report-timezone "US/Pacific"]
    (is (= (:query
            (mt/mbql-query checkins
              {:source-query {:source-table $$checkins}
               :filter       [:=
                              !day.*date
                              [:absolute-datetime (t/zoned-date-time "2018-10-01T00:00-07:00[US/Pacific]") :day]]}))
           (-> (mt/mbql-query checkins
                 {:source-query {:source-table $$checkins}
                  :filter       [:= !day.*date "2018-10-01"]})
               (assoc-in [:settings :report-timezone] "US/Pacific")
               (wrap-value-literals "US/Pacific")
               :query))
        "Datetime literal strings should get parsed in the current report timezone.")))

(deftest string-filters-test
  (testing "string filters like `starts-with` should not parse datetime strings for obvious reasons"
    (is (= (mt/mbql-query checkins
             {:filter [:starts-with
                       !month.date
                       [:value "2018-10-01" {:base_type     :type/Date
                                             :special_type  nil
                                             :database_type "DATE"
                                             :unit          :month
                                             :name          "DATE"}]]})
           (wrap-value-literals
             (mt/mbql-query checkins
               {:filter [:starts-with !month.date "2018-10-01"]}))))))

(deftest wrap-literals-in-source-queries-test
  (testing "does wrapping value literals work recursively on source queries as well?"
    (is (=
         (mt/mbql-query checkins
           {:source-query {:source-table $$checkins
                           :filter       [:>
                                          $date
                                          [:absolute-datetime (t/zoned-date-time "2014-01-01T00:00Z[UTC]") :default]]}})
         (wrap-value-literals
           (mt/mbql-query checkins
             {:source-query {:source-table $$checkins
                             :filter       [:> $date "2014-01-01"]}}))))))

(deftest other-clauses-test
  (testing "Make sure we apply the transformation to predicates in all parts of the query, not only `:filter`"
    (is (= (mt/dataset sad-toucan-incidents
             (mt/mbql-query incidents
               {:aggregation [[:share
                               [:> !day.timestamp [:absolute-datetime (t/zoned-date-time "2015-06-01T00:00Z[UTC]") :day]]]]}))
           (mt/dataset sad-toucan-incidents
             (wrap-value-literals
               (mt/mbql-query incidents
                 {:aggregation [[:share [:> !day.timestamp "2015-06-01"]]]})))))))
