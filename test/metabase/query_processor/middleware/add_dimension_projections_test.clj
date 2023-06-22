(ns metabase.query-processor.middleware.add-dimension-projections-test
  (:require
   [clojure.test :refer :all]
   [metabase.models.dimension :refer [Dimension]]
   [metabase.models.field :refer [Field]]
   [metabase.query-processor.context.default :as context.default]
   [metabase.query-processor.middleware.add-dimension-projections
    :as qp.add-dimension-projections]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(use-fixtures :once (fixtures/initialize :db))


;;; ----------------------------------------- add-fk-remaps (pre-processing) -----------------------------------------

(defn- add-fk-remaps [query]
  (mt/with-everything-store
    (#'qp.add-dimension-projections/add-fk-remaps query)))

(def ^:private remapped-field
  (delay
    {:id                        1000
     :name                      "Product"
     :field_id                  (mt/id :venues :category_id)
     :human_readable_field_id   (mt/id :categories :name)
     :field_name                "CATEGORY_ID"
     :human_readable_field_name "NAME"}))

(defn- do-with-fake-remappings-for-category-id [f]
  (with-redefs [qp.add-dimension-projections/fields->field-id->remapping-dimension
                (constantly
                 {(mt/id :venues :category_id) @remapped-field})]
    (f)))

(deftest remap-column-infos-test
  (testing "make sure we create the remap column tuples correctly"
    (do-with-fake-remappings-for-category-id
     (fn []
       (is (= [{:original-field-clause [:field (mt/id :venues :category_id) nil]
                :new-field-clause      [:field
                                        (mt/id :categories :name)
                                        {:source-field                                (mt/id :venues :category_id)
                                         ::qp.add-dimension-projections/new-field-dimension-id 1000}]
                :dimension             @remapped-field}]
              (mt/with-everything-store
                (#'qp.add-dimension-projections/remap-column-infos
                 [[:field (mt/id :venues :price) nil]
                  [:field (mt/id :venues :longitude) nil]
                  [:field (mt/id :venues :category_id) nil]]))))))))

(deftest add-fk-remaps-add-fields-test
  (do-with-fake-remappings-for-category-id
   (fn []
     (testing "make sure FK remaps add an entry for the FK field to `:fields`, and returns a pair of [dimension-info updated-query]"
       (let [{:keys [remaps query]} (add-fk-remaps
                                     (mt/mbql-query venues
                                       {:fields [$price $longitude $category_id]}))]
         (is (= [@remapped-field]
                remaps))
         (is (query= (mt/mbql-query venues
                       {:fields [$price
                                 $longitude
                                 [:field
                                  %category_id
                                  {::qp.add-dimension-projections/original-field-dimension-id 1000}]
                                 [:field
                                  %categories.name
                                  {:source-field                                 %category_id
                                   ::qp.add-dimension-projections/new-field-dimension-id 1000}]]})
                     query)))))))

(deftest add-fk-remaps-do-not-add-duplicate-fields-test
  (testing "make sure we don't duplicate remappings"
    (do-with-fake-remappings-for-category-id
     (fn []
       ;; make sure that we don't add duplicate columns even if the column has some weird unexpected options, i.e. we
       ;; need to do 'normalized' Field comparison for preventing duplicates.
       (doseq [category-name-options (mt/$ids venues
                                       [{:source-field %category_id}
                                        {:source-field               %category_id
                                         ::some-other-namespaced-key true}])]
         (testing (format "\ncategories.name field options = %s" (pr-str category-name-options))
           (let [{:keys [remaps query]} (add-fk-remaps
                                         (mt/mbql-query venues
                                           {:fields [$price
                                                     $category_id
                                                     [:field %categories.name category-name-options]
                                                     [:expression "WOW"]
                                                     $longitude]}))]
             (is (= [@remapped-field]
                    remaps))
             (is (query= (mt/mbql-query venues
                           {:fields [$price
                                     [:field
                                      %category_id
                                      {::qp.add-dimension-projections/original-field-dimension-id 1000}]
                                     [:field
                                      %categories.name
                                      (assoc category-name-options ::qp.add-dimension-projections/new-field-dimension-id 1000)]
                                     [:expression "WOW"]
                                     $longitude]})
                         query))

             (testing "Preprocessing query again should not result in duplicate columns being added"
               (is (query= query
                           (:query (add-fk-remaps query))))))))))))

(deftest add-fk-remaps-replace-order-bys-test
  (testing "adding FK remaps should replace any existing order-bys for a field with order bys for the FK remapping Field"
    (do-with-fake-remappings-for-category-id
     (fn []
       (let [{:keys [remaps query]} (add-fk-remaps
                                     (mt/mbql-query venues
                                       {:fields   [$price $longitude $category_id]
                                        :order-by [[:asc $category_id]]}))]
         (is (= [@remapped-field]
                remaps))
         (is (= (mt/mbql-query venues
                  {:fields   [$price
                              $longitude
                              [:field
                               %category_id
                               {::qp.add-dimension-projections/original-field-dimension-id 1000}]
                              [:field
                               %categories.name
                               {:source-field                                %category_id
                                ::qp.add-dimension-projections/new-field-dimension-id 1000}]]
                   :order-by [[:asc [:field
                                     %categories.name
                                     {:source-field                                %category_id
                                      ::qp.add-dimension-projections/new-field-dimension-id 1000}]]]})
                query)))))))

(deftest add-fk-remaps-replace-breakouts-test
  (testing "adding FK remaps should replace any existing breakouts for a field with order bys for the FK remapping Field"
    (do-with-fake-remappings-for-category-id
     (fn []
       (let [{:keys [remaps query]} (add-fk-remaps
                                     (mt/mbql-query venues
                                       {:breakout    [$category_id]
                                        :aggregation [[:count]]}))]
         (is (= [@remapped-field]
                remaps))
         (is (query= (mt/mbql-query venues
                       {:breakout    [[:field
                                       %categories.name
                                       {:source-field                                %category_id
                                        ::qp.add-dimension-projections/new-field-dimension-id 1000}]
                                      [:field
                                       %category_id
                                       {::qp.add-dimension-projections/original-field-dimension-id 1000}]]
                        :aggregation [[:count]]})
                     query)))))))

(deftest add-fk-remaps-nested-queries-test
  (testing "make sure FK remaps work with nested queries"
    (do-with-fake-remappings-for-category-id
     (fn []
       (let [{:keys [remaps query]} (add-fk-remaps
                                     (mt/mbql-query venues
                                       {:source-query {:source-table $$venues
                                                       :fields       [$price $longitude $category_id]}}))]
         (is (= [@remapped-field]
                remaps))
         (is (query= (mt/mbql-query venues
                       {:source-query {:source-table $$venues
                                       :fields       [$price
                                                      $longitude
                                                      [:field
                                                       %category_id
                                                       {::qp.add-dimension-projections/original-field-dimension-id 1000}]
                                                      [:field
                                                       %categories.name
                                                       {:source-field %category_id
                                                        ::qp.add-dimension-projections/new-field-dimension-id 1000}]]}})
                     query)))))))


;;; ---------------------------------------- remap-results (post-processing) -----------------------------------------

(defn- remap-results [query metadata rows]
  (let [rff (qp.add-dimension-projections/remap-results query context.default/default-rff)
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
                                          {:name "CATEGORY_ID", :remapped_to "Foo [internal remap]"}
                                          {:name "PRICE"}
                                          {:name "Foo [internal remap]", :remapped_from "CATEGORY_ID"}]}}
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
                                          {:name "NAME", :remapped_to "Foo [internal remap]"}
                                          {:name "CATEGORY_ID"}
                                          {:name "PRICE"}
                                          {:name "Foo [internal remap]", :remapped_from "NAME"}]}}
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
           (map #(#'qp.add-dimension-projections/transform-values-for-col {:base_type %} [123])
                [:type/Decimal :type/Float :type/BigInteger :type/Integer :type/Text])))))

