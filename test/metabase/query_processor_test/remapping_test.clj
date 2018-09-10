(ns metabase.query-processor-test.remapping-test
  "Tests for the remapping results"
  (:require [metabase
             [query-processor :as qp]
             [query-processor-test :refer :all]]
            [metabase.models.dimension :refer [Dimension]]
            [metabase.query-processor.middleware
             [add-dimension-projections :as add-dimension-projections]
             [expand :as ql]]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data.datasets :as datasets]
            [toucan.db :as db]))

(qp-expect-with-all-engines
  {:rows  [["20th Century Cafe" 12 "Café Sweets"]
           ["25°" 11 "Café"]
           ["33 Taps" 7 "Beer Garden"]
           ["800 Degrees Neapolitan Pizzeria" 58 "Ramen"]]
   :columns [(data/format-name "name")
             (data/format-name "category_id")
             "Foo"]
   :cols    [(venues-col :name)
             (assoc (venues-col :category_id) :remapped_to "Foo")
             (#'add-dimension-projections/create-remapped-col "Foo" (data/format-name "category_id"))]
   :native_form true}
  (data/with-data
    (data/create-venue-category-remapping "Foo")
    (->> (data/run-query venues
           (ql/fields $name $category_id)
           (ql/order-by (ql/asc $name))
           (ql/limit 4))
         booleanize-native-form
         (format-rows-by [str int str]))))

(defn- select-columns
  "Focuses the given resultset to columns that return true when passed
  to `COLUMNS-PRED`. Typically this would be done as part of the
  query, however there's a bug currently preventing that from working
  when remapped. This allows the data compared to be smaller and avoid
  that bug."
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
  {:rows   [["20th Century Cafe" 2 "Café"]
            ["25°" 2 "Burger"]
            ["33 Taps" 2 "Bar"]
            ["800 Degrees Neapolitan Pizzeria" 2 "Pizza"]]
   :columns [(:name (venues-col :name))
             (:name (venues-col :price))
             (data/format-name "name_2")]
   :cols    [(venues-col :name)
             (venues-col :price)
             (assoc (categories-col :name)
               :fk_field_id (data/id :venues :category_id)
               :display_name "Foo"
               :name (data/format-name "name_2")
               :remapped_from (data/format-name "category_id")
               :schema_name nil)]
   :native_form true}
  (data/with-data
    (data/create-venue-category-fk-remapping "Foo")
    (->> (data/run-query venues
           (ql/order-by (ql/asc $name))
           (ql/limit 4))
         booleanize-native-form
         (format-rows-by [int str int double double int str])
         (select-columns (set (map data/format-name ["name" "price" "name_2"])))
         tu/round-fingerprint-cols
         :data)))

;; Test that we can remap inside an MBQL nested query
(datasets/expect-with-engines (non-timeseries-engines-with-feature :foreign-keys :nested-queries)
  ["Kinaree Thai Bistro" "Ruen Pair Thai Restaurant" "Yamashiro Hollywood" "Spitz Eagle Rock" "The Gumbo Pot"]
  (data/with-data
    (fn []
      [(db/insert! Dimension {:field_id (data/id :checkins :venue_id)
                              :name "venue-remapping"
                              :type :external
                              :human_readable_field_id (data/id :venues :name)})])
    (->> (qp/process-query
           {:database (data/id)
            :type :query
            :query {:source-query {:source-table (data/id :checkins)}
                    :order-by [[(data/id :checkins :date) :ascending]]
                    :limit 5}})
         rows
         (map last))))
