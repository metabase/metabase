(ns metabase.query-processor.middleware.add-dimension-projections-test
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dim-projections]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [toucan.hydrate :as hydrate]))

(use-fixtures :once (fixtures/initialize :db))

;;; ----------------------------------------- add-fk-remaps (pre-processing) -----------------------------------------

(def ^:private example-query
  {:database (mt/id)
   :type     :query
   :query    {:source-table (mt/id :venues)
              :fields       [[:field (mt/id :venues :price) nil]
                             [:field (mt/id :venues :longitude) nil]
                             [:field (mt/id :venues :category_id) nil]]}})

(def ^:private remapped-field
  {:name                      "Product"
   :field_id                  (mt/id :venues :category_id)
   :human_readable_field_id   (mt/id :categories :name)
   :field_name                "CATEGORY_ID"
   :human_readable_field_name "NAME"})

(defn- do-with-fake-remappings-for-category-id [f]
  (with-redefs [add-dim-projections/fields->field-id->remapping-dimension
                (constantly
                 {(mt/id :venues :category_id) {:name                    "Product"
                                                :field_id                (mt/id :venues :category_id)
                                                :human_readable_field_id (mt/id :categories :name)}})]
    (f)))

(deftest create-remap-col-tuples
  (testing "make sure we create the remap column tuples correctly"
    (do-with-fake-remappings-for-category-id
     (fn []
       (is (= [[[:field (mt/id :venues :category_id) nil]
                [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}]
                remapped-field]]
              (#'add-dim-projections/create-remap-col-tuples [[:field (mt/id :venues :price) nil]
                                                              [:field (mt/id :venues :longitude) nil]
                                                              [:field (mt/id :venues :category_id) nil]])))))))

