(ns metabase.query-processor.middleware.add-dimension-projections-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.context.default :as context.default]
   [metabase.query-processor.middleware.add-dimension-projections
    :as qp.add-dimension-projections]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db))


;;; ----------------------------------------- add-fk-remaps (pre-processing) -----------------------------------------

(def ^:private remapped-field
  {:name                      "Category ID [external remap]"
   :field-id                  (meta/id :venues :category-id)
   :human-readable-field-id   (meta/id :categories :name)
   :field-name                "CATEGORY_ID"
   :human-readable-field-name "NAME"})

(def ^:private category-id-remap-metadata-provider
  (lib.tu/remap-metadata-provider
   meta/metadata-provider
   (meta/field-metadata :venues :category-id)
   (meta/field-metadata :categories :name)))

(deftest ^:parallel remap-column-infos-test
  (testing "make sure we create the remap column tuples correctly"
    (qp.store/with-metadata-provider category-id-remap-metadata-provider
      (is (=? [{:original-field-clause [:field (meta/id :venues :category-id) nil]
                :new-field-clause      [:field
                                        (meta/id :categories :name)
                                        {:source-field (meta/id :venues :category-id)}]
                :dimension             {:name                      "Category ID [external remap]"
                                        :field-id                  (meta/id :venues :category-id)
                                        :human-readable-field-id   (meta/id :categories :name)
                                        :field-name                "CATEGORY_ID"
                                        :human-readable-field-name "NAME"}}]
              (qp.store/with-metadata-provider (meta/id)
                (#'qp.add-dimension-projections/remap-column-infos
                 [[:field (meta/id :venues :price) nil]
                  [:field (meta/id :venues :longitude) nil]
                  [:field (meta/id :venues :category-id) nil]])))))))

(deftest ^:parallel add-fk-remaps-add-fields-test
  (qp.store/with-metadata-provider category-id-remap-metadata-provider
    (testing "make sure FK remaps add an entry for the FK field to `:fields`, and returns a pair of [dimension-info updated-query]"
      (let [{:keys [remaps query]} (#'qp.add-dimension-projections/add-fk-remaps
                                    (lib.tu.macros/mbql-query venues
                                      {:fields [$price $longitude $category-id]}))]
        (is (=? [remapped-field]
                remaps))
        (is (=? (lib.tu.macros/mbql-query venues
                  {:fields [$price
                            $longitude
                            [:field
                             %category-id
                             {::qp.add-dimension-projections/original-field-dimension-id integer?}]
                            [:field
                             %categories.name
                             {:source-field                                         %category-id
                              ::qp.add-dimension-projections/new-field-dimension-id integer?}]]})
                query))))))