(deftest external-remappings-metadata-test
  (testing "test that external remappings get the appropriate `:remapped_from`/`:remapped_to` info"
    (t2.with-temp/with-temp [Field {category-id :id} {:name "CATEGORY", :display_name "Category"}]
      (is (partial= {:status    :completed
                     :row_count 0
                     :data      {:rows []
                                 :cols [{:name "ID"}
                                        {:name "NAME"}
                                        {:name        "CATEGORY_ID"
                                         :remapped_to "CATEGORY"}
                                        {:name "PRICE"}
                                        {:name          "CATEGORY"
                                         :remapped_from "CATEGORY_ID"
                                         :display_name  "My Venue Category"}]}}
                    (remap-results
                      {::qp.add-dimension-projections/external-remaps [{:id                        1000
                                                                        :name                      "My Venue Category"
                                                                        :field_id                  (mt/id :venues :category_id)
                                                                        :field_name                "category_id"
                                                                        :human_readable_field_id   category-id
                                                                        :human_readable_field_name "category_name"}]}
                     {:cols [{:name "ID"}
                             {:name "NAME"}
                             {:name    "CATEGORY_ID"
                              :id      (mt/id :venues :category_id)
                              :options {::qp.add-dimension-projections/original-field-dimension-id 1000}}
                             {:name "PRICE"}
                             {:name    "CATEGORY"
                              :id      category-id
                              :options {::qp.add-dimension-projections/new-field-dimension-id 1000}}]}
                     []))))))