(deftest add-fk-remaps-test
  (do-with-fake-remappings-for-category-id
   (fn []
     (testing "make sure FK remaps add an entry for the FK field to `:fields`, and returns a pair of [dimension-info updated-query]"
       (is (= [[remapped-field]
               (update-in example-query [:query :fields]
                          conj [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}])]
              (#'add-dim-projections/add-fk-remaps example-query))))

     (testing "make sure we don't duplicate remappings"
       (is (= [[remapped-field]
               (update-in example-query [:query :fields]
                          conj [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}])]
              (#'add-dim-projections/add-fk-remaps
               (update-in example-query [:query :fields]
                          conj [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}])))))

     (testing "adding FK remaps should replace any existing order-bys for a field with order bys for the FK remapping Field"
       (is (= [[remapped-field]
               (-> example-query
                   (assoc-in [:query :order-by]
                             [[:asc [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}]]])
                   (update-in [:query :fields]
                              conj [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}]))]
              (-> example-query
                  (assoc-in [:query :order-by] [[:asc [:field (mt/id :venues :category_id) nil]]])
                  (#'add-dim-projections/add-fk-remaps)))))

     (testing "adding FK remaps should replace any existing breakouts for a field with order bys for the FK remapping Field"
       (is (= [[remapped-field]
               (-> example-query
                   (assoc-in [:query :aggregation] [[:count]])
                   (assoc-in [:query :breakout]
                             [[:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}]
                              [:field (mt/id :venues :category_id) nil]])
                   (m/dissoc-in [:query :fields]))]
              (-> example-query
                  (m/dissoc-in [:query :fields])
                  (assoc-in [:query :aggregation] [[:count]])
                  (assoc-in [:query :breakout] [[:field (mt/id :venues :category_id) nil]])
                  (#'add-dim-projections/add-fk-remaps)))))

     (testing "make sure FK remaps work with nested queries"
       (let [example-query (assoc example-query :query {:source-query (:query example-query)})]
         (is (= [[remapped-field]
                 (update-in example-query [:query :source-query :fields]
                            conj [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}])]
                (#'add-dim-projections/add-fk-remaps example-query))))))))


;;; ---------------------------------------- remap-results (post-processing) -----------------------------------------

(def ^:private col-defaults
  {:description     nil
   :source          :fields
   :fk_field_id     nil
   :visibility_type :normal
   :target          nil
   :remapped_from   nil
   :remapped_to     nil})

(def ^:private example-result-cols-id
  (merge
   col-defaults
   {:table_id      4
    :schema_name   "PUBLIC"
    :semantic_type :type/PK
    :name          "ID"
    :id            12
    :display_name  "ID"
    :base_type     :type/BigInteger}))

(def ^:private example-result-cols-name
  (merge
   col-defaults
   {:table_id      4
    :schema_name   "PUBLIC"
    :semantic_type :type/Name
    :name          "NAME"
    :id            15
    :display_name  "Name"
    :base_type     :type/Text}))

(def ^:private example-result-cols-category-id
  (merge
   col-defaults
   {:table_id      4
    :schema_name   "PUBLIC"
    :semantic_type :type/FK
    :name          "CATEGORY_ID"
    :id            11
    :display_name  "Category ID"
    :base_type     :type/Integer}))

(def ^:private example-result-cols-price
  (merge
   col-defaults
   {:table_id      4
    :schema_name   "PUBLIC"
    :semantic_type :type/Category
    :name          "PRICE"
    :id            16
    :display_name  "Price"
    :base_type     :type/Integer}))

;; test that internal get the appropriate values and columns injected in, and the `:remapped_from`/`:remapped_to` info
(def ^:private example-result-cols-foo
  {:description     nil
   :table_id        nil
   :name            "Foo"
   :remapped_from   "CATEGORY_ID"
   :remapped_to     nil
   :id              nil
   :target          nil
   :display_name    "Foo"
   :base_type       :type/Text
   :semantic_type   nil})

(defn- add-remapping [query metadata rows]
  (:result (mt/test-qp-middleware add-dim-projections/add-remapping query metadata rows)))

(def ^:private example-result-cols-category
  (merge
   col-defaults
   {:description     "The name of the product as it should be displayed to customers."
    :table_id        3
    :schema_name     nil
    :semantic_type   :type/Category
    :name            "CATEGORY"
    :fk_field_id     32
    :id              27
    :visibility_type :normal
    :display_name    "Category"
    :base_type       :type/Text}))

(deftest add-remapping-test
  (testing "remapping columns with `human_readable_values`"
    ;; swap out `hydrate` with one that will add some fake dimensions and values for CATEGORY_ID.
    (with-redefs [hydrate/hydrate (fn [fields & _]
                                    (for [{field-name :name, :as field} fields]
                                      (cond-> field
                                        (= field-name "CATEGORY_ID")
                                        (assoc :dimensions {:type :internal, :name "Foo", :field_id 10}
                                               :values     {:human_readable_values ["Foo" "Bar" "Baz" "Qux" "Quux"]
                                                            :values                [4 11 29 20 nil]}))))]
      (is (= {:status    :completed
              :row_count 6
              :data      {:rows [[1 "Red Medicine"                   4 3 "Foo"]
                                 [2 "Stout Burgers & Beers"         11 2 "Bar"]
                                 [3 "The Apple Pan"                 11 2 "Bar"]
                                 [4 "Wurstküche"                    29 2 "Baz"]
                                 [5 "Brite Spot Family Restaurant"  20 2 "Qux"]
                                 [6 "Spaghetti Warehouse"          nil 2 "Quux"]]
                          :cols [example-result-cols-id
                                 example-result-cols-name
                                 (assoc example-result-cols-category-id
                                        :remapped_to "Foo")
                                 example-result-cols-price
                                 example-result-cols-foo]}}
             (with-redefs [add-dim-projections/add-fk-remaps (fn [query]
                                                               [nil query])]
               (add-remapping
                {}
                {:cols [example-result-cols-id
                        example-result-cols-name
                        example-result-cols-category-id
                        example-result-cols-price]}
                [[1 "Red Medicine"                   4 3]
                 [2 "Stout Burgers & Beers"         11 2]
                 [3 "The Apple Pan"                 11 2]
                 [4 "Wurstküche"                    29 2]
                 [5 "Brite Spot Family Restaurant"  20 2]
                 [6 "Spaghetti Warehouse"          nil 2]]))))))

  (testing "remapping string columns with `human_readable_values`"
    ;; swap out `hydrate` with one that will add some fake dimensions and values for CATEGORY_ID.
    (with-redefs [hydrate/hydrate (fn [fields & _]
                                    (for [{field-name :name, :as field} fields]
                                      (cond-> field
                                        (= field-name "NAME")
                                        (assoc :dimensions {:type :internal, :name "Foo", :field_id 10}
                                               :values     {:human_readable_values ["Appletini" "Bananasplit" "Kiwi-flavored Thing"]
                                                            :values                ["apple" "banana" "kiwi"]}))))]
      (is (= {:status    :completed
              :row_count 3
              :data      {:rows [[1 "apple"   4 3 "Appletini"]
                                 [2 "banana" 11 2 "Bananasplit"]
                                 [3 "kiwi"   11 2 "Kiwi-flavored Thing"]]
                          :cols [example-result-cols-id
                                 (assoc example-result-cols-name
                                        :remapped_to "Foo")
                                 example-result-cols-category-id
                                 example-result-cols-price
                                 (assoc example-result-cols-foo
                                        :remapped_from "NAME")]}}
             (with-redefs [add-dim-projections/add-fk-remaps (fn [query]
                                                               [nil query])]
               (add-remapping
                {}
                {:cols [example-result-cols-id
                        example-result-cols-name
                        example-result-cols-category-id
                        example-result-cols-price]}
                [[1 "apple"   4 3]
                 [2 "banana" 11 2]
                 [3 "kiwi"   11 2]]))))))

  (testing "test that different columns types are transformed"
    (is (= (map list [123M 123.0 123N 123 "123"])
           (map #(#'add-dim-projections/transform-values-for-col {:base_type %} [123])
                [:type/Decimal :type/Float :type/BigInteger :type/Integer :type/Text]))))

  (testing "test that external remappings get the appropriate `:remapped_from`/`:remapped_to` info"
    (is (= {:status    :completed
            :row_count 0
            :data      {:rows []
                        :cols [example-result-cols-id
                               example-result-cols-name
                               (assoc example-result-cols-category-id
                                      :remapped_to "CATEGORY")
                               example-result-cols-price
                               (assoc example-result-cols-category
                                      :remapped_from "CATEGORY_ID"
                                      :display_name  "My Venue Category")]}}
           (with-redefs [add-dim-projections/add-fk-remaps (fn [query]
                                                             [[{:name "My Venue Category", :field_id 11, :human_readable_field_id 27}]
                                                              query])]
             (add-remapping
              {}
              {:cols [example-result-cols-id
                      example-result-cols-name
                      example-result-cols-category-id
                      example-result-cols-price
                      example-result-cols-category]}
              []))))))

(deftest dimension-remappings-test
  (testing "Make sure columns from remapping Dimensions are spliced into the query during pre-processing"
    (mt/dataset sample-dataset
      (let [query (mt/mbql-query orders
                    {:fields   [$id $user_id $product_id $subtotal $tax $total $discount !default.created_at $quantity]
                     :joins    [{:fields       :all
                                 :source-table $$products
                                 :condition    [:= $product_id &Products.products.id]
                                 :alias        "Products"}]
                     :order-by [[:asc $id]]
                     :limit    2})]
        (doseq [nesting-level [0 1]
                :let          [query (mt/nest-query query nesting-level)]]
          (testing (format "nesting level = %d" nesting-level)
            (mt/with-column-remappings [orders.product_id products.title]
              (is (= (update-in
                      query
                      (concat [:query] (repeat nesting-level :source-query) [:fields])
                      concat [(mt/$ids orders $product_id->products.title)])
                     (:pre (mt/test-qp-middleware add-dim-projections/add-remapping query)))))))))))
