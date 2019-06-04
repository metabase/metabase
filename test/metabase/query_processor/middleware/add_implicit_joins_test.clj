(ns metabase.query-processor.middleware.add-implicit-joins-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [database :refer [Database]]
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor
             [store :as qp.store]
             [test-util :as qp.test-util]]
            [metabase.query-processor.middleware.add-implicit-joins :as add-implicit-joins]
            [metabase.test.data :as data]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- add-implicit-joins [query]
  (qp.test-util/with-everything-store
    ((add-implicit-joins/add-implicit-joins identity) {:database (data/id)
                                                       :type     :query
                                                       :query    query})))

;; make sure `:joins` get added automatically for `:fk->` clauses
(expect
  {:database (data/id)
   :type     :query
   :query    (data/$ids venues
               {:source-table $$table
                :fields       [[:field-id $name]
                               [:joined-field "CATEGORIES__via__CATEGORY_ID" [:field-id $categories.name]]]
                :joins        [{:source-table (data/id :categories)
                                :alias        "CATEGORIES__via__CATEGORY_ID"
                                :condition    [:=
                                               [:field-id $category_id]
                                               [:joined-field "CATEGORIES__via__CATEGORY_ID" [:field-id $categories.id]]]
                                :strategy     :left-join
                                :fields       :none
                                :fk-field-id  $category_id}]})}
  (add-implicit-joins
   (data/$ids venues
     {:source-table $$table
      :fields       [[:field-id $name]
                     [:fk-> [:field-id $category_id] [:field-id $categories.name]]]})))

;; For FK clauses inside nested source queries, we should add the `:joins` info to the nested query instead of
;; at the top level (#8972)
(expect
  {:database (data/id)
   :type     :query
   :query    {:source-query
              (data/$ids venues
                {:source-table $$table
                 :fields       [[:field-id $name]
                                [:joined-field "CATEGORIES__via__CATEGORY_ID" [:field-id $categories.name]]]
                 :joins        [{:source-table (data/id :categories)
                                 :alias        "CATEGORIES__via__CATEGORY_ID"
                                 :condition    [:=
                                                [:field-id $category_id]
                                                [:joined-field "CATEGORIES__via__CATEGORY_ID" [:field-id $categories.id]]]
                                 :strategy     :left-join
                                 :fields       :none
                                 :fk-field-id  $category_id}]})}}
  (add-implicit-joins
   {:source-query
    (data/$ids venues
      {:source-table $$table
       :fields       [[:field-id $name]
                      [:fk-> [:field-id $category_id] [:field-id $categories.name]]]})}))

;; we should handle nested-nested queries correctly as well
(expect
  {:database (data/id)
   :type     :query
   :query    {:source-query
              {:source-query
               (data/$ids venues
                 {:source-table $$table
                  :fields       [[:field-id $name]
                                 [:joined-field "CATEGORIES__via__CATEGORY_ID" [:field-id $categories.name]]]
                  :joins        [{:source-table (data/id :categories)
                                  :alias        "CATEGORIES__via__CATEGORY_ID"
                                  :condition    [:=
                                                 [:field-id $category_id]
                                                 [:joined-field "CATEGORIES__via__CATEGORY_ID" [:field-id $categories.id]]]
                                  :strategy     :left-join
                                  :fields       :none
                                  :fk-field-id  $category_id}]})}}}
  (add-implicit-joins
   {:source-query
    {:source-query
     (data/$ids venues
       {:source-table $$table
        :fields       [[:field-id $name]
                       [:fk-> [:field-id $category_id] [:field-id $categories.name]]]})}}))

;; ok, so apparently if you specify a source table at a deeper level of nesting we should still add JOINs as
;; appropriate for that Table if you specify an `fk->` clause in an a higher level. Does this make any sense at all?
;;
;; TODO - I'm not sure I understand why we add the JOIN to the outer level in this case. Does it make sense?
(expect
  {:database (data/id)
   :type     :query
   :query    (data/$ids checkins
               {:source-query {:source-table $$table
                               :filter       [:> [:field-id $date] "2014-01-01"]}
                :aggregation  [[:count]]
                :breakout     [[:joined-field "VENUES__via__VENUE_ID" [:field-id $venues.price]]]
                :order-by     [[:asc [:joined-field "VENUES__via__VENUE_ID" [:field-id $venues.price]]]]
                :joins        [{:source-table (data/id :venues)
                                :alias        "VENUES__via__VENUE_ID"
                                :condition    [:=
                                               [:field-id $venue_id]
                                               [:joined-field "VENUES__via__VENUE_ID" [:field-id $venues.id]]]
                                :strategy     :left-join
                                :fields       :none
                                :fk-field-id  $venue_id}]})}
  (add-implicit-joins
   (data/$ids [checkins {:wrap-field-ids? true}]
     {:source-query {:source-table $$table
                     :filter       [:> $date "2014-01-01"]}
      :aggregation  [[:count]]
      :breakout     [$venue_id->venues.price]
      :order-by     [[:asc $venue_id->venues.price]]})))

;; Test that middleware stores joined tables in QP store
(expect
  {:database "test-data"
   :tables   #{"CATEGORIES" "VENUES"}
   :fields   #{["VENUES" "CATEGORY_ID"]
               ["CATEGORIES" "ID"]
               ["CATEGORIES" "NAME"]}}
  (qp.store/with-store
    (qp.store/store-database! (db/select-one (into [Database] qp.store/database-columns-to-fetch) :id (data/id)))
    (qp.store/store-table!    (db/select-one (into [Table] qp.store/table-columns-to-fetch) :id (data/id :venues)))
    (doseq [field-id [(data/id :categories :name) (data/id :venues :category_id)]]
      (qp.store/store-field!    (db/select-one (into [Field] qp.store/field-columns-to-fetch) :id field-id)))
    ((add-implicit-joins/add-implicit-joins identity)
     (data/mbql-query venues
       {:fields [$name $category_id->categories.name]}))
    (qp.test-util/store-contents)))

;; Test that joining against a table in a different DB throws and Exception
(expect
  Exception
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]
                  Field    [{field-id :id}    {:table_id table-id}]]
    (add-implicit-joins
     (data/$ids [checkins {:wrap-field-ids? true}]
       {:source-query {:source-table $$table
                       :filter       [:> $date "2014-01-01"]}
        :aggregation  [[:count]]
        :breakout     [[:fk-> $venue_id [:field-id field-id]]]
        :order-by     [[:asc $venue_id->venues.price]]}))))
