(ns metabase.query-processor-test.remapping-test
  "Tests for the remapping results"
  (:require [clojure.test :refer :all]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor :as qp]
            [metabase.query-processor-test :as qp.test]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dimension-projections]
            [metabase.test :as mt]
            [toucan.db :as db]))

(deftest basic-remapping-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/with-column-remappings [venues.category_id (values-of categories.name)]
      (is (= {:rows [["20th Century Cafe"               12 "Café"]
                     ["25°"                             11 "Burger"]
                     ["33 Taps"                          7 "Bar"]
                     ["800 Degrees Neapolitan Pizzeria" 58 "Pizza"]]
              :cols [(mt/col :venues :name)
                     (assoc (mt/col :venues :category_id) :remapped_to "Category ID")
                     (#'add-dimension-projections/create-remapped-col "Category ID" (mt/format-name "category_id") :type/Text)]}
             (qp.test/rows-and-cols
               (mt/format-rows-by [str int str]
                 (mt/run-mbql-query venues
                   {:fields   [$name $category_id]
                    :order-by [[:asc $name]]
                    :limit    4})))))))
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (mt/with-column-remappings [venues.category_id categories.name]
      (is (= {:rows [["American" 2 8]
                     ["Artisan"  3 2]
                     ["Asian"    4 2]]
              :cols [(-> (assoc (mt/col :categories :name) :display_name "Category ID")
                         (assoc :remapped_from (mt/format-name "category_id")
                                :field_ref     [:field
                                                (mt/id :categories :name)
                                                {:source-field (mt/id :venues :category_id)}]
                                :fk_field_id   (mt/id :venues :category_id)
                                :source        :breakout))
                     (-> (mt/col :venues :category_id)
                         (assoc :remapped_to (mt/format-name "name")
                                :source      :breakout))
                     {:field_ref     [:aggregation 0]
                      :source        :aggregation
                      :display_name  "Count"
                      :name          "count"
                      :semantic_type :type/Quantity}]}
             (-> (mt/format-rows-by [str int int]
                   (mt/run-mbql-query venues
                     {:aggregation [[:count]]
                      :breakout    [$category_id]
                      :limit       3}))
                 qp.test/rows-and-cols
                 (update :cols (fn [[c1 c2 agg]]
                                 [(dissoc c1 :source_alias) c2 (dissoc agg :base_type)]))))))))

(deftest nested-remapping-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (mt/with-column-remappings [venues.category_id (values-of categories.name)]
      (is (= {:rows [["20th Century Cafe"               12 "Café"]
                     ["25°"                             11 "Burger"]
                     ["33 Taps"                          7 "Bar"]
                     ["800 Degrees Neapolitan Pizzeria" 58 "Pizza"]]
              :cols [(mt/col :venues :name)
                     (-> (mt/col :venues :category_id)
                         (assoc :remapped_to "Category ID"))
                     (#'add-dimension-projections/create-remapped-col "Category ID" (mt/format-name "category_id") :type/Text)]}
             (->> (mt/run-mbql-query venues
                    {:source-query {:source-table (mt/id :venues)
                                    :fields       [[:field (mt/id :venues :name) nil]
                                                   [:field (mt/id :venues :category_id) nil]]
                                    :order-by     [[:asc [:field (mt/id :venues :name) nil]]]
                                    :limit        4}})
                  (mt/format-rows-by [str int str])
                  qp.test/rows-and-cols))))))

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

(deftest foreign-keys-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (mt/with-column-remappings [venues.category_id categories.name]
      (is (= {:rows [["20th Century Cafe"               2 "Café"]
                     ["25°"                             2 "Burger"]
                     ["33 Taps"                         2 "Bar"]
                     ["800 Degrees Neapolitan Pizzeria" 2 "Pizza"]]
              :cols [(mt/col :venues :name)
                     (mt/col :venues :price)
                     (mt/$ids venues
                       (assoc (mt/col :categories :name)
                              :fk_field_id   %category_id
                              :display_name  "Category ID"
                              :name          (mt/format-name "name_2")
                              :remapped_from (mt/format-name "category_id")
                              :field_ref     $category_id->categories.name))]}
             (-> (select-columns (set (map mt/format-name ["name" "price" "name_2"]))
                                 (mt/format-rows-by [int str int double double int str]
                                   (mt/run-mbql-query venues
                                     {:order-by [[:asc $name]]
                                      :limit    4})))
                 (update :cols (fn [[c1 c2 c3]]
                                 [c1 c2 (dissoc c3 :source_alias)]))))))))

(deftest remappings-with-field-clause-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (testing (str "Check that we can have remappings when we include a `:fields` clause that restricts the query "
                  "fields returned")
      (mt/with-column-remappings [venues.category_id categories.name]
        (is (= {:rows [["20th Century Cafe"               2 "Café"]
                       ["25°"                             2 "Burger"]
                       ["33 Taps"                         2 "Bar"]
                       ["800 Degrees Neapolitan Pizzeria" 2 "Pizza"]]
                :cols [(mt/col :venues :name)
                       (mt/col :venues :price)
                       (mt/$ids venues
                         (assoc (mt/col :categories :name)
                                :fk_field_id   %category_id
                                :display_name  "Category ID"
                                :name          (mt/format-name "name_2")
                                :remapped_from (mt/format-name "category_id")
                                :field_ref     $category_id->categories.name))]}
               (-> (select-columns (set (map mt/format-name ["name" "price" "name_2"]))
                     (mt/format-rows-by [str int str str]
                       (mt/run-mbql-query venues
                         {:fields   [$name $price $category_id]
                          :order-by [[:asc $name]]
                          :limit    4})))
                   (update :cols (fn [[c1 c2 c3]]
                                   [c1 c2 (dissoc c3 :source_alias)])))))))))

