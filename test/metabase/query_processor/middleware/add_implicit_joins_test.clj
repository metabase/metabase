(ns metabase.query-processor.middleware.add-implicit-joins-test
  (:require [expectations :refer [expect]]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.middleware.add-implicit-joins :as add-implicit-joins]
            [metabase.query-processor.store :as qp.store]
            [metabase.test.data :as data]
            [metabase.test.data.interface :as tx]
            [toucan.util.test :as tt]))

(defn- add-implicit-joins [query]
  (driver/with-driver (tx/driver)
    (qp.store/with-store
      (qp.store/fetch-and-store-database! (data/id))
      (:pre (mt/test-qp-middleware add-implicit-joins/add-implicit-joins query)))))

;; make sure `:joins` get added automatically for `:fk->` clauses
(expect
  (data/mbql-query venues
    {:source-table $$venues
     :fields       [$name &CATEGORIES__via__CATEGORY_ID.categories.name]
     :joins        [{:source-table $$categories
                     :alias        "CATEGORIES__via__CATEGORY_ID"
                     :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                     :strategy     :left-join
                     :fields       :none
                     :fk-field-id  %category_id}]})
  (add-implicit-joins
   (data/mbql-query venues
     {:source-table $$venues
      :fields [$name $category_id->categories.name]})))

;; For FK clauses inside nested source queries, we should add the `:joins` info to the nested query instead of
;; at the top level (#8972)
(expect
  (data/mbql-query venues
    {:source-query
     {:source-table $$venues
      :fields       [$name &CATEGORIES__via__CATEGORY_ID.categories.name]
      :joins        [{:source-table $$categories
                      :alias        "CATEGORIES__via__CATEGORY_ID"
                      :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                      :strategy     :left-join
                      :fields       :none
                      :fk-field-id  %category_id}]}})
  (add-implicit-joins
   (data/mbql-query venues
     {:source-query
      {:source-table $$venues
       :fields       [$name $category_id->categories.name]}})))

;; we should handle nested-nested queries correctly as well
(expect
  (data/mbql-query venues
    {:source-query
     {:source-query
      {:source-table $$venues
       :fields       [$name &CATEGORIES__via__CATEGORY_ID.categories.name]
       :joins        [{:source-table $$categories
                       :alias        "CATEGORIES__via__CATEGORY_ID"
                       :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
                       :strategy     :left-join
                       :fields       :none
                       :fk-field-id  %category_id}]}}})
  (add-implicit-joins
   (data/mbql-query venues
     {:source-query
      {:source-query
       {:source-table $$venues
        :fields       [$name $category_id->categories.name]}}})))

;; ok, so apparently if you specify a source table at a deeper level of nesting we should still add JOINs as
;; appropriate for that Table if you specify an `fk->` clause in an a higher level. Does this make any sense at all?
;;
;; TODO - I'm not sure I understand why we add the JOIN to the outer level in this case. Does it make sense?
(expect
  (data/mbql-query checkins
    {:source-query {:source-table $$checkins
                    :filter       [:> $date "2014-01-01"]}
     :aggregation  [[:count]]
     :breakout     [&VENUES__via__VENUE_ID.venues.price]
     :order-by     [[:asc &VENUES__via__VENUE_ID.venues.price]]
     :joins        [{:source-table $$venues
                     :alias        "VENUES__via__VENUE_ID"
                     :condition    [:= $venue_id &VENUES__via__VENUE_ID.venues.id]
                     :strategy     :left-join
                     :fields       :none
                     :fk-field-id  %venue_id}]})
  (add-implicit-joins
   (data/mbql-query checkins
     {:source-query {:source-table $$checkins
                     :filter       [:> $date "2014-01-01"]}
      :aggregation  [[:count]]
      :breakout     [$venue_id->venues.price]
      :order-by     [[:asc $venue_id->venues.price]]})))

;; Test that joining against a table in a different DB throws and Exception
(expect
  Exception
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Field    [{field-id :id}    {:table_id table-id}]]
    (add-implicit-joins
     (data/mbql-query checkins
       {:source-query {:source-table $$checkins
                       :filter       [:> $date "2014-01-01"]}
        :aggregation  [[:count]]
        :breakout     [[:fk-> $venue_id field-id]]
        :order-by     [[:asc $venue_id->venues.price]]}))))

;; Test that adding implicit joins still works correctly if the query also contains explicit joins
(expect
  (data/mbql-query checkins
    {:source-table $$checkins
     :aggregation  [[:sum [:joined-field "USERS__via__USER_ID" $users.id]]]
     :breakout     [$id]
     :joins        [{:alias        "u"
                     :source-table $$users
                     :condition    [:= *user_id &u.users.id]}
                    {:source-table $$users
                     :alias        "USERS__via__USER_ID"
                     :strategy     :left-join
                     :condition    [:= $user_id &USERS__via__USER_ID.users.id]
                     :fk-field-id  %checkins.user_id
                     :fields       :none}]
     :limit        10})
  (add-implicit-joins
   (data/mbql-query checkins
     {:source-table $$checkins
      :aggregation  [[:sum $user_id->users.id]]
      :breakout     [$id]
      :joins        [{:alias        "u"
                      :source-table $$users
                      :condition    [:= *user_id &u.users.id]}]
      :limit        10})))

;; Test that adding implicit joins still works correctly if the query also contains explicit joins in nested source
;; queries
(expect
  (data/mbql-query checkins
    {:source-query {:source-table $$checkins
                    :aggregation  [[:sum &USERS__via__USER_ID.users.id]]
                    :breakout     [$id]
                    :joins        [{:source-table $$users
                                    :alias        "USERS__via__USER_ID"
                                    :strategy     :left-join
                                    :condition    [:= $user_id &USERS__via__USER_ID.users.id]
                                    :fk-field-id  %checkins.user_id
                                    :fields       :none}]}
     :joins        [{:alias        "u"
                     :source-table $$users
                     :condition    [:= *user_id &u.users.id]}]
     :limit        10})
  (add-implicit-joins
   (data/mbql-query checkins
     {:source-query {:source-table $$checkins
                     :aggregation  [[:sum $user_id->users.id]]
                     :breakout     [$id]}
      :joins        [{:alias        "u"
                      :source-table $$users
                      :condition    [:= *user_id &u.users.id]}]
      :limit        10})))