(deftest ^:parallel add-fk-remaps-do-not-add-duplicate-fields-test
  (testing "make sure we don't duplicate remappings"
    (qp.store/with-metadata-provider category-id-remap-metadata-provider
      ;; make sure that we don't add duplicate columns even if the column has some weird unexpected options, i.e. we
      ;; need to do 'normalized' Field comparison for preventing duplicates.
      (doseq [category-name-options (lib.tu.macros/$ids venues
                                      [{:source-field %category-id}
                                       {:source-field               %category-id
                                        ::some-other-namespaced-key true}])]
        (testing (format "\ncategories.name field options = %s" (pr-str category-name-options))
          (let [{:keys [remaps query]} (#'qp.add-dimension-projections/add-fk-remaps
                                        (lib.tu.macros/mbql-query venues
                                          {:fields [$price
                                                    $category-id
                                                    [:field %categories.name category-name-options]
                                                    [:expression "WOW"]
                                                    $longitude]}))]
            (is (=? [remapped-field]
                    remaps))
            (is (=? (lib.tu.macros/mbql-query venues
                      {:fields [$price
                                [:field
                                 %category-id
                                 {::qp.add-dimension-projections/original-field-dimension-id integer?}]
                                [:field
                                 %categories.name
                                 (assoc category-name-options ::qp.add-dimension-projections/new-field-dimension-id integer?)]
                                [:expression "WOW"]
                                $longitude]})
                    query))
            (testing "Preprocessing query again should not result in duplicate columns being added"
              (is (query= query
                          (:query (#'qp.add-dimension-projections/add-fk-remaps query)))))))))))

(deftest ^:parallel add-fk-remaps-replace-order-bys-test
  (testing "adding FK remaps should replace any existing order-bys for a field with order bys for the FK remapping Field"
    (qp.store/with-metadata-provider category-id-remap-metadata-provider
      (let [{:keys [remaps query]} (#'qp.add-dimension-projections/add-fk-remaps
                                    (lib.tu.macros/mbql-query venues
                                      {:fields   [$price $longitude $category-id]
                                       :order-by [[:asc $category-id]]}))]
        (is (=? [remapped-field]
                remaps))
        (is (=? (lib.tu.macros/mbql-query venues
                  {:fields   [$price
                              $longitude
                              [:field
                               %category-id
                               {::qp.add-dimension-projections/original-field-dimension-id integer?}]
                              [:field
                               %categories.name
                               {:source-field                                %category-id
                                ::qp.add-dimension-projections/new-field-dimension-id integer?}]]
                   :order-by [[:asc [:field
                                     %categories.name
                                     {:source-field                                %category-id
                                      ::qp.add-dimension-projections/new-field-dimension-id integer?}]]]})
                query))))))

(deftest ^:parallel add-fk-remaps-replace-breakouts-test
  (testing "adding FK remaps should replace any existing breakouts for a field with order bys for the FK remapping Field"
    (qp.store/with-metadata-provider category-id-remap-metadata-provider
      (let [{:keys [remaps query]} (#'qp.add-dimension-projections/add-fk-remaps
                                    (lib.tu.macros/mbql-query venues
                                      {:breakout    [$category-id]
                                       :aggregation [[:count]]}))]
        (is (=? [remapped-field]
                remaps))
        (is (=? (lib.tu.macros/mbql-query venues
                  {:breakout    [[:field
                                  %categories.name
                                  {:source-field                                %category-id
                                   ::qp.add-dimension-projections/new-field-dimension-id integer?}]
                                 [:field
                                  %category-id
                                  {::qp.add-dimension-projections/original-field-dimension-id integer?}]]
                   :aggregation [[:count]]})
                query))))))

(deftest ^:parallel add-fk-remaps-nested-queries-test
  (testing "make sure FK remaps work with nested queries"
    (qp.store/with-metadata-provider category-id-remap-metadata-provider
      (let [{:keys [remaps query]} (#'qp.add-dimension-projections/add-fk-remaps
                                    (lib.tu.macros/mbql-query venues
                                      {:source-query {:source-table $$venues
                                                      :fields       [$price $longitude $category-id]}}))]
        (is (=? [remapped-field]
                remaps))
        (is (=? (lib.tu.macros/mbql-query venues
                  {:source-query {:source-table $$venues
                                  :fields       [$price
                                                 $longitude
                                                 [:field
                                                  %category-id
                                                  {::qp.add-dimension-projections/original-field-dimension-id integer?}]
                                                 [:field
                                                  %categories.name
                                                  {:source-field %category-id
                                                   ::qp.add-dimension-projections/new-field-dimension-id integer?}]]}})
                query))))))


;;; ---------------------------------------- remap-results (post-processing) -----------------------------------------

(defn- remap-results [query metadata rows]
  (let [rff (qp.add-dimension-projections/remap-results query context.default/default-rff)
        rf  (rff metadata)]
    (transduce identity rf rows)))

(defn- venues-column-metadata []
  (qp.store/bulk-metadata
   :metadata/column
   [(meta/id :venues :id)
    (meta/id :venues :name)
    (meta/id :venues :category-id)
    (meta/id :venues :price)]))

(deftest ^:parallel remap-human-readable-values-test
  (testing "remapping columns with `human_readable_values`"
    (qp.store/with-metadata-provider (lib.tu/remap-metadata-provider
                                      meta/metadata-provider
                                      (meta/field-metadata :venues :category-id)
                                      {4 "Foo", 11 "Bar", 29 "Baz", 20 "Qux", nil "Quux"})
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
                                        {:name "CATEGORY_ID", :remapped_to "Category ID [internal remap]"}
                                        {:name "PRICE"}
                                        {:name "Category ID [internal remap]", :remapped_from "CATEGORY_ID"}]}}
                    (remap-results
                     {}
                     {:cols (venues-column-metadata)}
                     [[1 "Red Medicine"                   4 3]
                      [2 "Stout Burgers & Beers"         11 2]
                      [3 "The Apple Pan"                 11 2]
                      [4 "Wurstküche"                    29 2]
                      [5 "Brite Spot Family Restaurant"  20 2]
                      [6 "Spaghetti Warehouse"          nil 2]]))))))

(deftest ^:parallel remap-human-readable-string-column-test
  (testing "remapping string columns with `human_readable_values`"
    (qp.store/with-metadata-provider (lib.tu/remap-metadata-provider
                                      meta/metadata-provider
                                      (meta/field-metadata :venues :name)
                                      {"apple"  "Appletini"
                                       "banana" "Bananasplit"
                                       "kiwi"   "Kiwi-flavored Thing"})

      (is (partial= {:status    :completed
                     :row_count 3
                     :data      {:rows [[1 "apple"   4 3 "Appletini"]
                                        [2 "banana" 11 2 "Bananasplit"]
                                        [3 "kiwi"   11 2 "Kiwi-flavored Thing"]]
                                 :cols [{:name "ID"}
                                        {:name "NAME", :remapped_to "Name [internal remap]"}
                                        {:name "CATEGORY_ID"}
                                        {:name "PRICE"}
                                        {:name "Name [internal remap]", :remapped_from "NAME"}]}}
                    (remap-results
                     {}
                     {:cols (venues-column-metadata)}
                     [[1 "apple"   4 3]
                      [2 "banana" 11 2]
                      [3 "kiwi"   11 2]]))))))

(deftest ^:parallel transform-values-for-col-test
  (testing "test that different columns types are transformed"
    (is (= (map list [123M 123.0 123N 123 "123"])
           (map #(#'qp.add-dimension-projections/transform-values-for-col {:base-type %} [123])
                [:type/Decimal :type/Float :type/BigInteger :type/Integer :type/Text])))))

(deftest ^:parallel external-remappings-metadata-test
  (testing "test that external remappings get the appropriate `:remapped_from`/`:remapped_to` info"
    (qp.store/with-metadata-provider meta/metadata-provider
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
                                                                       :field-id                  (meta/id :venues :category-id)
                                                                       :field-name                "category_id"
                                                                       :human-readable-field-id   1
                                                                       :human-readable-field-name "category_name"}]}
                     {:cols (let [[venues-id venues-name venues-category-id venues-price]
                                  (venues-column-metadata)]
                              [venues-id
                               venues-name
                               (assoc-in venues-category-id [:options ::qp.add-dimension-projections/original-field-dimension-id] 1000)
                               venues-price
                               (-> venues-category-id
                                   (assoc :name "CATEGORY")
                                   (assoc-in [:options ::qp.add-dimension-projections/new-field-dimension-id] 1000))])}
                     []))))))

