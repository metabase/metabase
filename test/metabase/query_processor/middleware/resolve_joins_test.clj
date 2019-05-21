(ns metabase.query-processor.middleware.resolve-joins-test
  (:require [expectations :refer [expect]]
            [metabase.models
             [database :refer [Database]]
             [table :refer [Table]]]
            [metabase.query-processor
             [store :as qp.store]
             [test-util :as qp.test-util]]
            [metabase.query-processor.middleware.resolve-joins :as resolve-joins]
            [metabase.test.data :as data]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(defn- resolve-joins [{{:keys [source-table]} :query, :as query}]
  (if-not (qp.store/initialized?)
    (qp.store/with-store
      (resolve-joins query))
    (do
      (qp.store/store-database! (db/select-one (into [Database] qp.store/database-columns-to-fetch) :id (data/id)))
      (qp.store/store-table! (db/select-one (into [Table] qp.store/table-columns-to-fetch) :id source-table))
      (#'resolve-joins/resolve-joins* query))))

;; Does the middleware function if the query has no joins?
(expect
  (data/mbql-query venues)
  (resolve-joins
   (data/mbql-query venues)))

(defn- resolve-joins-and-inspect-store [query]
  (qp.store/with-store
    {:resolved (resolve-joins query)
     :store    (qp.test-util/store-contents)}))

;; Can we resolve some joins w/ fields = none?
(expect
  {:resolved
   (data/mbql-query venues
     {:joins
      [{:source-table $$categories
        :alias        "c",
        :strategy     :left-join
        :condition    [:= $category_id [:joined-field "c" $categories.id]]}]})
   :store
   {:database "test-data",
    :tables   #{"CATEGORIES" "VENUES"},
    :fields   #{["CATEGORIES" "ID"] ["VENUES" "CATEGORY_ID"]}}}
  (resolve-joins-and-inspect-store
   (data/mbql-query venues
     {:joins [{:source-table $$categories
               :alias        "c"
               :condition    [:= $category_id [:joined-field "c" $categories.id]]
               :fields       :none}]})))

;; Can we resolve some joins w/ fields = all ???
(expect
  {:resolved
   (data/mbql-query venues
     {:joins
      [{:source-table $$categories
        :alias        "c"
        :strategy     :left-join
        :condition    [:= $category_id [:joined-field "c" $categories.id]]}]
      :fields [$venues.id
               $venues.name
               [:joined-field "c" $categories.id]
               [:joined-field "c" $categories.name]]})
   :store
   {:database "test-data"
    :tables   #{"CATEGORIES" "VENUES"}
    :fields   #{["CATEGORIES" "ID"]
                ["VENUES" "CATEGORY_ID"]
                ["CATEGORIES" "NAME"]}}}
  (resolve-joins-and-inspect-store
   (data/mbql-query venues
     {:fields [$venues.id $venues.name]
      :joins  [{:source-table $$categories
                :alias        "c"
                :condition    [:= $category_id [:joined-field "c" $categories.id]]
                :fields       :all}]})))

;; can we resolve joins w/ fields = <sequence>
(expect
  {:resolved
   (data/mbql-query venues
     {:joins
      [{:source-table $$categories
        :alias        "c"
        :strategy     :left-join
        :condition    [:= $category_id [:joined-field "c" $categories.id]]}]
      :fields [$venues.id
               $venues.name
               [:joined-field "c" $categories.name]]})
   :store
   {:database "test-data"
    :tables   #{"CATEGORIES" "VENUES"}
    :fields   #{["CATEGORIES" "ID"]
                ["VENUES" "CATEGORY_ID"]
                ["CATEGORIES" "NAME"]}}}
  (resolve-joins-and-inspect-store
   (data/mbql-query venues
     {:fields [$venues.id $venues.name]
      :joins  [{:source-table $$categories
                :alias        "c"
                :condition    [:= $category_id [:joined-field "c" $categories.id]]
                :fields       [[:joined-field "c" $categories.name]]}]})))

;; Does joining the same table twice without an explicit alias give both joins unique aliases?
(expect
  (data/mbql-query venues
    {:joins        [{:source-table $$categories
                     :alias        "source"
                     :strategy     :left-join
                     :condition    [:= $category_id 1]}
                    {:source-table $$categories
                     :alias        "source_2"
                     :strategy     :left-join
                     :condition    [:= $category_id 2]}],
     :source-table (data/id :venues)})
  (resolve-joins
   (data/mbql-query venues
     {:joins [{:source-table $$categories
               :condition    [:= $category_id 1]}
              {:source-table $$categories
               :condition    [:= $category_id 2]}]})))

;; Should throw an Exception if a Joined Field using an alias that doesn't exist is used
(expect
  IllegalArgumentException
  (resolve-joins
   (data/mbql-query venues
     {:joins [{:source-table $$categories
               :condition    [:= $category_id [:joined-field "x" $categories.id]]}]})))

;; Test that joining against a table in a different DB throws and Exception
(expect
  IllegalArgumentException
  (tt/with-temp* [Database [{database-id :id}]
                  Table    [{table-id :id}    {:db_id database-id}]]
    (resolve-joins
     (data/mbql-query venues
       {:joins [{:source-table table-id
                 :alias        "t"
                 :condition    [:= $category_id 1]}]}))))
