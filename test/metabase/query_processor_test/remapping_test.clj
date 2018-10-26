(ns metabase.query-processor-test.remapping-test
  "Tests for the remapping results"
  (:require [metabase
             [query-processor :as qp]
             [query-processor-test :refer :all]]
            [metabase.models
             [dimension :refer [Dimension]]
             [field :refer [Field]]]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dimension-projections]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [dataset-definitions :as defs]
             [datasets :as datasets]]
            [toucan.db :as db]))

(qp-expect-with-all-engines
  {:rows        [["20th Century Cafe" 12 "Café Sweets"]
                 ["25°" 11 "Café"]
                 ["33 Taps" 7 "Beer Garden"]
                 ["800 Degrees Neapolitan Pizzeria" 58 "Ramen"]]
   :columns     [(data/format-name "name")
                 (data/format-name "category_id")
                 "Foo"]
   :cols        [(venues-col :name)
                 (assoc (venues-col :category_id) :remapped_to "Foo")
                 (#'add-dimension-projections/create-remapped-col "Foo" (data/format-name "category_id"))]
   :native_form true}
  (data/with-data
    (data/create-venue-category-remapping "Foo")
    (->> (data/run-mbql-query venues
           {:fields   [$name $category_id]
            :order-by [[:asc $name]]
            :limit    4})
         booleanize-native-form
         (format-rows-by [str int str])
         tu/round-fingerprint-cols)))

(defn- select-columns
  "Focuses the given resultset to columns that return true when passed to `columns-pred`. Typically this would be done
  as part of the query, however there's a bug currently preventing that from working when remapped. This allows the
  data compared to be smaller and avoid that bug."
  [columns-pred results]
  (let [col-indexes (remove nil? (map-indexed (fn [idx col]
                                                (when (columns-pred col)
                                                  idx))
                                              (get-in results [:data :columns])))]
    (-> results
        (update-in [:data :columns]
                   (fn [rows]
                     (filterv columns-pred rows)))
        (update-in [:data :cols]
                   (fn [rows]
                     (filterv #(columns-pred (:name %)) rows)))
        (update-in [:data :rows]
                   (fn [rows]
                     (map #(mapv % col-indexes) rows))))))

(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys)
  {:rows        [["20th Century Cafe"               2 "Café"]
                 ["25°"                             2 "Burger"]
                 ["33 Taps"                         2 "Bar"]
                 ["800 Degrees Neapolitan Pizzeria" 2 "Pizza"]]
   :columns     [(:name (venues-col :name))
                 (:name (venues-col :price))
                 (data/format-name "name_2")]
   :cols        [(venues-col :name)
                 (venues-col :price)
                 (assoc (categories-col :name)
                   :fk_field_id   (data/id :venues :category_id)
                   :display_name  "Foo"
                   :name          (data/format-name "name_2")
                   :remapped_from (data/format-name "category_id"))]
   :native_form true}
  (data/with-data
    (data/create-venue-category-fk-remapping "Foo")
    (->> (data/run-mbql-query venues
           {:order-by [[:asc $name]]
            :limit    4})
         booleanize-native-form
         (format-rows-by [int str int double double int str])
         (select-columns (set (map data/format-name ["name" "price" "name_2"])))
         tu/round-fingerprint-cols
         data)))

;; Check that we can have remappings when we include a `:fields` clause that restricts the query fields returned
(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys)
  {:rows        [["20th Century Cafe"               2 "Café"]
                 ["25°"                             2 "Burger"]
                 ["33 Taps"                         2 "Bar"]
                 ["800 Degrees Neapolitan Pizzeria" 2 "Pizza"]]
   :columns     [(:name (venues-col :name))
                 (:name (venues-col :price))
                 (data/format-name "name_2")]
   :cols        [(venues-col :name)
                 (venues-col :price)
                 (assoc (categories-col :name)
                   :fk_field_id   (data/id :venues :category_id)
                   :display_name  "Foo"
                   :name          (data/format-name "name_2")
                   :remapped_from (data/format-name "category_id"))]
   :native_form true}
  (data/with-data
    (data/create-venue-category-fk-remapping "Foo")
    (->> (data/run-mbql-query venues
           {:fields   [$name $price $category_id]
            :order-by [[:asc $name]]
            :limit    4})
         booleanize-native-form
         (format-rows-by [str int str str])
         (select-columns (set (map data/format-name ["name" "price" "name_2"])))
         tu/round-fingerprint-cols
         :data)))

;; Test that we can remap inside an MBQL nested query
(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys :nested-queries)
  ["Kinaree Thai Bistro" "Ruen Pair Thai Restaurant" "Yamashiro Hollywood" "Spitz Eagle Rock" "The Gumbo Pot"]
  (data/with-data
    (fn []
      [(db/insert! Dimension {:field_id                (data/id :checkins :venue_id)
                              :name                    "venue-remapping"
                              :type                    :external
                              :human_readable_field_id (data/id :venues :name)})])
    (->> (data/run-mbql-query checkins
           {:order-by [[:asc $date]]
            :limit    5})
         rows
         (map last))))

;; Test a remapping with conflicting names, in the case below there are two name fields, one from Venues and the other
;; from Categories
(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys :nested-queries)
  ["20th Century Cafe" "25°" "33 Taps" "800 Degrees Neapolitan Pizzeria"]
  (data/with-data
    (data/create-venue-category-fk-remapping "Foo")
    (->> (qp/process-query
           {:database (data/id)
            :type :query
            :query {:source-table (data/id :venues)
                    :order-by [[(data/id :venues :name) :ascending]]
                    :limit 4}})
         rows
         (map second))))

;; Test out a self referencing column. This has a users table like the one that is in `test-data`, but also includes a
;; `created_by` column which references the PK column in that same table. This tests that remapping table aliases are
;; handled correctly
;;
;; Having a self-referencing FK is currently broken with the Redshift and Oracle backends. The issue related to fix
;; this is https://github.com/metabase/metabase/issues/8510
(datasets/expect-with-engines (disj (non-timeseries-engines-with-feature :foreign-keys) :redshift :oracle :vertica)
  ["Dwight Gresham" "Shad Ferdynand" "Kfir Caj" "Plato Yeshua"]
  (data/with-db (data/get-or-create-database! defs/test-data-self-referencing-user)
    (data/with-data
      (fn []
        [(db/insert! Dimension {:field_id (data/id :users :created_by)
                                :name "created-by-mapping"
                                :type :external
                                :human_readable_field_id (data/id :users :name)})])

      (db/update! 'Field (data/id :users :created_by)
        {:fk_target_field_id (data/id :users :id)})

      (->> (data/run-mbql-query users
             {:order-by [[:asc $name]]
              :limit    4})
           rows
           (map last)))))
