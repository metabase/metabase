(ns metabase.query-processor.middleware.wrap-value-literals-test
  (:require [expectations :refer [expect]]
            [metabase.query-processor.middleware.wrap-value-literals :as wrap-value-literals]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test.data :as data]
            [metabase.util.date :as du]))

(defn- wrap-value-literals {:style/indent 0} [query]
  (qp.test-util/with-everything-store
    (binding [du/*report-timezone* (java.util.TimeZone/getTimeZone "UTC")]
      ((wrap-value-literals/wrap-value-literals identity)
       query))))

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

;; do datetime literal strings get wrapped in `absolute-datetime` clauses when in appropriate filters?
(expect
  (data/mbql-query checkins
    {:filter [:= !month.date [:absolute-datetime (du/->Timestamp "2018-10-01" "UTC") :month]]})
  (data/$ids checkins
    (wrap-value-literals
      (data/mbql-query checkins
        {:filter [:= !month.date "2018-10-01"]}))))

;; make sure datetime literal strings should also get wrapped in `absolute-datetime` clauses if they are being
;; compared against a type/DateTime `field-literal`
(expect
  (data/mbql-query checkins
    {:source-query {:source-table $$checkins}
     :filter       [:=
                    !month.*date
                    [:absolute-datetime (du/->Timestamp "2018-10-01" "UTC") :month]]})
  (wrap-value-literals
    (data/mbql-query checkins
      {:source-query {:source-table $$checkins}
       :filter       [:= !month.*date "2018-10-01"]})))

;; even if the Field in question is not wrapped in a datetime-field clause, we should still auto-bucket the value, but
;; we should give it a `:default` unit
(expect
  (data/mbql-query checkins
    {:filter [:= $date [:absolute-datetime (du/->Timestamp "2018-10-01" "UTC") :default]]})
  (wrap-value-literals
    (data/mbql-query checkins
      {:filter [:= $date "2018-10-01"]})))

;; should also apply if the Fields are UNIX timestamps or other things with special type of :type/Datetime
(expect
  (data/dataset sad-toucan-incidents
    (data/mbql-query incidents
      {:filter [:and
                [:>
                 !day.timestamp
                 [:absolute-datetime #inst "2015-06-01T00:00:00.000000000-00:00" :day]]
                [:<
                 !day.timestamp
                 [:absolute-datetime #inst "2015-06-03T00:00:00.000000000-00:00" :day]]]}))
  (data/dataset sad-toucan-incidents
    (wrap-value-literals
      (data/mbql-query incidents
        {:filter [:and
                  [:> !day.timestamp "2015-06-01"]
                  [:< !day.timestamp "2015-06-03"]]}))))

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
