(ns metabase.query-processor.middleware.add-dimension-projections-test
  (:require [clojure.test :refer :all]
            [medley.core :as m]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor.context.default :as context.default]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dim-projections]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))

;;; ----------------------------------------- add-fk-remaps (pre-processing) -----------------------------------------

(def ^:private example-query
  (delay
    {:database (mt/id)
     :type     :query
     :query    {:source-table (mt/id :venues)
                :fields       [[:field (mt/id :venues :price) nil]
                               [:field (mt/id :venues :longitude) nil]
                               [:field (mt/id :venues :category_id) nil]]}}))

(def ^:private remapped-field
  (delay
    {:name                      "Product"
     :field_id                  (mt/id :venues :category_id)
     :human_readable_field_id   (mt/id :categories :name)
     :field_name                "CATEGORY_ID"
     :human_readable_field_name "NAME"}))

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
                @remapped-field]]
              (#'add-dim-projections/create-remap-col-tuples [[:field (mt/id :venues :price) nil]
                                                              [:field (mt/id :venues :longitude) nil]
                                                              [:field (mt/id :venues :category_id) nil]])))))))

(deftest add-fk-remaps-test
  (do-with-fake-remappings-for-category-id
   (fn []
     (testing "make sure FK remaps add an entry for the FK field to `:fields`, and returns a pair of [dimension-info updated-query]"
       (is (= [[@remapped-field]
               (update-in @example-query [:query :fields]
                          conj [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}])]
              (#'add-dim-projections/add-fk-remaps @example-query))))

     (testing "make sure we don't duplicate remappings"
       (is (= [[@remapped-field]
               (update-in @example-query [:query :fields]
                          conj [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}])]
              (#'add-dim-projections/add-fk-remaps
               (update-in @example-query [:query :fields]
                          conj [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}])))))

     (testing "adding FK remaps should replace any existing order-bys for a field with order bys for the FK remapping Field"
       (is (= [[@remapped-field]
               (-> @example-query
                   (assoc-in [:query :order-by]
                             [[:asc [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}]]])
                   (update-in [:query :fields]
                              conj [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}]))]
              (-> @example-query
                  (assoc-in [:query :order-by] [[:asc [:field (mt/id :venues :category_id) nil]]])
                  (#'add-dim-projections/add-fk-remaps)))))

     (testing "adding FK remaps should replace any existing breakouts for a field with order bys for the FK remapping Field"
       (is (= [[@remapped-field]
               (-> @example-query
                   (assoc-in [:query :aggregation] [[:count]])
                   (assoc-in [:query :breakout]
                             [[:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}]
                              [:field (mt/id :venues :category_id) nil]])
                   (m/dissoc-in [:query :fields]))]
              (-> @example-query
                  (m/dissoc-in [:query :fields])
                  (assoc-in [:query :aggregation] [[:count]])
                  (assoc-in [:query :breakout] [[:field (mt/id :venues :category_id) nil]])
                  (#'add-dim-projections/add-fk-remaps)))))

     (testing "make sure FK remaps work with nested queries"
       (let [example-query (assoc @example-query :query {:source-query (:query @example-query)})]
         (is (= [[@remapped-field]
                 (update-in example-query [:query :source-query :fields]
                            conj [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}])]
                (#'add-dim-projections/add-fk-remaps example-query))))))))


;;; ---------------------------------------- remap-results (post-processing) -----------------------------------------

(defn- remap-results [query metadata rows]
  (let [rff (add-dim-projections/remap-results query context.default/default-rff)
        rf  (rff metadata)]
    (transduce identity rf rows)))

(deftest remap-human-readable-values-test
  (testing "remapping columns with `human_readable_values`"
    (mt/with-temp-vals-in-db Field (mt/id :venues :category_id) {:display_name "Foo"}
      (mt/with-column-remappings [venues.category_id {4 "Foo", 11 "Bar", 29 "Baz", 20 "Qux", nil "Quux"}]
        (is (partial= {:status    :completed
                       :row_count 6
                       :data      {:rows [[1 "Red Medicine"                   4 3 "Foo"]
                                          [2 "Stout Burgers & Beers"         11 2 "Bar"]
                                          [3 "The Apple Pan"                 11 2 "Bar"]
                                          [4 "Wurstküche"                    29 2 "Baz"]
                                          [5 "Brite Spot Family Restaurant"  20 2 "Qux"]
                                          [6 "Spaghetti Warehouse"          nil 2 "Quux"]]
                                   :cols [{:name "ID"}
                                          {:name "NAME"}
                                          {:name "CATEGORY_ID", :remapped_to "Foo"}
                                          {:name "PRICE"}
                                          {:name "Foo", :remapped_from "CATEGORY_ID"}]}}
                      (remap-results
                       {}
                       {:cols [{:name "ID"}
                               {:name "NAME"}
                               {:name "CATEGORY_ID", :id (mt/id :venues :category_id)}
                               {:name "PRICE"}]}
                       [[1 "Red Medicine"                   4 3]
                        [2 "Stout Burgers & Beers"         11 2]
                        [3 "The Apple Pan"                 11 2]
                        [4 "Wurstküche"                    29 2]
                        [5 "Brite Spot Family Restaurant"  20 2]
                        [6 "Spaghetti Warehouse"          nil 2]])))))))

(deftest remap-human-readable-string-column-test
  (testing "remapping string columns with `human_readable_values`"
    (mt/with-temp-vals-in-db Field (mt/id :venues :name) {:display_name "Foo"}
      (mt/with-column-remappings [venues.name {"apple"  "Appletini"
                                               "banana" "Bananasplit"
                                               "kiwi"   "Kiwi-flavored Thing"}]
        (is (partial= {:status    :completed
                       :row_count 3
                       :data      {:rows [[1 "apple"   4 3 "Appletini"]
                                          [2 "banana" 11 2 "Bananasplit"]
                                          [3 "kiwi"   11 2 "Kiwi-flavored Thing"]]
                                   :cols [{:name "ID"}
                                          {:name "NAME", :remapped_to "Foo"}
                                          {:name "CATEGORY_ID"}
                                          {:name "PRICE"}
                                          {:name "Foo", :remapped_from "NAME"}]}}
                      (remap-results
                       {}
                       {:cols [{:name "ID"}
                               {:name "NAME", :id (mt/id :venues :name)}
                               {:name "CATEGORY_ID"}
                               {:name "PRICE"}]}
                       [[1 "apple"   4 3]
                        [2 "banana" 11 2]
                        [3 "kiwi"   11 2]])))))))

(deftest transform-values-for-col-test
  (testing "test that different columns types are transformed"
    (is (= (map list [123M 123.0 123N 123 "123"])
           (map #(#'add-dim-projections/transform-values-for-col {:base_type %} [123])
                [:type/Decimal :type/Float :type/BigInteger :type/Integer :type/Text])))))

(deftest external-remappings-metadata-test
  (testing "test that external remappings get the appropriate `:remapped_from`/`:remapped_to` info"
    (mt/with-temp Field [{category-id :id} {:name "CATEGORY", :display_name "Category"}]
      (is (partial= {:status    :completed
                     :row_count 0
                     :data      {:rows []
                                 :cols [{:name "ID"}
                                        {:name "NAME"}
                                        {:name "CATEGORY_ID", :remapped_to "CATEGORY"}
                                        {:name "PRICE"}
                                        {:name "CATEGORY", :remapped_from "CATEGORY_ID", :display_name "My Venue Category"}]}}
                    (remap-results
                     {::add-dim-projections/external-remaps [{:field_id                  (mt/id :venues :category_id)
                                                              :name                      "My Venue Category"
                                                              :human_readable_field_id   category-id
                                                              :field_name                "CATEGORY"
                                                              :human_readable_field_name "Category"}]}
                     {:cols [{:name "ID"}
                             {:name "NAME"}
                             {:name "CATEGORY_ID", :id (mt/id :venues :category_id)}
                             {:name "PRICE"}
                             {:name "CATEGORY", :id category-id}]}
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
              (is (= (-> query
                         (update-in (concat [:query] (repeat nesting-level :source-query) [:fields])
                                    concat [(mt/$ids orders $product_id->products.title)])
                         (assoc ::add-dim-projections/external-remaps [{:field_id                  (mt/id :orders :product_id)
                                                                        :name                      "Product ID"
                                                                        :human_readable_field_id   (mt/id :products :title)
                                                                        :field_name                "PRODUCT_ID"
                                                                        :human_readable_field_name "TITLE"}]))
                     (#'add-dim-projections/add-remapped-columns query))))))))))
