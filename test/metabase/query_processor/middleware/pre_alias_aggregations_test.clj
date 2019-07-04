(ns metabase.query-processor.middleware.pre-alias-aggregations-test
  "Tests for the `pre-alias-aggregations` middleware. For the most part we don't need to test the actual pre-alias
  logic, as that comes from the MBQL library and is tested thoroughly there -- we just need to test that it gets
  applied in the correct places."
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.query-processor.middleware.pre-alias-aggregations :as pre-alias-aggregations]
            [metabase.test.data :as data]))

(defn- pre-alias [query]
  (driver/with-driver (or driver/*driver* :h2)
    ((pre-alias-aggregations/pre-alias-aggregations identity) query)))

;; do aggregations get pre-aliased by this middleware?
(expect
  (data/mbql-query checkins
    {:source-table $$checkins
     :aggregation [[:named [:sum $user_id]  "sum"   {:use-as-display-name? false}]
                   [:named [:sum $venue_id] "sum_2" {:use-as-display-name? false}]]})
  (pre-alias
   (data/mbql-query checkins
     {:source-table $$checkins
      :aggregation  [[:sum $user_id] [:sum $venue_id]]})))

;; if one or more aggregations are already named, do things still work correctly?
(expect
  (data/mbql-query checkins
    {:source-table $$checkins
     :aggregation [[:named [:sum $user_id]  "sum"   {:use-as-display-name? false}]
                   [:named [:sum $venue_id] "sum_2"]]})
  (pre-alias
   (data/mbql-query checkins
     {:source-table $$checkins
      :aggregation  [[:sum $user_id]
                     [:named [:sum $venue_id] "sum"]]})))

;; do aggregations inside source queries get pre-aliased?
(expect
  (data/mbql-query checkins
    {:source-query {:source-table $$checkins
                    :aggregation  [[:named [:sum $user_id]  "sum"   {:use-as-display-name? false}]
                                   [:named [:sum $venue_id] "sum_2" {:use-as-display-name? false}]]}
     :aggregation  [[:named [:count] "count" {:use-as-display-name? false}]]})
  (pre-alias
   (data/mbql-query checkins
     {:source-query {:source-table $$checkins
                     :aggregation  [[:sum $user_id] [:sum $venue_id]]}
      :aggregation  [[:count]]})))

;; do aggregatons inside of source queries inside joins get pre-aliased?
(expect
  (data/mbql-query checkins
    {:source-table $$venues
     :aggregation  [[:named [:count] "count" {:use-as-display-name? false}]]
     :joins        [{:source-query {:source-table $$checkins
                                    :aggregation  [[:named [:sum $user_id]  "sum"   {:use-as-display-name? false}]
                                                   [:named [:sum $venue_id] "sum_2" {:use-as-display-name? false}]]
                                    :breakout     [$venue_id]}
                     :alias        "checkins"
                     :condition    [:= &checkins.venue_id $venues.id]}]})
  (pre-alias
   (data/mbql-query checkins
     {:source-table $$venues
      :aggregation  [[:count]]
      :joins        [{:source-query {:source-table $$checkins
                                     :aggregation  [[:sum $user_id] [:sum $venue_id]]
                                     :breakout     [$venue_id]}
                      :alias        "checkins"
                      :condition    [:= &checkins.venue_id $venues.id]}]})))

;; does pre-aliasing work the way we'd expect with expressions?
(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :aggregation  [[:named [:+ 20 [:sum [:field-id 2]]] "20 + sum" {:use-as-display-name? false}]]}}
  (pre-alias
   {:database 1
    :type     :query
    :query    {:source-table 1
               :aggregation  [[:+ 20 [:sum [:field-id 2]]]]}}))

;; we should use `driver/format-custom-field-name` on the generated aggregation names in case the drivers need to
;; tweak the default names we generate
(driver/register! ::test-driver, :abstract? true, :parent :sql)

;; this implementation prepends an underscore to any name that starts with a number. Some DBs, such as BigQuery, do
;; not allow aliases that start with an underscore
(defmethod driver/format-custom-field-name ::test-driver [_ custom-field-name]
  (str/replace custom-field-name #"(^\d)" "_$1"))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :aggregation  [[:named [:+ 20 [:sum [:field-id 2]]] "_20 + sum" {:use-as-display-name? false}]
                             [:named [:count] "count" {:use-as-display-name? false}]]}}
  (driver/with-driver ::test-driver
    (pre-alias
     {:database 1
      :type     :query
      :query    {:source-table 1
                 :aggregation  [[:+ 20 [:sum [:field-id 2]]]
                                [:count]]}})))