(deftest remap-inside-mbql-query-test
  (testing "Test that we can remap inside an MBQL query"
    (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys :nested-queries)
      (mt/with-column-remappings [checkins.venue_id venues.name]
        (is (= ["Kinaree Thai Bistro" "Ruen Pair Thai Restaurant" "Yamashiro Hollywood" "Spitz Eagle Rock" "The Gumbo Pot"]
               (->> (mt/run-mbql-query checkins
                      {:order-by [[:asc $date]]
                       :limit    5})
                    mt/rows
                    (map last))))))))

(deftest remapping-with-conflicting-names-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys :nested-queries)
    (testing (str "Test a remapping with conflicting names, in the case below there are two name fields, one from "
                  "Venues and the other from Categories")
      (mt/with-column-remappings [venues.category_id categories.name]
        (is (= ["20th Century Cafe" "25°" "33 Taps" "800 Degrees Neapolitan Pizzeria"]
               (->> (mt/rows
                      (mt/run-mbql-query venues
                        {:order-by [[:asc $name]], :limit 4}))
                    (map second))))))))

(deftest self-referencing-test
  ;; Test out a self referencing column. This has a users table like the one that is in `test-data`, but also includes a
  ;; `created_by` column which references the PK column in that same table. This tests that remapping table aliases are
  ;; handled correctly
  ;;
  ;; Having a self-referencing FK is currently broken with the Redshift and Oracle backends. The issue related to fix
  ;; this is https://github.com/metabase/metabase/issues/8510
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :foreign-keys) :redshift :oracle :vertica)
    (mt/dataset test-data-self-referencing-user
      (mt/with-column-remappings [users.created_by users.name]
        (db/update! Field (mt/id :users :created_by)
          {:fk_target_field_id (mt/id :users :id)})
        (is (= ["Dwight Gresham" "Shad Ferdynand" "Kfir Caj" "Plato Yeshua"]
               (->> (mt/run-mbql-query users
                      {:order-by [[:asc $name]]
                       :limit    4})
                    mt/rows
                    (map last))))))))

(deftest native-query-remapping-test
  (testing "Remapping should work for native queries"
    (mt/dataset sample-dataset
      (letfn [(remappings-with-metadata [metadata]
                (mt/with-column-remappings [orders.product_id products.title]
                  (mt/rows
                    (mt/run-mbql-query nil
                      {:source-query    {:native "SELECT * FROM ORDERS WHERE USER_ID = 1 AND TOTAL > 10 ORDER BY ID ASC LIMIT 2;"}
                       :source-metadata metadata}))))]
        (testing "With the metadata from an MBQL query"
          (let [metadata (get-in (qp/process-query (mt/mbql-query orders))
                                 [:data :results_metadata :columns])]
            (is (seq metadata))
            (is (= [[1 1  14 37.65  2.07  39.72 nil "2019-02-11T21:40:27.892Z" 2 "Awesome Concrete Shoes"]
                    [2 1 123 110.93  6.1 117.03 nil  "2018-05-15T08:04:04.58Z" 3 "Mediocre Wooden Bench"]]
                   (remappings-with-metadata metadata)))))
        ;; doesn't currently work with any other metadata.
        ))))

(deftest remappings-with-implicit-joins-test
  ;; Redshift excluded for now since the sample dataset seems to hang for Redshift.
  (mt/test-drivers (disj (mt/normal-drivers-with-feature :foreign-keys :nested-queries) :redshift)
    (testing "Queries with implicit joins should still work when FK remaps are used (#13641)"
      (mt/dataset sample-dataset
        (mt/with-column-remappings [orders.product_id products.title]
          (is (= [[6 1 60 29.8 1.64 31.44 nil "2019-11-06T16:38:50.134Z" 3 "Rustic Paper Car"]]
                 (mt/formatted-rows [int int int 2.0 2.0 2.0 identity str int str]
                   (mt/run-mbql-query orders
                     {:source-query {:source-table $$orders
                                     :filter       [:= $user_id 1]}
                      :filter       [:= $product_id->products.category "Doohickey"]
                      :order-by     [[:asc $id] [:asc $product_id->products.category]]
                      :limit        1})))))))))
