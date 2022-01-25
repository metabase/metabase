(ns metabase.query-processor.middleware.add-dimension-projections-test
  (:require [clojure.test :refer :all]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dim-projections]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [toucan.hydrate :as hydrate]))

(use-fixtures :once (fixtures/initialize :db))

;;; ----------------------------------------- add-fk-remaps (pre-processing) -----------------------------------------

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
    (mt/with-everything-store
      (do-with-fake-remappings-for-category-id
       (fn []
         (is (= [[[:field (mt/id :venues :category_id) nil]
                  [:field (mt/id :categories :name) {:source-field (mt/id :venues :category_id)}]
                  @remapped-field]]
                (#'add-dim-projections/create-remap-col-tuples [[:field (mt/id :venues :price) nil]
                                                                [:field (mt/id :venues :longitude) nil]
                                                                [:field (mt/id :venues :category_id) nil]]))))))))

(defn- add-fk-remaps [query]
  (mt/with-everything-store
    (mt/with-driver :h2
      (let [[remaps query] (#'add-dim-projections/add-fk-remaps query)]
        [remaps (mt/remove-source-metadata query)]))))

(deftest add-fk-remaps-test
  (letfn [(expected-join []
            (mt/$ids venues
              {:strategy     :left-join
               :alias        "CATEGORIES__via__CATEGORY_ID"
               :condition    [:= $category_id &CATEGORIES__via__CATEGORY_ID.categories.id]
               :source-table $$categories
               :fk-field-id  %category_id}))]
    (do-with-fake-remappings-for-category-id
     (fn []
       (testing "make sure FK remaps add an entry for the FK field to `:fields`, and returns a pair of [dimension-info updated-query]"
         (is (= [[@remapped-field]
                 (mt/mbql-query venues
                   {:joins  [(expected-join)]
                    :fields [$price $longitude $category_id &CATEGORIES__via__CATEGORY_ID.category_id->categories.name]
                    :limit  1})]
                (add-fk-remaps
                 (mt/mbql-query venues
                   {:fields [$price $longitude $category_id]
                    :limit  1})))))

       (testing "make sure we don't duplicate remappings"
         (is (= [[@remapped-field]
                 (mt/mbql-query venues
                   {:joins  [(expected-join)]
                    :fields [$price $longitude $category_id &CATEGORIES__via__CATEGORY_ID.category_id->categories.name]
                    :limit  1})]
                (add-fk-remaps
                 (mt/mbql-query venues
                   {:fields [$price $longitude $category_id &CATEGORIES__via__CATEGORY_ID.category_id->categories.name]
                    :limit  1})))))

       (testing "adding FK remaps should replace any existing order-bys for a field with order bys for the FK remapping Field"
         (is (= [[@remapped-field]
                 (mt/mbql-query venues
                   {:joins    [(expected-join)]
                    :fields   [$price $longitude $category_id &CATEGORIES__via__CATEGORY_ID.category_id->categories.name]
                    :order-by [[:asc &CATEGORIES__via__CATEGORY_ID.category_id->categories.name]]
                    :limit    1})]
                (add-fk-remaps
                 (mt/mbql-query venues
                   {:fields   [$price $longitude $category_id]
                    :order-by [[:asc $category_id]]
                    :limit    1})))))

       (testing "adding FK remaps should replace any existing breakouts for a field with order bys for the FK remapping Field"
         (is (= [[@remapped-field]
                 (mt/mbql-query venues
                   {:joins       [(expected-join)]
                    :breakout    [&CATEGORIES__via__CATEGORY_ID.category_id->categories.name $category_id]
                    :aggregation [[:count]]
                    :limit       1})]
                (add-fk-remaps
                 (mt/mbql-query venues
                   {:breakout    [$category_id]
                    :aggregation [[:count]]
                    :limit       1})))))

       (testing "make sure FK remaps work with nested queries"
         (is (= [[@remapped-field]
                 (mt/mbql-query venues
                   {:source-query {:source-table $$venues
                                   :joins        [(expected-join)]
                                   :fields       [$price
                                                  $longitude
                                                  $category_id
                                                  &CATEGORIES__via__CATEGORY_ID.category_id->categories.name]}
                    :limit        1})]
                (add-fk-remaps
                 (mt/mbql-query venues
                   {:source-query {:source-table $$venues
                                   :fields       [$price $longitude $category_id]}
                    :limit        1})))))))))


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

#_(defn- add-fk-remaps [query]
  (mt/with-everything-store
    (mt/with-driver :h2
      (:pre (mt/test-qp-middleware add-dim-projections/add-remapping query)))))

(deftest dimension-remappings-test
  (testing "Make sure columns from remapping Dimensions are spliced into the query during pre-processing"
    (mt/dataset sample-dataset
      (let [expected-join (mt/$ids orders
                            {:source-table $$products
                             :alias        "PRODUCTS__via__PRODUCT_ID"
                             :strategy     :left-join
                             :condition    [:=
                                            $orders.product_id
                                            &PRODUCTS__via__PRODUCT_ID.products.id]
                             :fk-field-id  %orders.product_id})]
        (mt/with-column-remappings [orders.product_id products.title]
          (testing "Nesting level = 0"
            (is (query= (mt/mbql-query orders
                          {:fields   [$id $user_id $product_id $subtotal $tax $total $discount !default.created_at $quantity
                                      &PRODUCTS__via__PRODUCT_ID.product_id->products.title]
                           :joins    [{:source-table $$products
                                       :condition    [:= $product_id &Products.products.id]
                                       :alias        "Products"
                                       :strategy     :left-join}
                                      expected-join]
                           :order-by [[:asc $id]]
                           :limit    2})
                        (second
                         (add-fk-remaps
                          (mt/mbql-query orders
                            {:fields   [$id $user_id $product_id $subtotal $tax $total $discount !default.created_at $quantity]
                             :joins    [{:source-table $$products
                                         :condition    [:= $product_id &Products.products.id]
                                         :alias        "Products"
                                         :strategy     :left-join}]
                             :order-by [[:asc $id]]
                             :limit    2}))))))

          (testing "Nesting level = 1"
            (is (query= (mt/mbql-query orders
                          {:source-query {:source-table $$orders
                                          :fields       [$id $user_id $product_id $subtotal $tax $total $discount !default.created_at $quantity
                                                         &PRODUCTS__via__PRODUCT_ID.product_id->products.title]
                                          :joins        [{:source-table $$products
                                                          :condition    [:= $product_id &Products.products.id]
                                                          :alias        "Products"
                                                          :strategy     :left-join}
                                                         expected-join]
                                          :order-by     [[:asc $id]]}
                           :limit        2})
                        (second
                         (add-fk-remaps
                          (mt/mbql-query orders
                            {:source-query {:source-table $$orders
                                            :fields       [$id $user_id $product_id $subtotal $tax $total $discount !default.created_at $quantity]
                                            :joins        [{:source-table $$products
                                                            :condition    [:= $product_id &Products.products.id]
                                                            :alias        "Products"
                                                            :strategy     :left-join}]
                                            :order-by     [[:asc $id]]}
                             :limit        2})))))))))))

(deftest add-remappings-inside-joins-test
  (testing "Remappings should work inside joins (#15578)"
    (mt/dataset sample-dataset
      (mt/with-column-remappings [orders.product_id products.title]
        (is (query= (mt/mbql-query products
                      {:joins  [{:source-query {:source-table $$orders}
                                 :alias        "Q1"
                                 :fields       [&Q1.orders.id
                                                &Q1.orders.product_id
                                                &PRODUCTS__via__PRODUCT_ID.orders.product_id->title]
                                 :condition    [:= $id &Q1.orders.product_id]
                                 :strategy     :left-join}
                                {:source-table $$products
                                 :alias        "PRODUCTS__via__PRODUCT_ID"
                                 :condition    [:= $orders.product_id &PRODUCTS__via__PRODUCT_ID.products.id]
                                 :strategy     :left-join
                                 :fk-field-id  %orders.product_id}]
                       :fields [&Q1.orders.id
                                &Q1.orders.product_id
                                &PRODUCTS__via__PRODUCT_ID.orders.product_id->products.title]
                       :limit  2})
                    (second
                     (add-fk-remaps
                      (mt/mbql-query products
                        {:joins  [{:strategy     :left-join
                                   :source-query {:source-table $$orders}
                                   :alias        "Q1"
                                   :condition    [:= $id &Q1.orders.product_id]
                                   :fields       [&Q1.orders.id
                                                  &Q1.orders.product_id]}]
                         :fields [&Q1.orders.id &Q1.orders.product_id]
                         :limit  2})))))))))
