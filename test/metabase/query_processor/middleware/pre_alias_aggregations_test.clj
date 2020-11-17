(ns metabase.query-processor.middleware.pre-alias-aggregations-test
  "Tests for the `pre-alias-aggregations` middleware. For the most part we don't need to test the actual pre-alias
  logic, as that comes from the MBQL library and is tested thoroughly there -- we just need to test that it gets
  applied in the correct places."
  (:require [expectations :refer [expect]]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.query-processor.middleware.pre-alias-aggregations :as pre-alias-aggregations]
            [metabase.test.data :as data]))

(defn- pre-alias [query]
  (driver/with-driver (or driver/*driver* :h2)
    (:pre (mt/test-qp-middleware pre-alias-aggregations/pre-alias-aggregations query))))

;; do aggregations get pre-aliased by this middleware?
(expect
  (data/mbql-query checkins
    {:source-table $$checkins
     :aggregation [[:aggregation-options [:sum $user_id]  {:name "sum"} ]
                   [:aggregation-options [:sum $venue_id] {:name "sum_2"} ]]})
  (pre-alias
   (data/mbql-query checkins
     {:source-table $$checkins
      :aggregation  [[:sum $user_id] [:sum $venue_id]]})))

;; if one or more aggregations are already named, do things still work correctly?
(expect
  (data/mbql-query checkins
    {:source-table $$checkins
     :aggregation [[:aggregation-options [:sum $user_id]  {:name "sum"}]
                   [:aggregation-options [:sum $venue_id] {:name "sum_2"}]]})
  (pre-alias
   (data/mbql-query checkins
     {:source-table $$checkins
      :aggregation  [[:sum $user_id]
                     [:aggregation-options [:sum $venue_id] {:name "sum"}]]})))

;; do aggregations inside source queries get pre-aliased?
(expect
  (data/mbql-query checkins
    {:source-query {:source-table $$checkins
                    :aggregation  [[:aggregation-options [:sum $user_id]  {:name "sum"}]
                                   [:aggregation-options [:sum $venue_id] {:name "sum_2"}]]}
     :aggregation  [[:aggregation-options [:count] {:name "count"}]]})
  (pre-alias
   (data/mbql-query checkins
     {:source-query {:source-table $$checkins
                     :aggregation  [[:sum $user_id] [:sum $venue_id]]}
      :aggregation  [[:count]]})))

;; do aggregatons inside of source queries inside joins get pre-aliased?
(expect
  (data/mbql-query checkins
    {:source-table $$venues
     :aggregation  [[:aggregation-options [:count] {:name "count"}]]
     :joins        [{:source-query {:source-table $$checkins
                                    :aggregation  [[:aggregation-options [:sum $user_id]  {:name "sum"}]
                                                   [:aggregation-options [:sum $venue_id] {:name "sum_2"}]]
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
              :aggregation  [[:aggregation-options [:+ 20 [:sum [:field-id 2]]] {:name "expression"}]]}}
  (pre-alias
   {:database 1
    :type     :query
    :query    {:source-table 1
               :aggregation  [[:+ 20 [:sum [:field-id 2]]]]}}))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :aggregation  [[:aggregation-options
                              [:+ 20 [:sum [:field-id 2]]]
                              {:name "expression"}]
                             [:aggregation-options
                              [:- 20 [:sum [:field-id 2]]]
                              {:name "expression_2"}]]}}
  (pre-alias
   {:database 1
    :type     :query
    :query    {:source-table 1
               :aggregation  [[:+ 20 [:sum [:field-id 2]]]
                              [:- 20 [:sum [:field-id 2]]]]}}))

;; we should use `driver/format-custom-field-name` on the generated aggregation names in case the drivers need to
;; tweak the default names we generate.
;;
;; TODO - `format-custom-field-name` is officially deprecated because it is no longer needed now that custom
;; aggregation names are not used in queries themselves. It can be removed soon, and we can remove this test
(driver/register! ::test-driver, :abstract? true, :parent :sql)

;; this implementation prepends an underscore to any all names. Some DBs, such as BigQuery, do ;; not allow aliases
;; that start with an number for example
(defmethod driver/format-custom-field-name ::test-driver [_ custom-field-name]
  (str \_ custom-field-name))

(expect
  {:database 1
   :type     :query
   :query    {:source-table 1
              :aggregation  [[:aggregation-options [:+ 20 [:sum [:field-id 2]]] {:name "_expression"}]
                             [:aggregation-options [:count] {:name "_count"}]]}}
  (driver/with-driver ::test-driver
    (pre-alias
     {:database 1
      :type     :query
      :query    {:source-table 1
                 :aggregation  [[:+ 20 [:sum [:field-id 2]]]
                                [:count]]}})))
