(ns metabase.query-processor-test.remapping-test
  "Tests for the remapping results"
  (:require [clojure.test :refer :all]
            [metabase
             [query-processor-test :as qp.test]
             [test :as mt]]
            [metabase.models
             [dimension :refer [Dimension]]
             [field :refer [Field]]]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dimension-projections]
            [metabase.test.data :as data]
            [toucan.db :as db]))

(deftest basic-remapping-test
  (mt/test-drivers (mt/normal-drivers)
    (data/with-venue-category-remapping "Foo"
      (is (= {:rows [["20th Century Cafe"               12 "Café"]
                     ["25°"                             11 "Burger"]
                     ["33 Taps"                          7 "Bar"]
                     ["800 Degrees Neapolitan Pizzeria" 58 "Pizza"]]
              :cols [(mt/col :venues :name)
                     (assoc (mt/col :venues :category_id) :remapped_to "Foo")
                     (#'add-dimension-projections/create-remapped-col "Foo" (mt/format-name "category_id") :type/Text)]}
             (qp.test/rows-and-cols
               (mt/format-rows-by [str int str]
                 (mt/run-mbql-query venues
                   {:fields   [$name $category_id]
                    :order-by [[:asc $name]]
                    :limit    4})))))))
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (data/with-venue-category-fk-remapping "Name"
      (is (= {:rows [["American" 2 8]
                     ["Artisan"  3 2]
                     ["Asian"    4 2]]
              :cols [(-> (mt/col :categories :name)
                         (assoc :remapped_from (mt/format-name "category_id"))
                         (assoc :field_ref [:fk-> [:field-id (mt/id :venues :category_id)]
                                            [:field-id (mt/id :categories :name)]])
                         (assoc :fk_field_id (mt/id :venues :category_id))
                         (assoc :source :breakout))
                     (-> (mt/col :venues :category_id)
                         (assoc :remapped_to (mt/format-name "name"))
                         (assoc :source :breakout))
                     {:field_ref    [:aggregation 0]
                      :source       :aggregation
                      :display_name "Count"
                      :name         "count"
                      :special_type :type/Number}]}
             (-> (mt/format-rows-by [str int int]
                   (mt/run-mbql-query venues
                     {:aggregation [[:count]]
                      :breakout    [$category_id]
                      :limit       3}))
                 qp.test/rows-and-cols
                 (update :cols (fn [[c1 c2 agg]]
                                 [c1 c2 (dissoc agg :base_type)]))))))))

(deftest nested-remapping-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (data/with-venue-category-remapping "Foo"
      (is (= {:rows [["20th Century Cafe"               12 "Café"]
                     ["25°"                             11 "Burger"]
                     ["33 Taps"                          7 "Bar"]
                     ["800 Degrees Neapolitan Pizzeria" 58 "Pizza"]]
              :cols [(-> (mt/col :venues :name)
                         (assoc :field_ref [:field-literal (mt/format-name "name") :type/Text])
                         (dissoc :description :parent_id :visibility_type))
                     (-> (mt/col :venues :category_id)
                         (assoc :remapped_to "Foo")
                         (assoc :field_ref [:field-literal (mt/format-name"category_id")])
                         (dissoc :description :parent_id :visibility_type))
                     (#'add-dimension-projections/create-remapped-col "Foo" (mt/format-name "category_id") :type/Text)]}
             (-> (mt/format-rows-by [str int str]
                   (mt/run-mbql-query venues
                     {:source-query {:source-table (mt/id :venues)
                                     :fields       [[:field-id (mt/id :venues :name)]
                                                    [:field-id  (mt/id :venues :category_id)]]
                                     :order-by     [[:asc [:field-id (mt/id :venues :name)]]]
                                     :limit        4}}))
                 qp.test/rows-and-cols
                 (update :cols (fn [[c1 c2 c3]]
                                 [c1 (update c2 :field_ref (comp vec butlast)) c3]))))))))

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
    (data/with-venue-category-fk-remapping "Foo"
      (is (= {:rows [["20th Century Cafe"               2 "Café"]
                     ["25°"                             2 "Burger"]
                     ["33 Taps"                         2 "Bar"]
                     ["800 Degrees Neapolitan Pizzeria" 2 "Pizza"]]
              :cols [(mt/col :venues :name)
                     (mt/col :venues :price)
                     (mt/$ids venues
                       (assoc (mt/col :categories :name)
                              :fk_field_id   %category_id
                              :display_name  "Foo"
                              :name          (mt/format-name "name_2")
                              :remapped_from (mt/format-name "category_id")
                              :field_ref     $category_id->categories.name))]}
             (select-columns (set (map mt/format-name ["name" "price" "name_2"]))
               (mt/format-rows-by [int str int double double int str]
                 (mt/run-mbql-query venues
                   {:order-by [[:asc $name]]
                    :limit    4}))))))))

(deftest remappings-with-field-clause-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (testing (str "Check that we can have remappings when we include a `:fields` clause that restricts the query "
                  "fields returned")
      (data/with-venue-category-fk-remapping "Foo"
        (is (= {:rows [["20th Century Cafe"               2 "Café"]
                       ["25°"                             2 "Burger"]
                       ["33 Taps"                         2 "Bar"]
                       ["800 Degrees Neapolitan Pizzeria" 2 "Pizza"]]
                :cols [(mt/col :venues :name)
                       (mt/col :venues :price)
                       (mt/$ids venues
                         (assoc (mt/col :categories :name)
                                :fk_field_id   %category_id
                                :display_name  "Foo"
                                :name          (mt/format-name "name_2")
                                :remapped_from (mt/format-name "category_id")
                                :field_ref     $category_id->categories.name))]}
               (select-columns (set (map mt/format-name ["name" "price" "name_2"]))
                 (mt/format-rows-by [str int str str]
                   (mt/run-mbql-query venues
                     {:fields   [$name $price $category_id]
                      :order-by [[:asc $name]]
                      :limit    4})))))))))

(deftest remap-inside-mbql-query-test
  (testing "Test that we can remap inside an MBQL query"
    (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys :nested-queries)
      (mt/with-temp Dimension [_ {:field_id                (mt/id :checkins :venue_id)
                                  :name                    "venue-remapping"
                                  :type                    :external
                                  :human_readable_field_id (mt/id :venues :name)}]
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
      (data/with-venue-category-fk-remapping "Foo"
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
      (mt/with-temp Dimension [_ {:field_id                (mt/id :users :created_by)
                                  :name                    "created-by-mapping"
                                  :type                    :external
                                  :human_readable_field_id (mt/id :users :name)}]
        (db/update! 'Field (mt/id :users :created_by)
          {:fk_target_field_id (mt/id :users :id)})
        (is (= ["Dwight Gresham" "Shad Ferdynand" "Kfir Caj" "Plato Yeshua"]
               (->> (mt/run-mbql-query users
                      {:order-by [[:asc $name]]
                       :limit    4})
                    mt/rows
                    (map last))))))))
