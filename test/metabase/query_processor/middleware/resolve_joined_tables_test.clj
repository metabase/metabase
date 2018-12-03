(ns metabase.query-processor.middleware.resolve-joined-tables-test
  (:require [expectations :refer :all]
            [metabase.query-processor.middleware.resolve-joined-tables :as resolve-joined-tables]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test.data :as data]
            [metabase.query-processor.store :as qp.store]))

(defn- resolve-joined-tables [query]
  (qp.test-util/with-everything-store
    ((resolve-joined-tables/resolve-joined-tables identity) {:database (data/id)
                                                             :type     :query
                                                             :query    query})))

;; make sure `:join-tables` get added automatically for `:fk->` clauses
(expect
  {:database (data/id)
   :type     :query
   :query    (data/$ids venues
               {:source-table $$table
                :fields       [[:field-id $name]
                               [:fk-> [:field-id $category_id] [:field-id $categories.name]]]
                :join-tables  [{:join-alias  "CATEGORIES__via__CATEGORY_ID"
                                :table-id    (data/id :categories)
                                :fk-field-id $category_id
                                :pk-field-id $categories.id}]})}
  (resolve-joined-tables
   (data/$ids venues
     {:source-table $$table
      :fields       [[:field-id $name]
                     [:fk-> [:field-id $category_id] [:field-id $categories.name]]]})))

;; For FK clauses inside nested source queries, we should add the `:join-tables` info to the nested query instead of
;; at the top level (#8972)
(expect
  {:database (data/id)
   :type     :query
   :query    {:source-query
              (data/$ids venues
                {:source-table $$table
                 :fields       [[:field-id $name]
                                [:fk-> [:field-id $category_id] [:field-id $categories.name]]]
                 :join-tables  [{:join-alias  "CATEGORIES__via__CATEGORY_ID"
                                 :table-id    (data/id :categories)
                                 :fk-field-id $category_id
                                 :pk-field-id $categories.id}]})}}
  (resolve-joined-tables
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
                                 [:fk-> [:field-id $category_id] [:field-id $categories.name]]]
                  :join-tables  [{:join-alias  "CATEGORIES__via__CATEGORY_ID"
                                  :table-id    (data/id :categories)
                                  :fk-field-id $category_id
                                  :pk-field-id $categories.id}]})}}}
  (resolve-joined-tables
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
                :breakout     [[:fk-> [:field-id $venue_id] [:field-id $venues.price]]]
                :order-by     [[:asc [:fk-> [:field-id $venue_id] [:field-id $venues.price]]]]
                :join-tables  [{:join-alias  "VENUES__via__VENUE_ID"
                                :table-id    (data/id :venues)
                                :fk-field-id $venue_id
                                :pk-field-id $venues.id}]})}
  (resolve-joined-tables
   (data/$ids [checkins {:wrap-field-ids? true}]
     {:source-query {:source-table $$table
                     :filter       [:> $date "2014-01-01"]}
      :aggregation  [[:count]]
      :breakout     [$venue_id->venues.price]
      :order-by     [[:asc $venue_id->venues.price]]})))