(deftest ^:parallel dimension-remappings-test
  (testing "Make sure columns from remapping Dimensions are spliced into the query during pre-processing"
    (qp.store/with-metadata-provider (lib.tu/remap-metadata-provider
                                      meta/metadata-provider
                                      (meta/field-metadata :orders :product-id)
                                      (meta/field-metadata :products :title))
      (let [query        (lib.tu.macros/mbql-query orders
                           {:fields   [$id $user-id $product-id $subtotal $tax $total $discount !default.created-at $quantity]
                            :joins    [{:fields       :all
                                        :source-table $$products
                                        :condition    [:= $product-id &Products.products.id]
                                        :alias        "Products"}]
                            :order-by [[:asc $id]]
                            :limit    2})
            dimension-id (get-in (lib.metadata/field (qp.store/metadata-provider) (meta/id :orders :product-id))
                                 [:lib/external-remap :id])]
        (doseq [nesting-level [0 1]
                :let          [query (mt/nest-query query nesting-level)]]
          (testing (format "nesting level = %d" nesting-level)
            (is (= (-> query
                       (assoc-in
                        (concat [:query] (repeat nesting-level :source-query) [:fields])
                        (lib.tu.macros/$ids orders
                          [$id
                           $user-id
                           [:field %product-id {::qp.add-dimension-projections/original-field-dimension-id dimension-id}]
                           $subtotal
                           $tax
                           $total
                           $discount
                           !default.created-at
                           $quantity
                           [:field %products.title {:source-field                                %product-id
                                                    ::qp.add-dimension-projections/new-field-dimension-id dimension-id}]]))
                       (assoc ::qp.add-dimension-projections/external-remaps [{:id                        dimension-id
                                                                               :field-id                  (meta/id :orders :product-id)
                                                                               :name                      "Product ID [external remap]"
                                                                               :human-readable-field-id   (meta/id :products :title)
                                                                               :field-name                "PRODUCT_ID"
                                                                               :human-readable-field-name "TITLE"}]))
                   (#'qp.add-dimension-projections/add-remapped-columns query)))))))))

(deftest ^:parallel fk-remaps-with-multiple-columns-with-same-name-test
  (testing "Make sure we remap to the correct column when some of them have duplicate names"
    (qp.store/with-metadata-provider category-id-remap-metadata-provider
      (let [query                                     (lib.tu.macros/mbql-query venues
                                                        {:fields   [$name $category-id]
                                                         :order-by [[:asc $name]]
                                                         :limit    4})
            {remap-info :remaps, preprocessed :query} (#'qp.add-dimension-projections/add-fk-remaps query)]
        (testing "Preprocessing"
          (testing "Remap info"
            (is (=? (lib.tu.macros/$ids venues
                      [{:id                        integer?
                        :field-id                  %category-id
                        :name                      "Category ID [external remap]"
                        :human-readable-field-id   %categories.name
                        :field-name                "CATEGORY_ID"
                        :human-readable-field-name "NAME"}])
                    remap-info)))
          (testing "query"
            (is (=? (lib.tu.macros/mbql-query venues
                      {:fields   [$name
                                  [:field %category-id {::qp.add-dimension-projections/original-field-dimension-id integer?}]
                                  [:field %categories.name {:source-field                                         %category-id
                                                            ::qp.add-dimension-projections/new-field-dimension-id integer?}]]
                       :order-by [[:asc $name]]
                       :limit    4})
                    preprocessed))))
        (testing "Post-processing"
          (let [dimension-id (get-in (lib.metadata/field (qp.store/metadata-provider) (meta/id :venues :category-id))
                                     [:lib/external-remap :id])
                _            (is (integer? dimension-id))
                metadata     (lib.tu.macros/$ids venues
                               {:cols [{:name         "NAME"
                                        :id           %name
                                        :display_name "Name"}
                                       {:name         "CATEGORY_ID"
                                        :id           %category-id
                                        :display_name "Category ID"
                                        :options      {::qp.add-dimension-projections/original-field-dimension-id dimension-id}}
                                       {:name         "NAME_2"
                                        :id           %categories.name
                                        :display_name "Category → Name"
                                        :fk_field_id  %category-id
                                        :options      {::qp.add-dimension-projections/new-field-dimension-id dimension-id}}]})]
            (testing "metadata"
              (is (=? {:cols [{:name         "NAME"
                               :display_name "Name"}
                              {:name         "CATEGORY_ID"
                               :display_name "Category ID"
                               :remapped_to  "NAME_2"}
                              {:name          "NAME_2"
                               :display_name  "Category ID [external remap]"
                               :remapped_from "CATEGORY_ID"}]}
                      (#'qp.add-dimension-projections/add-remapped-to-and-from-metadata metadata remap-info nil))))))))))

(deftest ^:parallel multiple-fk-remaps-test
  (testing "Should be able to do multiple FK remaps via different FKs from Table A to Table B (#9236)\n"
    (qp.store/with-metadata-provider (-> meta/metadata-provider
                                         (lib.tu/remap-metadata-provider (meta/field-metadata :venues :category-id)
                                                                         (meta/field-metadata :categories :name))
                                         (lib.tu/remap-metadata-provider (meta/field-metadata :venues :id)
                                                                         (meta/field-metadata :categories :name)))
      (let [query                                     (lib.tu.macros/mbql-query venues
                                                        {:fields   [$category-id $id $name]
                                                         :order-by [[:asc $id]]
                                                         :limit    3})
            category-id-dimension-id                  (-> (lib.metadata/field (qp.store/metadata-provider) (meta/id :venues :category-id))
                                                          (get-in [:lib/external-remap :id]))
            id-dimension-id                           (-> (lib.metadata/field (qp.store/metadata-provider) (meta/id :venues :id))
                                                          (get-in [:lib/external-remap :id]))
            {remap-info :remaps, preprocessed :query} (#'qp.add-dimension-projections/add-fk-remaps query)]
        (testing "Pre-processing"
          (testing "Remap info"
            (is (query= (lib.tu.macros/$ids venues
                          [{:id                        category-id-dimension-id
                            :field-id                  %category-id
                            :name                      "Category ID [external remap]"
                            :human-readable-field-id   %categories.name
                            :field-name                "CATEGORY_ID"
                            :human-readable-field-name "NAME"}
                           {:id                        id-dimension-id
                            :field-id                  %id
                            :name                      "ID [external remap]"
                            :human-readable-field-id   %categories.name
                            :field-name                "ID"
                            :human-readable-field-name "NAME_2"}])
                        remap-info))))
        (testing "query"
          (is (=? (lib.tu.macros/mbql-query venues
                    {:fields [[:field
                               %category-id
                               {::qp.add-dimension-projections/original-field-dimension-id category-id-dimension-id}]
                              [:field
                               %id
                               {::qp.add-dimension-projections/original-field-dimension-id id-dimension-id}]
                              $name
                              [:field
                               %categories.name
                               {:source-field                                         %category-id
                                ::qp.add-dimension-projections/new-field-dimension-id category-id-dimension-id}]
                              [:field
                               %categories.name
                               {:source-field                                         %id
                                ::qp.add-dimension-projections/new-field-dimension-id id-dimension-id}]]})
                  preprocessed)))
        (testing "Post-processing"
          (let [metadata (lib.tu.macros/$ids venues
                           {:cols [{:name         "CATEGORY_ID"
                                    :id           %category-id
                                    :display_name "Category ID"
                                    :options      {::qp.add-dimension-projections/original-field-dimension-id category-id-dimension-id}}
                                   {:name         "ID"
                                    :id           %id
                                    :display_name "ID"
                                    :options      {::qp.add-dimension-projections/original-field-dimension-id id-dimension-id}}
                                   {:name         "NAME"
                                    :id           %name
                                    :display_name "Name"}
                                   {:name         "NAME_2"
                                    :id           %categories.name
                                    :display_name "Categories → Name"
                                    :fk_field_id  %category-id
                                    :options      {::qp.add-dimension-projections/new-field-dimension-id category-id-dimension-id}}
                                   {:name         "NAME_3"
                                    :id           %categories.name
                                    :display_name "Categories → Name"
                                    :fk_field_id  %id
                                    :options      {::qp.add-dimension-projections/new-field-dimension-id id-dimension-id}}]})]
            (testing "metadata"
              (is (partial= {:cols [{:display_name "Category ID", :name "CATEGORY_ID", :remapped_to "NAME_2"}
                                    {:display_name "ID", :name "ID", :remapped_to "NAME_3"}
                                    {:display_name "Name", :name "NAME"}
                                    {:display_name "Category ID [external remap]", :name "NAME_2", :remapped_from "CATEGORY_ID"}
                                    {:display_name "ID [external remap]", :name "NAME_3", :remapped_from "ID"}]}
                            (#'qp.add-dimension-projections/add-remapped-to-and-from-metadata metadata remap-info nil))))))))))

;;; TODO -- this test was actually broken in the PR that introduced it (#20154) -- it used `partial` instead of
;;; `partial=`, which ended up asserting nothing of value. However, other tests for this
;;; issue, [[metabase.query-processor-test.remapping-test/remapped-columns-in-joined-source-queries-test]], and a test
;;; in `e2e/test/scenarios/joins/joins.cy.spec.js`, are still passing. So I'm not sure what to do with this test. I
;;; updated it to use MLv2, but it's commented out for now.
;;;
;;; Note that it mostly passes if you
;;; update [[metabase.query-processor.middleware.add-dimension-projections/remap-column-infos]] not to ignore `:field`
;;; clauses with a `:join-alias`, altho the implicit joins don't get added by this middleware.

#_
(deftest ^:parallel add-remappings-inside-joins-test
  (testing "Remappings should work inside joins (#15578)"
    (qp.store/with-metadata-provider (lib.tu/remap-metadata-provider
                                      meta/metadata-provider
                                      (meta/field-metadata :orders :product-id)
                                      (meta/field-metadata :products :title))
      (is (=? (lib.tu.macros/mbql-query products
                {:joins  [{:source-query {:source-table $$orders}
                           :alias        "Q1"
                           :fields       [&Q1.orders.id
                                          &Q1.orders.product-id
                                          &PRODUCTS__via__PRODUCT_ID.orders.product-id->title]
                           :condition    [:= $id &Q1.orders.product-id]
                           :strategy     :left-join}
                          {:source-table $$products
                           :alias        "PRODUCTS__via__PRODUCT_ID"
                           :condition    [:= $orders.product-id &PRODUCTS__via__PRODUCT_ID.products.id]
                           :strategy     :left-join
                           :fk-field-id  %orders.product-id}]
                 :fields [&Q1.orders.id
                          &Q1.orders.product-id
                          $orders.product-id->products.title
                          &PRODUCTS__via__PRODUCT_ID.orders.product-id->products.title]
                 :limit  2})
              (qp.add-dimension-projections/add-remapped-columns
               (lib.tu.macros/mbql-query products
                 {:joins  [{:strategy     :left-join
                            :source-query {:source-table $$orders}
                            :alias        "Q1"
                            :condition    [:= $id &Q1.orders.product-id]
                            :fields       [&Q1.orders.id
                                           &Q1.orders.product-id]}]
                  :fields [&Q1.orders.id &Q1.orders.product-id]
                  :limit  2})))))))

(deftest internal-remap-e2e-test
  (mt/with-column-remappings [venues.category_id (values-of categories.name)]
    (let [results (qp/process-query
                   {:database (mt/id)
                    :type     :query
                    :query    {:source-table (mt/id :venues)
                               :limit        2}})]
      (is (= ["ID" "Name"  "Category ID" "Latitude" "Longitude" "Price" "Category ID [internal remap]"]
             (mapv :display_name (get-in results [:data :cols]))))
      (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3 "Asian"]
              [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 "Burger"]]
             (mt/rows results))))))

(deftest ^:parallel different-id-types-test
  (testing "Make sure different ID types like Integers vs BigDecimals (Oracle) are handled correctly\n"
    (doseq [{:keys [base-type cast-fn]} [{:base-type :type/Integer,    :cast-fn int}
                                         {:base-type :type/Integer,    :cast-fn long}
                                         {:base-type :type/Decimal,    :cast-fn bigdec}
                                         {:base-type :type/BigInteger, :cast-fn bigint}
                                         {:base-type :type/Text,       :cast-fn str}]]
      (testing (format "Base type = %s; IDs in result rows are %s" base-type (class (cast-fn 1)))
        (let [info (#'qp.add-dimension-projections/col->dim-map
                    1
                    (assoc (meta/field-metadata :venues :category-id)
                           :base-type          base-type
                           :effective-type     base-type
                           :lib/internal-remap {:lib/type              :metadata.column.remapping/internal
                                                :id                    1
                                                :name                  "Category ID [internal remap]"
                                                :values                [24]
                                                :human-readable-values ["Fashion"]}))
              f    (#'qp.add-dimension-projections/make-row-map-fn [info])]
          (is (= [["Some store" (cast-fn 1) nil]
                  ["Another store" (cast-fn 24) "Fashion"]]
                 (transduce (map f) conj [] [["Some store" (cast-fn 1)]
                                             ["Another store" (cast-fn 24)]]))))))))
