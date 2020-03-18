(ns metabase.query-processor-test.remapping-test
  "Tests for the remapping results"
  (:require [metabase
             [query-processor-test :as qp.test]
             [test :as mt]]
            [metabase.models
             [dimension :refer [Dimension]]
             [field :refer [Field]]]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dimension-projections]
            [metabase.test.data :as data]
            [metabase.test.data.datasets :as datasets]
            [toucan.db :as db]))

(qp.test/expect-with-non-timeseries-dbs
 {:rows [["20th Century Cafe"               12 "Café"]
         ["25°"                             11 "Burger"]
         ["33 Taps"                          7 "Bar"]
         ["800 Degrees Neapolitan Pizzeria" 58 "Pizza"]]
  :cols [(qp.test/col :venues :name)
         (assoc (qp.test/col :venues :category_id) :remapped_to "Foo")
         (#'add-dimension-projections/create-remapped-col "Foo" (data/format-name "category_id"))]}
  (data/with-temp-objects
    (data/create-venue-category-remapping "Foo")
    (qp.test/rows-and-cols
      (qp.test/format-rows-by [str int str]
        (data/run-mbql-query venues
          {:fields   [$name $category_id]
           :order-by [[:asc $name]]
           :limit    4})))))

(defn- select-columns
  "Focuses the given resultset to columns that return true when passed to `columns-pred`. Typically this would be done
  as part of the query, however there's a bug currently preventing that from working when remapped. This allows the
  data compared to be smaller and avoid that bug."
  {:style/indent 1}
  [columns-pred results]
  (let [results-data (qp.test/data results)
        col-indexes  (keep-indexed (fn [idx col]
                                     (when (columns-pred (:name col))
                                       idx))
                                   (:cols results-data))]
    {:rows (for [row (:rows results-data)]
             (mapv (vec row) col-indexes))
     :cols (for [col   (:cols results-data)
                 :when (columns-pred (:name col))]
             col)}))

(datasets/expect-with-drivers (mt/normal-drivers-with-feature :foreign-keys)
  {:rows [["20th Century Cafe"               2 "Café"]
          ["25°"                             2 "Burger"]
          ["33 Taps"                         2 "Bar"]
          ["800 Degrees Neapolitan Pizzeria" 2 "Pizza"]]
   :cols [(qp.test/col :venues :name)
          (qp.test/col :venues :price)
          (data/$ids venues
            (assoc (qp.test/col :categories :name)
              :fk_field_id   %category_id
              :display_name  "Foo"
              :name          (data/format-name "name_2")
              :remapped_from (data/format-name "category_id")
              :field_ref     $category_id->categories.name))]}
  (data/with-temp-objects
    (data/create-venue-category-fk-remapping "Foo")
    (select-columns (set (map data/format-name ["name" "price" "name_2"]))
      (qp.test/format-rows-by [int str int double double int str]
        (data/run-mbql-query venues
          {:order-by [[:asc $name]]
           :limit    4})))))

;; Check that we can have remappings when we include a `:fields` clause that restricts the query fields returned
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :foreign-keys)
  {:rows        [["20th Century Cafe"               2 "Café"]
                 ["25°"                             2 "Burger"]
                 ["33 Taps"                         2 "Bar"]
                 ["800 Degrees Neapolitan Pizzeria" 2 "Pizza"]]
   :cols        [(qp.test/col :venues :name)
                 (qp.test/col :venues :price)
                 (data/$ids venues
                   (assoc (qp.test/col :categories :name)
                     :fk_field_id   %category_id
                     :display_name  "Foo"
                     :name          (data/format-name "name_2")
                     :remapped_from (data/format-name "category_id")
                     :field_ref     $category_id->categories.name))]}
  (data/with-temp-objects
    (data/create-venue-category-fk-remapping "Foo")
    (select-columns (set (map data/format-name ["name" "price" "name_2"]))
      (qp.test/format-rows-by [str int str str]
        (data/run-mbql-query venues
          {:fields   [$name $price $category_id]
           :order-by [[:asc $name]]
           :limit    4})))))

;; Test that we can remap inside an MBQL nested query
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :foreign-keys :nested-queries)
  ["Kinaree Thai Bistro" "Ruen Pair Thai Restaurant" "Yamashiro Hollywood" "Spitz Eagle Rock" "The Gumbo Pot"]
  (data/with-temp-objects
    (fn []
      [(db/insert! Dimension {:field_id                (data/id :checkins :venue_id)
                              :name                    "venue-remapping"
                              :type                    :external
                              :human_readable_field_id (data/id :venues :name)})])
    (->> (data/run-mbql-query checkins
           {:order-by [[:asc $date]]
            :limit    5})
         qp.test/rows
         (map last))))

;; Test a remapping with conflicting names, in the case below there are two name fields, one from Venues and the other
;; from Categories
(datasets/expect-with-drivers (mt/normal-drivers-with-feature :foreign-keys :nested-queries)
  ["20th Century Cafe" "25°" "33 Taps" "800 Degrees Neapolitan Pizzeria"]
  (data/with-temp-objects
    (data/create-venue-category-fk-remapping "Foo")
    (->> (qp.test/rows
           (data/run-mbql-query venues
             {:order-by [[:asc $name]], :limit 4}))
         (map second))))

;; Test out a self referencing column. This has a users table like the one that is in `test-data`, but also includes a
;; `created_by` column which references the PK column in that same table. This tests that remapping table aliases are
;; handled correctly
;;
;; Having a self-referencing FK is currently broken with the Redshift and Oracle backends. The issue related to fix
;; this is https://github.com/metabase/metabase/issues/8510
(datasets/expect-with-drivers (disj (mt/normal-drivers-with-feature :foreign-keys) :redshift :oracle :vertica)
  ["Dwight Gresham" "Shad Ferdynand" "Kfir Caj" "Plato Yeshua"]
  (data/dataset test-data-self-referencing-user
    (data/with-temp-objects
      (fn []
        [(db/insert! Dimension {:field_id                (data/id :users :created_by)
                                :name                    "created-by-mapping"
                                :type                    :external
                                :human_readable_field_id (data/id :users :name)})])

      (db/update! 'Field (data/id :users :created_by)
        {:fk_target_field_id (data/id :users :id)})

      (->> (data/run-mbql-query users
             {:order-by [[:asc $name]]
              :limit    4})
           qp.test/rows
           (map last)))))