(deftest dimension-remappings-test
  (testing "Make sure columns from remapping Dimensions are spliced into the query during pre-processing"
    (mt/dataset sample-dataset
      (mt/with-column-remappings [orders.product_id products.title]
        (let [query        (mt/mbql-query orders
                             {:fields   [$id $user_id $product_id $subtotal $tax $total $discount !default.created_at $quantity]
                              :joins    [{:fields       :all
                                          :source-table $$products
                                          :condition    [:= $product_id &Products.products.id]
                                          :alias        "Products"}]
                              :order-by [[:asc $id]]
                              :limit    2})
              dimension-id (t2/select-one-pk Dimension :field_id (mt/id :orders :product_id))]
          (doseq [nesting-level [0 1]
                  :let          [query (mt/nest-query query nesting-level)]]
            (testing (format "nesting level = %d" nesting-level)
              (is (= (-> query
                         (assoc-in
                          (concat [:query] (repeat nesting-level :source-query) [:fields])
                          (mt/$ids orders
                            [$id
                             $user_id
                             [:field %product_id {::qp.add-dimension-projections/original-field-dimension-id dimension-id}]
                             $subtotal
                             $tax
                             $total
                             $discount
                             !default.created_at
                             $quantity
                             [:field %products.title {:source-field                                %product_id
                                                      ::qp.add-dimension-projections/new-field-dimension-id dimension-id}]]))
                         (assoc ::qp.add-dimension-projections/external-remaps [{:id                        dimension-id
                                                                                 :field_id                  (mt/id :orders :product_id)
                                                                                 :name                      "Product ID [external remap]"
                                                                                 :human_readable_field_id   (mt/id :products :title)
                                                                                 :field_name                "PRODUCT_ID"
                                                                                 :human_readable_field_name "TITLE"}]))
                     (mt/with-everything-store
                       (#'qp.add-dimension-projections/add-remapped-columns query)))))))))))

(deftest fk-remaps-with-multiple-columns-with-same-name-test
  (testing "Make sure we remap to the correct column when some of them have duplicate names"
    (mt/with-column-remappings [venues.category_id categories.name]
      (let [query                                     (mt/mbql-query venues
                                                        {:fields   [$name $category_id]
                                                         :order-by [[:asc $name]]
                                                         :limit    4})
            {remap-info :remaps, preprocessed :query} (add-fk-remaps query)
            dimension-id                              (t2/select-one-pk Dimension
                                                        :field_id                (mt/id :venues :category_id)
                                                        :human_readable_field_id (mt/id :categories :name))]
        (is (integer? dimension-id))
        (testing "Preprocessing"
          (testing "Remap info"
            (is (query= (mt/$ids venues
                          [{:id                        dimension-id
                            :field_id                  %category_id
                            :name                      "Category ID [external remap]"
                            :human_readable_field_id   %categories.name
                            :field_name                "CATEGORY_ID"
                            :human_readable_field_name "NAME"}])
                        remap-info)))
          (testing "query"
            (is (query= (mt/mbql-query venues
                          {:fields   [$name
                                      [:field %category_id {::qp.add-dimension-projections/original-field-dimension-id dimension-id}]
                                      [:field %categories.name {:source-field                                %category_id
                                                                ::qp.add-dimension-projections/new-field-dimension-id dimension-id}]]
                           :order-by [[:asc $name]]
                           :limit    4})
                        preprocessed))))
        (testing "Post-processing"
          (let [metadata (mt/$ids venues
                           {:cols [{:name         "NAME"
                                    :id           %name
                                    :display_name "Name"}
                                   {:name         "CATEGORY_ID"
                                    :id           %category_id
                                    :display_name "Category ID"
                                    :options      {::qp.add-dimension-projections/original-field-dimension-id dimension-id}}
                                   {:name         "NAME_2"
                                    :id           %categories.name
                                    :display_name "Category → Name"
                                    :fk_field_id  %category_id
                                    :options      {::qp.add-dimension-projections/new-field-dimension-id dimension-id}}]})]
            (testing "metadata"
              (is (partial= {:cols [{:name "NAME", :display_name "Name"}
                                    {:name "CATEGORY_ID", :display_name "Category ID", :remapped_to "NAME_2"}
                                    {:name "NAME_2", :display_name "Category ID [external remap]", :remapped_from "CATEGORY_ID"}]}
                            (#'qp.add-dimension-projections/add-remapped-to-and-from-metadata metadata remap-info nil))))))))))

(deftest multiple-fk-remaps-test
  (testing "Should be able to do multiple FK remaps via different FKs from Table A to Table B (#9236)\n"
    (mt/dataset avian-singles
      (mt/with-column-remappings [messages.sender_id   users.name
                                  messages.receiver_id users.name]
        (let [query                                     (mt/mbql-query messages
                                                          {:fields   [$sender_id $receiver_id $text]
                                                           :order-by [[:asc $id]]
                                                           :limit    3})
              sender-dimension-id                       (t2/select-one-pk Dimension
                                                          :field_id                (mt/id :messages :sender_id)
                                                          :human_readable_field_id (mt/id :users :name))
              receiver-dimension-id                     (t2/select-one-pk Dimension
                                                          :field_id                (mt/id :messages :receiver_id)
                                                          :human_readable_field_id (mt/id :users :name))
              {remap-info :remaps, preprocessed :query} (add-fk-remaps query)]
          (testing "Pre-processing"
            (testing "Remap info"
              (is (query= (mt/$ids messages
                            [{:id                        sender-dimension-id
                              :field_id                  %sender_id
                              :name                      "Sender ID [external remap]"
                              :human_readable_field_id   %users.name
                              :field_name                "SENDER_ID"
                              :human_readable_field_name "NAME"}
                             {:id                        receiver-dimension-id
                              :field_id                  %receiver_id
                              :name                      "Receiver ID [external remap]"
                              :human_readable_field_id   %users.name
                              :field_name                "RECEIVER_ID"
                              :human_readable_field_name "NAME_2"}])
                          remap-info))))
          (testing "query"
            (is (query= (mt/mbql-query messages
                          {:fields   [[:field %sender_id {::qp.add-dimension-projections/original-field-dimension-id sender-dimension-id}]
                                      [:field %receiver_id {::qp.add-dimension-projections/original-field-dimension-id receiver-dimension-id}]
                                      $text
                                      [:field %users.name {:source-field                                         %sender_id
                                                           ::qp.add-dimension-projections/new-field-dimension-id sender-dimension-id}]
                                      [:field %users.name {:source-field                                         %receiver_id
                                                           ::qp.add-dimension-projections/new-field-dimension-id receiver-dimension-id}]]
                           :order-by [[:asc $id]]
                           :limit    3})
                        preprocessed)))

          (testing "Post-processing"
            (let [metadata (mt/$ids messages
                             {:cols [{:name         "SENDER_ID"
                                      :id           %sender_id
                                      :display_name "Sender ID"
                                      :options      {::qp.add-dimension-projections/original-field-dimension-id sender-dimension-id}}
                                     {:name         "RECEIVER_ID"
                                      :id           %receiver_id
                                      :display_name "Receiver ID"
                                      :options      {::qp.add-dimension-projections/original-field-dimension-id receiver-dimension-id}}
                                     {:name         "TEXT"
                                      :id           %text
                                      :display_name "Text"}
                                     {:name         "NAME"
                                      :id           %users.name
                                      :display_name "Sender → Name"
                                      :fk_field_id  %sender_id
                                      :options      {::qp.add-dimension-projections/new-field-dimension-id sender-dimension-id}}
                                     {:name         "NAME_2"
                                      :id           %users.name
                                      :display_name "Receiver → Name"
                                      :fk_field_id  %receiver_id
                                      :options      {::qp.add-dimension-projections/new-field-dimension-id receiver-dimension-id}}]})]
              (testing "metadata"
                (is (partial= {:cols [{:display_name "Sender ID", :name "SENDER_ID", :remapped_to "NAME"}
                                      {:display_name "Receiver ID", :name "RECEIVER_ID", :remapped_to "NAME_2"}
                                      {:display_name "Text", :name "TEXT"}
                                      {:display_name "Sender ID [external remap]", :name "NAME", :remapped_from "SENDER_ID"}
                                      {:display_name "Receiver ID [external remap]", :name "NAME_2", :remapped_from "RECEIVER_ID"}]}
                              (#'qp.add-dimension-projections/add-remapped-to-and-from-metadata metadata remap-info nil)))))))))))

(deftest add-remappings-inside-joins-test
  (testing "Remappings should work inside joins (#15578)"
    (mt/dataset sample-dataset
      (mt/with-column-remappings [orders.product_id products.title]
        (is (partial (mt/mbql-query products
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
                     (:query
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
