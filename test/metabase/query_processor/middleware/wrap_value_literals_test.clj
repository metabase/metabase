(ns metabase.query-processor.middleware.wrap-value-literals-test
  (:require [clojure.test :refer :all]
            [expectations :refer [expect]]
            [metabase.query-processor.middleware.wrap-value-literals :as wrap-value-literals]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.util.date :as du])
  (:import java.util.TimeZone))

(defn- wrap-value-literals
  {:style/indent 0}
  ([query]
   (wrap-value-literals query "UTC"))

  ([query, ^String timezone-id]
   (qp.test-util/with-everything-store
     (binding [du/*report-timezone* (TimeZone/getTimeZone timezone-id)]
       ((wrap-value-literals/wrap-value-literals identity)
        query)))))

(expect
  (data/mbql-query venues
    {:filter [:>
              $id
              [:value 50 {:base_type     :type/BigInteger
                          :special_type  :type/PK
                          :database_type "BIGINT"}]]})
  (wrap-value-literals
    (data/mbql-query venues
      {:filter [:> $id 50]})))

(expect
  (data/mbql-query venues
    {:filter [:and
              [:> $id [:value 50 {:base_type     :type/BigInteger
                                  :special_type  :type/PK
                                  :database_type "BIGINT"}]]
              [:< $price [:value 5 {:base_type     :type/Integer
                                    :special_type  :type/Category
                                    :database_type "INTEGER"}]]]})
  (wrap-value-literals
    (data/mbql-query venues
      {:filter [:and
                [:> $id 50]
                [:< $price 5]]})))

(deftest parse-datetime-literal-strings-test
  (let [parse-with-timezone (fn [datetime-str, ^String timezone-id]
                              (binding [du/*report-timezone* (TimeZone/getTimeZone timezone-id)]
                                (second (#'wrap-value-literals/add-type-info datetime-str
                                                                             {:unit :day}
                                                                             :report-timezone timezone-id))))]
    (doseq [[timezone expected] {"UTC"        #inst "2018-10-01T00:00:00.000000000-00:00"
                                 "US/Pacific" #inst "2018-10-01T07:00:00.000000000-00:00"}]
      (is (= (du/->Timestamp expected "UTC")
             (parse-with-timezone "2018-10-01" timezone))
          (format "datetime literal string '2018-10-01' parsed with the %s timezone should be %s" timezone expected)))))

(deftest wrap-datetime-literal-strings-test
  (is (= (:query
          (data/mbql-query checkins
            {:filter [:= !month.date [:absolute-datetime (du/->Timestamp "2018-10-01" "UTC") :month]]}))
         (:query
          (data/$ids checkins
            (wrap-value-literals
              (data/mbql-query checkins
                {:filter [:= !month.date "2018-10-01"]})))))
      "do datetime literal strings get wrapped in `absolute-datetime` clauses when in appropriate filters?")

  (is (= (:query
          (data/mbql-query checkins
            {:source-query {:source-table $$checkins}
             :filter       [:=
                            !month.*date
                            [:absolute-datetime (du/->Timestamp "2018-10-01" "UTC") :month]]}))
         (:query
          (wrap-value-literals
            (data/mbql-query checkins
              {:source-query {:source-table $$checkins}
               :filter       [:= !month.*date "2018-10-01"]}))))
      (str "make sure datetime literal strings should also get wrapped in `absolute-datetime` clauses if they are "
           "being compared against a type/DateTime `field-literal`"))

  (is (= (:query
          (data/mbql-query checkins
            {:filter [:= $date [:absolute-datetime (du/->Timestamp "2018-10-01" "UTC") :default]]}))
         (:query
          (wrap-value-literals
            (data/mbql-query checkins
              {:filter [:= $date "2018-10-01"]}))))
      (str "even if the Field in question is not wrapped in a datetime-field clause, we should still auto-bucket the "
           "value, but we should give it a a`:default` unit"))

  (is (= (:query
          (data/dataset sad-toucan-incidents
            (data/mbql-query incidents
              {:filter [:and
                        [:>
                         !day.timestamp
                         [:absolute-datetime #inst "2015-06-01T00:00:00.000000000-00:00" :day]]
                        [:<
                         !day.timestamp
                         [:absolute-datetime #inst "2015-06-03T00:00:00.000000000-00:00" :day]]]})))
         (:query
          (data/dataset sad-toucan-incidents
            (wrap-value-literals
              (data/mbql-query incidents
                {:filter [:and
                          [:> !day.timestamp "2015-06-01"]
                          [:< !day.timestamp "2015-06-03"]]})))))
      "should also apply if the Fields are UNIX timestamps or other things with special type of :type/Datetime")

  (tu/with-temporary-setting-values [report-timezone "US/Pacific"]
    (is (= (:query
            (data/mbql-query checkins
              {:source-query {:source-table $$checkins}
               :filter       [:=
                              !day.*date
                              [:absolute-datetime (du/->Timestamp #inst "2018-10-01T07:00:00.000Z" "UTC") :day]]}))
           (-> (data/mbql-query checkins
                 {:source-query {:source-table $$checkins}
                  :filter       [:= !day.*date "2018-10-01"]})
               (assoc-in [:settings :report-timezone] "US/Pacific")
               (wrap-value-literals "US/Pacific")
               :query))
        "Datetime literal strings should get parsed in the current report timezone.")))

;; string filters like `starts-with` should not parse datetime strings for obvious reasons
(expect
  (data/mbql-query checkins
    {:filter [:starts-with
              !month.date
              [:value "2018-10-01" {:base_type     :type/Date
                                    :special_type  nil
                                    :database_type "DATE"
                                    :unit          :month}]]})
  (wrap-value-literals
    (data/mbql-query checkins
      {:filter [:starts-with !month.date "2018-10-01"]})))

;; does wrapping value literals work recursively on source queries as well?
(expect
  (data/mbql-query checkins
    {:source-query {:source-table $$checkins
                    :filter       [:>
                                   $date
                                   [:absolute-datetime #inst "2014-01-01T00:00:00.000000000-00:00" :default]]}})
  (wrap-value-literals
    (data/mbql-query checkins
      {:source-query {:source-table $$checkins
                      :filter       [:> $date "2014-01-01"]}})))

;; Make sure we apply the transformation to predicates in all parts of the query, not only `:filter`
(expect
  (data/dataset sad-toucan-incidents
    (data/mbql-query incidents
      {:aggregation [[:share
                      [:> !day.timestamp [:absolute-datetime (du/->Timestamp "2015-06-01" "UTC") :day]]]]}))

  (data/dataset sad-toucan-incidents
    (wrap-value-literals
      (data/mbql-query incidents
        {:aggregation [[:share [:> !day.timestamp "2015-06-01"]]]}))))
