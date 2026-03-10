(ns metabase.query-processor.middleware.add-remaps-test
  (:require
   [clojure.test :refer :all]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.metadata.calculation :as lib.metadata.calculation]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-remaps :as qp.add-remaps]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.reducible :as qp.reducible]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
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
    (is (=? [{:original-field-clause [:field {}
                                      (meta/id :venues :category-id)]
              :new-field-clause      [:field {:source-field (meta/id :venues :category-id)}
                                      (meta/id :categories :name)]
              :dimension             {:name                      "Category ID [external remap]"
                                      :field-id                  (meta/id :venues :category-id)
                                      :human-readable-field-id   (meta/id :categories :name)
                                      :field-name                "CATEGORY_ID"
                                      :human-readable-field-name "NAME"}}]
            (#'qp.add-remaps/remap-column-infos
             (lib/query
              category-id-remap-metadata-provider
              (meta/table-metadata :venues))
             [:stages 0])))
    (testing "but ignore remaps to `:visibility-type :sensitive` columns"
      (is (nil? (-> category-id-remap-metadata-provider
                    (lib.tu/merged-mock-metadata-provider
                     {:fields [{:id               (meta/id :categories :name)
                                :visibility-type :sensitive}]})
                    (lib/query (meta/table-metadata :venues))
                    (#'qp.add-remaps/remap-column-infos [:stages 0])))))))

(deftest ^:parallel add-fk-remaps-add-fields-test
  (testing "make sure FK remaps add an entry for the FK field to `:fields`, and returns a pair of [dimension-info updated-query]"
    (let [{:keys [remaps query]} (#'qp.add-remaps/add-fk-remaps
                                  (lib/query
                                   category-id-remap-metadata-provider
                                   (lib.tu.macros/mbql-query venues
                                     {:fields [$price $longitude $category-id]})))]
      (is (=? [remapped-field]
              remaps))
      (is (=? (lib.tu.macros/mbql-query venues
                {:fields [$price
                          $longitude
                          [:field
                           %category-id
                           {::qp.add-remaps/original-field-dimension-id pos-int?}]
                          [:field
                           %categories.name
                           {:source-field                                         %category-id
                            ::qp.add-remaps/new-field-dimension-id pos-int?}]]})
              (lib/->legacy-MBQL query))))))

(deftest ^:parallel add-fk-remaps-do-not-add-duplicate-fields-test
  (testing "make sure we don't duplicate remappings"
    ;; make sure that we don't add duplicate columns even if the column has some weird unexpected options, i.e. we
    ;; need to do 'normalized' Field comparison for preventing duplicates.
    (doseq [category-name-options (lib.tu.macros/$ids venues
                                    [{:source-field %category-id}
                                     {:source-field               %category-id
                                      ::some-other-namespaced-key true}])]
      (testing (format "\ncategories.name field options = %s" (pr-str category-name-options))
        (let [{:keys [remaps query]} (#'qp.add-remaps/add-fk-remaps
                                      (lib/query
                                       category-id-remap-metadata-provider
                                       (lib.tu.macros/mbql-query venues
                                         {:fields [$price
                                                   $category-id
                                                   [:field %categories.name category-name-options]
                                                   $longitude]})))]
          (is (=? [remapped-field]
                  remaps))
          (is (=? (lib.tu.macros/mbql-query venues
                    {:fields [$price
                              [:field
                               %category-id
                               {::qp.add-remaps/original-field-dimension-id pos-int?}]
                              [:field
                               %categories.name
                               (assoc category-name-options ::qp.add-remaps/new-field-dimension-id pos-int?)]
                              $longitude]})
                  (lib/->legacy-MBQL query)))
          (testing "Preprocessing query again should not result in duplicate columns being added"
            (is (=? query
                    (:query (#'qp.add-remaps/add-fk-remaps query))))))))))

(deftest ^:parallel add-fk-remaps-replace-order-bys-test
  (testing "adding FK remaps should replace any existing order-bys for a field with order bys for the FK remapping Field"
    (let [{:keys [remaps query]} (#'qp.add-remaps/add-fk-remaps
                                  (lib/query
                                   category-id-remap-metadata-provider
                                   (lib.tu.macros/mbql-query venues
                                     {:fields   [$price $longitude $category-id]
                                      :order-by [[:asc $category-id]]})))]
      (is (=? [remapped-field]
              remaps))
      (is (=? (lib.tu.macros/mbql-query venues
                {:fields   [$price
                            $longitude
                            [:field
                             %category-id
                             {::qp.add-remaps/original-field-dimension-id pos-int?}]
                            [:field
                             %categories.name
                             {:source-field                                %category-id
                              ::qp.add-remaps/new-field-dimension-id pos-int?}]]
                 :order-by [[:asc [:field
                                   %categories.name
                                   {:source-field                                %category-id
                                    ::qp.add-remaps/new-field-dimension-id pos-int?}]]]})
              (lib/->legacy-MBQL query))))))

(deftest ^:parallel add-fk-remaps-replace-breakouts-test
  (testing "adding FK remaps should replace any existing breakouts for a field with order bys for the FK remapping Field"
    (let [{:keys [remaps query]} (#'qp.add-remaps/add-fk-remaps
                                  (lib/query
                                   category-id-remap-metadata-provider
                                   (lib.tu.macros/mbql-query venues
                                     {:breakout    [$category-id]
                                      :aggregation [[:count]]})))]
      (is (=? [remapped-field]
              remaps))
      (is (=? (lib.tu.macros/mbql-query venues
                {:breakout    [[:field
                                %categories.name
                                {:source-field                                %category-id
                                 ::qp.add-remaps/new-field-dimension-id pos-int?}]
                               [:field
                                %category-id
                                {::qp.add-remaps/original-field-dimension-id pos-int?}]]
                 :aggregation [[:count]]})
              (lib/->legacy-MBQL query))))))

(deftest ^:parallel add-fk-remaps-nested-queries-test
  (testing "make sure FK remaps work with nested queries"
    (let [{:keys [remaps query]} (#'qp.add-remaps/add-fk-remaps
                                  (lib/query
                                   category-id-remap-metadata-provider
                                   (lib.tu.macros/mbql-query venues
                                     {:source-query {:source-table $$venues
                                                     :fields       [$price $longitude $category-id]}})))]
      (is (=? [remapped-field]
              remaps))
      (is (=? (lib.tu.macros/mbql-query venues
                {:source-query {:source-table $$venues
                                :fields       [$price
                                               $longitude
                                               [:field
                                                %category-id
                                                {::qp.add-remaps/original-field-dimension-id pos-int?}]
                                               [:field
                                                %categories.name
                                                {:source-field %category-id
                                                 ::qp.add-remaps/new-field-dimension-id pos-int?}]]}})
              (lib/->legacy-MBQL query))))))

;;; ---------------------------------------- remap-results (post-processing) -----------------------------------------

(defn- remap-results [query metadata rows]
  (let [rff (qp.add-remaps/remap-results query qp.reducible/default-rff)
        rf  (rff metadata)]
    (transduce identity rf rows)))

(defn venues-column-metadata []
  (lib.metadata/bulk-metadata-or-throw
   (qp.store/metadata-provider)
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
      (is (=? {:status    :completed
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

      (is (=? {:status    :completed
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
           (map #(#'qp.add-remaps/transform-values-for-col {:base-type %} [123] false)
                [:type/Decimal :type/Float :type/BigInteger :type/Integer :type/Text])))
    (testing "and stringified if necessary"
      (is (= (map list ["9007199254740992" "9007199254740992" "9007199254740992"])
             (map #(#'qp.add-remaps/transform-values-for-col {:base-type %} [9007199254740992] true)
                  [:type/Integer :type/BigInteger :type/Decimal]))))))

(deftest ^:parallel external-remappings-metadata-test
  (testing "test that external remappings get the appropriate `:remapped_from`/`:remapped_to` info"
    (qp.store/with-metadata-provider meta/metadata-provider
      (is (=? {:status    :completed
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
               {::qp.add-remaps/external-remaps [{:id                        1000
                                                  :name                      "My Venue Category"
                                                  :field-id                  (meta/id :venues :category-id)
                                                  :field-name                "category_id"
                                                  :human-readable-field-id   1
                                                  :human-readable-field-name "category_name"}]}
               {:cols (let [[venues-id venues-name venues-category-id venues-price]
                            (venues-column-metadata)]
                        [venues-id
                         venues-name
                         (assoc-in venues-category-id [:options ::qp.add-remaps/original-field-dimension-id] 1000)
                         venues-price
                         (-> venues-category-id
                             (assoc :name "CATEGORY")
                             (assoc-in [:options ::qp.add-remaps/new-field-dimension-id] 1000))])}
               []))))))

(deftest ^:parallel dimension-remappings-test
  (testing "Make sure columns from remapping Dimensions are spliced into the query during pre-processing"
    (let [mp           (lib.tu/remap-metadata-provider
                        meta/metadata-provider
                        (meta/field-metadata :orders :product-id)
                        (meta/field-metadata :products :title))
          query        (lib.tu.macros/mbql-query orders
                         {:fields   [$id $user-id $product-id $subtotal $tax $total $discount !default.created-at $quantity]
                          :joins    [{:fields       :all
                                      :source-table $$products
                                      :condition    [:= $product-id &Products.products.id]
                                      :alias        "Products"}]
                          :order-by [[:asc $id]]
                          :limit    2})
          dimension-id (get-in (lib.metadata/field mp (meta/id :orders :product-id))
                               [:lib/external-remap :id])]
      (doseq [nesting-level [0 1]
              :let          [query (reduce
                                    (fn [query _]
                                      (lib/append-stage query))
                                    (lib/query mp query)
                                    (range nesting-level))]]
        (testing (format "nesting level = %d" nesting-level)
          (is (= (-> query
                     lib/->legacy-MBQL
                     (assoc-in
                      (concat [:query] (repeat nesting-level :source-query) [:fields])
                      (lib.tu.macros/$ids orders
                        [$id
                         $user-id
                         [:field %product-id {::qp.add-remaps/original-field-dimension-id dimension-id}]
                         $subtotal
                         $tax
                         $total
                         $discount
                         !default.created-at
                         $quantity
                         [:field %products.title {:source-field                                         %product-id
                                                  ::qp.add-remaps/new-field-dimension-id dimension-id}]]))
                     (assoc ::qp.add-remaps/external-remaps [{:id                        dimension-id
                                                              :field-id                  (meta/id :orders :product-id)
                                                              :name                      "Product ID [external remap]"
                                                              :human-readable-field-id   (meta/id :products :title)
                                                              :field-name                "PRODUCT_ID"
                                                              :human-readable-field-name "TITLE"}]))
                 (-> (#'qp.add-remaps/add-remapped-columns query)
                     lib/->legacy-MBQL))))))))

(deftest ^:parallel fk-remaps-with-multiple-columns-with-same-name-test
  (testing "Make sure we remap to the correct column when some of them have duplicate names"
    (let [query                                     (lib/query
                                                     category-id-remap-metadata-provider
                                                     (lib.tu.macros/mbql-query venues
                                                       {:fields   [$name $category-id]
                                                        :order-by [[:asc $name]]
                                                        :limit    4}))
          {remap-info :remaps, preprocessed :query} (#'qp.add-remaps/add-fk-remaps query)]
      (testing "Preprocessing"
        (testing "Remap info"
          (is (=? (lib.tu.macros/$ids venues
                    [{:id                        pos-int?
                      :field-id                  %category-id
                      :name                      "Category ID [external remap]"
                      :human-readable-field-id   %categories.name
                      :field-name                "CATEGORY_ID"
                      :human-readable-field-name "NAME"}])
                  remap-info)))
        (testing "query"
          (is (=? (lib.tu.macros/mbql-query venues
                    {:fields   [$name
                                [:field %category-id {::qp.add-remaps/original-field-dimension-id pos-int?}]
                                [:field %categories.name {:source-field                                         %category-id
                                                          ::qp.add-remaps/new-field-dimension-id pos-int?}]]
                     :order-by [[:asc $name]]
                     :limit    4})
                  (lib/->legacy-MBQL preprocessed)))))
      (testing "Post-processing"
        (let [dimension-id (get-in (lib.metadata/field category-id-remap-metadata-provider (meta/id :venues :category-id))
                                   [:lib/external-remap :id])
              _            (is (pos-int? dimension-id))
              metadata     (lib.tu.macros/$ids venues
                             {:cols [{:name         "NAME"
                                      :id           %name
                                      :display_name "Name"}
                                     {:name         "CATEGORY_ID"
                                      :id           %category-id
                                      :display_name "Category ID"
                                      :options      {::qp.add-remaps/original-field-dimension-id dimension-id}}
                                     {:name         "NAME_2"
                                      :id           %categories.name
                                      :display_name "Category → Name"
                                      :fk_field_id  %category-id
                                      :options      {::qp.add-remaps/new-field-dimension-id dimension-id}}]})]
          (testing "metadata"
            (is (=? {:cols [{:name         "NAME"
                             :display_name "Name"}
                            {:name         "CATEGORY_ID"
                             :display_name "Category ID"
                             :remapped_to  "NAME_2"}
                            {:name          "NAME_2"
                             :display_name  "Category ID [external remap]"
                             :remapped_from "CATEGORY_ID"}]}
                    (#'qp.add-remaps/add-remapped-to-and-from-metadata metadata remap-info nil)))))))))

(deftest ^:parallel multiple-fk-remaps-test
  (testing "Should be able to do multiple FK remaps via different FKs from Table A to Table B (#9236)\n"
    (let [mp                                        (-> meta/metadata-provider
                                                        (lib.tu/merged-mock-metadata-provider
                                                         {:fields [{:id (meta/id :venues :id)
                                                                    :fk-target-field-id (meta/id :categories :id)}]})
                                                        (lib.tu/remap-metadata-provider (meta/id :venues :category-id)
                                                                                        (meta/id :categories :name))
                                                        (lib.tu/remap-metadata-provider (meta/id :venues :id)
                                                                                        (meta/id :categories :name)))
          query                                     (lib/query
                                                     mp
                                                     (lib.tu.macros/mbql-query venues
                                                       {:fields   [$category-id $id $name]
                                                        :order-by [[:asc $id]]
                                                        :limit    3}))
          category-id-dimension-id                  (-> (lib.metadata/field mp (meta/id :venues :category-id))
                                                        (get-in [:lib/external-remap :id]))
          id-dimension-id                           (-> (lib.metadata/field mp (meta/id :venues :id))
                                                        (get-in [:lib/external-remap :id]))
          {remap-info :remaps, preprocessed :query} (#'qp.add-remaps/add-fk-remaps query)]
      (testing "Pre-processing"
        (testing "Remap info"
          (is (=? (lib.tu.macros/$ids venues
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
                             {::qp.add-remaps/original-field-dimension-id category-id-dimension-id}]
                            [:field
                             %id
                             {::qp.add-remaps/original-field-dimension-id id-dimension-id}]
                            $name
                            [:field
                             %categories.name
                             {:source-field                                         %category-id
                              ::qp.add-remaps/new-field-dimension-id category-id-dimension-id}]
                            [:field
                             %categories.name
                             {:source-field                                         %id
                              ::qp.add-remaps/new-field-dimension-id id-dimension-id}]]})
                (lib/->legacy-MBQL preprocessed))
            "should have 5 fields: CATEGORY_ID, ID, and NAME from the original query; then CATEGORY_ID->NAME and ID->NAME remaps"))
      (testing "Post-processing"
        (let [metadata (lib.tu.macros/$ids venues
                         {:cols [{:name         "CATEGORY_ID"
                                  :id           %category-id
                                  :display_name "Category ID"
                                  :options      {::qp.add-remaps/original-field-dimension-id category-id-dimension-id}}
                                 {:name         "ID"
                                  :id           %id
                                  :display_name "ID"
                                  :options      {::qp.add-remaps/original-field-dimension-id id-dimension-id}}
                                 {:name         "NAME"
                                  :id           %name
                                  :display_name "Name"}
                                 {:name         "NAME_2"
                                  :id           %categories.name
                                  :display_name "Categories → Name"
                                  :fk_field_id  %category-id
                                  :options      {::qp.add-remaps/new-field-dimension-id category-id-dimension-id}}
                                 {:name         "NAME_3"
                                  :id           %categories.name
                                  :display_name "Categories → Name"
                                  :fk_field_id  %id
                                  :options      {::qp.add-remaps/new-field-dimension-id id-dimension-id}}]})]
          (testing "metadata"
            (is (=? {:cols [{:display_name "Category ID", :name "CATEGORY_ID", :remapped_to "NAME_2"}
                            {:display_name "ID", :name "ID", :remapped_to "NAME_3"}
                            {:display_name "Name", :name "NAME"}
                            {:display_name "Category ID [external remap]", :name "NAME_2", :remapped_from "CATEGORY_ID"}
                            {:display_name "ID [external remap]", :name "NAME_3", :remapped_from "ID"}]}
                    (#'qp.add-remaps/add-remapped-to-and-from-metadata metadata remap-info nil)))))))))

;;; TODO -- this test was actually broken in the PR that introduced it (#20154) -- it used `partial` instead of
;;; `partial=`, which ended up asserting nothing of value. However, other tests for this
;;; issue, [[metabase.query-processor.remapping-test/remapped-columns-in-joined-source-queries-test]], and a test
;;; in `e2e/test/scenarios/joins/joins.cy.spec.js`, are still passing. So I'm not sure what to do with this test. I
;;; updated it to use MLv2, but it's commented out for now.
;;;
;;; Note that it mostly passes if you
;;; update [[metabase.query-processor.middleware.add-remaps/remap-column-infos]] not to ignore `:field`
;;; clauses with a `:join-alias`, altho the implicit joins don't get added by this middleware.

#_(deftest ^:parallel add-remappings-inside-joins-test
    (testing "Remappings should work inside joins (#15578)"
      (let [mp (lib.tu/remap-metadata-provider
                meta/metadata-provider
                (meta/field-metadata :orders :product-id)
                (meta/field-metadata :products :title))]
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
                (-> (qp.add-remaps/add-remapped-columns
                     (lib/query
                      mp
                      (lib.tu.macros/mbql-query products
                        {:joins  [{:strategy     :left-join
                                   :source-query {:source-table $$orders}
                                   :alias        "Q1"
                                   :condition    [:= $id &Q1.orders.product-id]
                                   :fields       [&Q1.orders.id
                                                  &Q1.orders.product-id]}]
                         :fields [&Q1.orders.id &Q1.orders.product-id]
                         :limit  2})))
                    lib/->legacy-MBQL))))))

(deftest ^:parallel internal-remap-e2e-test
  (qp.store/with-metadata-provider (lib.tu/remap-metadata-provider
                                    (mt/metadata-provider)
                                    (mt/id :venues :category_id)
                                    (mapv first (mt/rows (qp/process-query
                                                          (mt/mbql-query categories
                                                            {:fields [$name], :order-by [[:asc $id]]})))))
    (let [query     {:database (mt/id)
                     :type     :query
                     :query    {:source-table (mt/id :venues)
                                :limit        2}}
          exp-names ["ID" "Name"  "Category ID" "Latitude" "Longitude" "Price" "Category ID [internal remap]"]]
      (testing "with original IDs"
        (let [results (qp/process-query query)]
          (is (= exp-names
                 (mapv :display_name (get-in results [:data :cols]))))
          (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3 "Asian"]
                  [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 "Burger"]]
                 (mt/rows results)))))
      (testing "with stringified large integers"
        (let [results (qp/process-query (assoc-in query [:middleware :js-int-to-string?] true))]
          (is (= exp-names
                 (mapv :display_name (get-in results [:data :cols]))))
          (is (= [[1 "Red Medicine" 4 10.0646 -165.374 3 "Asian"]
                  [2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 "Burger"]]
                 (mt/rows results))))))))

(deftest ^:parallel different-id-types-test
  (testing "Make sure different ID types like Integers vs BigDecimals (Oracle) are handled correctly\n"
    (doseq [{:keys [base-type cast-fn]} [{:base-type :type/Integer,    :cast-fn int}
                                         {:base-type :type/Integer,    :cast-fn long}
                                         {:base-type :type/Decimal,    :cast-fn bigdec}
                                         {:base-type :type/BigInteger, :cast-fn bigint}
                                         {:base-type :type/Text,       :cast-fn str}]]
      (qp.store/with-metadata-provider meta/metadata-provider
        (testing (format "Base type = %s; IDs in result rows are %s" base-type (class (cast-fn 1)))
          (let [info (#'qp.add-remaps/col->dim-map
                      1
                      (assoc (meta/field-metadata :venues :category-id)
                             :id                 nil
                             :base-type          base-type
                             :effective-type     base-type
                             :lib/internal-remap {:lib/type              :metadata.column.remapping/internal
                                                  :id                    1
                                                  :name                  "Category ID [internal remap]"
                                                  :values                [24]
                                                  :human-readable-values ["Fashion"]}))
                f    (#'qp.add-remaps/make-row-map-fn [info])]
            (is (= [["Some store" (cast-fn 1) nil]
                    ["Another store" (cast-fn 24) "Fashion"]]
                   (transduce (map f) conj [] [["Some store" (cast-fn 1)]
                                               ["Another store" (cast-fn 24)]])))))))))

(deftest ^:parallel remapped-breakout-test
  (testing "remapped breakouts should also update the corresponding order-by"
    (let [mp           (-> meta/metadata-provider
                           (lib.tu/remap-metadata-provider (meta/id :orders :product-id)
                                                           (meta/id :products :title)))
          query        (lib/query
                        mp
                        (mt/mbql-query orders
                          {:aggregation [[:sum [:field (meta/id :orders :total)]]]
                           :breakout    [[:field
                                          (meta/id :orders :product-id)
                                          {:base-type :type/Integer}]]
                           :order-by    [[:asc [:field
                                                (meta/id :orders :product-id)
                                                {:base-type :type/Integer}]]]
                           :limit       3}))
          dimension-id (get-in (lib.metadata/field mp (meta/id :orders :product-id))
                               [:lib/external-remap :id])]
      (is (=? {:stages [{:breakout [[:field {::qp.add-remaps/new-field-dimension-id dimension-id} (meta/id :products :title)]
                                    [:field {::qp.add-remaps/original-field-dimension-id dimension-id} (meta/id :orders :product-id)]]
                         :order-by [[:asc {} [:field {::qp.add-remaps/new-field-dimension-id pos-int?} (meta/id :products :title)]]]}]}
              (qp.add-remaps/add-remapped-columns query))))))

(deftest ^:parallel add-remaps-to-joins-e2e-test
  (testing "Should add 'duplicate' remaps for self-joins (#60444)"
    ;; see https://metaboat.slack.com/archives/C0645JP1W81/p1753208898063419 for further discussion
    (let [mp    (lib.tu/remap-metadata-provider
                 meta/metadata-provider
                 (meta/id :orders :user-id) (meta/id :people :email))
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query orders
                   {:joins [{:source-table $$orders
                             :alias        "j"
                             :condition    [:= $id &j.orders.product-id]
                             :fields       :all}]}))
          preprocessed (-> query
                           qp.preprocess/preprocess
                           lib/->legacy-MBQL)]
      (testing ":query => :joins"
        (let [joins (get-in preprocessed [:query :joins])]
          (testing "=> 0"
            (let [first-join (first joins)]
              (testing "=> :source-query"
                (let [source-query (:source-query first-join)]
                  (is (= 10
                         (count (:fields source-query)))
                      "first join source query should have 10 fields (9 from orders plus one from the remap)")
                  (is (=? {:source-table (meta/id :orders)
                           :joins        [{:alias "PEOPLE__via__USER_ID"}]
                           :fields       [[:field (meta/id :orders :id) {}]
                                          [:field (meta/id :orders :user-id) {::qp.add-remaps/original-field-dimension-id pos-int?}]
                                          [:field (meta/id :orders :product-id) {}]
                                          [:field (meta/id :orders :subtotal) {}]
                                          [:field (meta/id :orders :tax) {}]
                                          [:field (meta/id :orders :total) {}]
                                          [:field (meta/id :orders :discount) {}]
                                          [:field (meta/id :orders :created-at) {}]
                                          [:field (meta/id :orders :quantity) {}]
                                          ;; 1 remap for self-joined orders.user-id => people.email
                                          [:field (meta/id :people :email) {:source-field                          (meta/id :orders :user-id)
                                                                            :join-alias                            "PEOPLE__via__USER_ID"
                                                                            ::qp.add-remaps/new-field-dimension-id pos-int?}]]}
                          source-query))))
              (is (= 10
                     (count (:fields first-join)))
                  "first join should have 10 fields (9 from orders plus one from the remap)")
              (is (=? {:alias        "j"
                       :fields       [[:field (meta/id :orders :id) {:join-alias "j"}]
                                      [:field (meta/id :orders :user-id) {:join-alias                                 "j"
                                                                          ::qp.add-remaps/original-field-dimension-id pos-int?}]
                                      [:field (meta/id :orders :product-id) {:join-alias "j"}]
                                      [:field (meta/id :orders :subtotal) {:join-alias "j"}]
                                      [:field (meta/id :orders :tax) {:join-alias "j"}]
                                      [:field (meta/id :orders :total) {:join-alias "j"}]
                                      [:field (meta/id :orders :discount) {:join-alias "j"}]
                                      [:field (meta/id :orders :created-at) {:join-alias "j"}]
                                      [:field (meta/id :orders :quantity) {:join-alias "j"}]
                                      ;; 1 remap for self-joined orders.user-id => people.email
                                      [:field (meta/id :people :email) {:join-alias "j"}]]}
                      first-join))))
          (is (=? [{:alias "j"}
                   {:alias "PEOPLE__via__USER_ID"}]
                  joins))))
      (testing ":query"
        (let [preprocessed-query (-> preprocessed
                                     :query
                                     (dissoc :joins))]
          (is (= 20
                 (count (:fields preprocessed-query)))
              "Should have 20 fields")
          (is (=? {:fields [;; 9 columns from orders
                            [:field (meta/id :orders :id) {}]
                            [:field (meta/id :orders :user-id) {::qp.add-remaps/original-field-dimension-id pos-int?}]
                            [:field (meta/id :orders :product-id) {}]
                            [:field (meta/id :orders :subtotal) {}]
                            [:field (meta/id :orders :tax) {}]
                            [:field (meta/id :orders :total) {}]
                            [:field (meta/id :orders :discount) {}]
                            [:field (meta/id :orders :created-at) {}]
                            [:field (meta/id :orders :quantity) {}]
                            ;; 9 columns from self-join against orders
                            [:field (meta/id :orders :id) {:join-alias "j"}]
                            [:field (meta/id :orders :user-id) {:join-alias "j", ::qp.add-remaps/original-field-dimension-id pos-int?}]
                            [:field (meta/id :orders :product-id) {:join-alias "j"}]
                            [:field (meta/id :orders :subtotal) {:join-alias "j"}]
                            [:field (meta/id :orders :tax) {:join-alias "j"}]
                            [:field (meta/id :orders :total) {:join-alias "j"}]
                            [:field (meta/id :orders :discount) {:join-alias "j"}]
                            [:field (meta/id :orders :created-at) {:join-alias "j"}]
                            [:field (meta/id :orders :quantity) {:join-alias "j"}]
                            ;;
                            ;; The order of these columns seems to be 'flexible' (I would consider either to be
                            ;; correct), and I've seen both in two different branches of mine attempting to fix this
                            ;; bug. The order doesn't matter at all to the FE, so if this changes in the future it's ok.
                            ;; -- Cam
                            ;;
                            ;;
                            ;; 1 remap for source table orders.user-id => people.email
                            [:field (meta/id :people :email) {:join-alias "PEOPLE__via__USER_ID", ::qp.add-remaps/new-field-dimension-id pos-int?}]
                            ;; 1 remap for self-joined orders.user-id => people.email
                            [:field (meta/id :people :email) {:join-alias "j"}]]}
                  preprocessed-query)))))))

(deftest ^:parallel add-remaps-to-joins-e2e-test-2
  (testing "Should add remaps to join with :source-query"
    ;; see https://metaboat.slack.com/archives/C0645JP1W81/p1753208898063419 for further discussion
    (let [mp    (lib.tu/remap-metadata-provider
                 meta/metadata-provider
                 (meta/id :orders :user-id) (meta/id :people :email))
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query orders
                   {:joins [{:source-query {:source-table $$orders
                                            :order-by     [[:asc $id]]}
                             :alias        "j"
                             :condition    [:= $id &j.orders.product-id]
                             :fields       :all}]}))]
      (is (=? {:query {:joins  [{:alias        "j"
                                 ;; join source query (i.e., first stage) should automatically get `:fields` which
                                 ;; should then get remaps
                                 :source-query {:source-table (meta/id :orders)
                                                :joins        [{:alias "PEOPLE__via__USER_ID"}]
                                                :order-by     [[:asc [:field (meta/id :orders :id) nil]]]
                                                ;; should have 10 fields -- 9 from ORDERS plus the remap of ORDERS.USER_ID => PEOPLE.EMAIL
                                                :fields       #(= (count %) 10)}
                                 ;; should forward the 10 fields from `:source-query` without adding any more.
                                 :fields       #(= (count %) 10)}
                                {:alias "PEOPLE__via__USER_ID"}]
                       :fields #(= (count %) 20)}}
              (-> query
                  qp.preprocess/preprocess
                  lib/->legacy-MBQL))))))

(deftest ^:parallel multiple-fk-remaps-test-in-joins-e2e-test
  (testing "Should be able to do multiple FK remaps via different FKs from Table A to Table B in a join"
    (let [mp    (-> meta/metadata-provider
                    (lib.tu/remap-metadata-provider (meta/id :venues :category-id)
                                                    (meta/id :categories :name))
                    (lib.tu/remap-metadata-provider (meta/id :venues :id)
                                                    (meta/id :categories :name))
                    ;; mock VENUES.ID being an FK to CATEGORIES.ID (required for implicit joins to work)
                    (lib.tu/merged-mock-metadata-provider
                     {:fields [{:id                 (meta/id :venues :id)
                                :fk-target-field-id (meta/id :categories :id)}]}))
          query (lib/query
                 mp
                 (lib.tu.macros/mbql-query venues
                   {:joins  [{:source-table $$venues
                              :alias        "J"
                              :condition    [:= "a" "a"]
                              :fields       :all}]
                    :fields [$category-id
                             $id
                             $name]}))]
      (is (=? {:query {:joins  [{:alias        "J"
                                 :source-query {:joins [{:alias "CATEGORIES__via__ID"}
                                                        {:alias "CATEGORIES__via__CATEGORY_ID"}]}
                                 :fields       [[:field (meta/id :venues :id)          {:join-alias "J"}]
                                                [:field (meta/id :venues :name)        {:join-alias "J"}]
                                                [:field (meta/id :venues :category-id) {:join-alias "J"}]
                                                [:field (meta/id :venues :latitude)    {:join-alias "J"}]
                                                [:field (meta/id :venues :longitude)   {:join-alias "J"}]
                                                [:field (meta/id :venues :price)       {:join-alias "J"}]
                                                ;; we shouldn't use IDs here because they would be ambiguous.
                                                [:field (meta/id :categories :name)    {:join-alias "J", :source-field (meta/id :venues :id)}]
                                                [:field (meta/id :categories :name)    {:join-alias "J", :source-field (meta/id :venues :category-id)}]]}
                                ;; these are in the opposite order as the join source query because `CATEGORY_ID`
                                ;; appears before `ID` here but the other way around above.
                                {:alias "CATEGORIES__via__CATEGORY_ID"}
                                {:alias "CATEGORIES__via__ID"}]
                       :fields [[:field (meta/id :venues :category-id) {}]
                                [:field (meta/id :venues :id)          {}]
                                [:field (meta/id :venues :name)        nil]
                                [:field (meta/id :venues :id)          {:join-alias "J"}]
                                [:field (meta/id :venues :name)        {:join-alias "J"}]
                                [:field (meta/id :venues :category-id) {:join-alias "J"}]
                                [:field (meta/id :venues :latitude)    {:join-alias "J"}]
                                [:field (meta/id :venues :longitude)   {:join-alias "J"}]
                                [:field (meta/id :venues :price)       {:join-alias "J"}]
                                [:field (meta/id :categories :name)    {:join-alias "CATEGORIES__via__CATEGORY_ID"}]
                                [:field (meta/id :categories :name)    {:join-alias "CATEGORIES__via__ID"}]
                                [:field (meta/id :categories :name)    {:join-alias "J", :source-field (meta/id :venues :id)}]
                                [:field (meta/id :categories :name)    {:join-alias "J", :source-field (meta/id :venues :category-id)}]]}}
              (-> query
                  qp.preprocess/preprocess
                  lib/->legacy-MBQL
                  (select-keys [:query])))))))

(deftest ^:parallel do-not-include-remaps-in-joins-for-columns-that-are-not-in-fields-e2e-test
  (testing "Do not include remaps in joins for columns that are not in :fields (#63165)"
    (let [mp    (-> meta/metadata-provider
                    (lib.tu/remap-metadata-provider (meta/id :orders :product-id) (meta/id :products :title)))
          query (-> (lib/query mp (meta/table-metadata :people))
                    (lib/with-fields [(meta/field-metadata :people :id)])
                    (lib/join (-> (lib/join-clause (meta/table-metadata :orders))
                                  (lib/with-join-fields [(meta/field-metadata :orders :id)]))))]
      (testing `lib/returned-columns
        (binding [lib.metadata.calculation/*display-name-style* :long]
          (testing "remapping disabled"
            (is (= ["ID"
                    "Orders → ID"]
                   (map :display-name (lib/returned-columns query -1 -1)))))
          (testing "remapping enabled: should return the same columns"
            (is (= ["ID"
                    "Orders → ID"]
                   (map :display-name (lib/returned-columns query -1 -1 {:include-remaps? true})))))))
      (testing `qp.preprocess/preprocess
        (is (=? {:fields [[:field {} (meta/id :people :id)]
                          [:field {:join-alias "Orders"} (meta/id :orders :id)]]
                 :joins  [{:alias  "Orders"
                           :fields [[:field {:join-alias "Orders"} (meta/id :orders :id)]]
                           :stages [{:joins  (symbol "nil #_\"key is not present.\"")
                                     :fields [[:field {} (meta/id :orders :id)]
                                              [:field {} (meta/id :orders :user-id)]
                                              [:field {} (meta/id :orders :product-id)]
                                              [:field {} (meta/id :orders :subtotal)]
                                              [:field {} (meta/id :orders :tax)]
                                              [:field {} (meta/id :orders :total)]
                                              [:field {} (meta/id :orders :discount)]
                                              [:field {} (meta/id :orders :created-at)]
                                              [:field {} (meta/id :orders :quantity)]]}]}]}
                (-> (qp.preprocess/preprocess query) :stages first))))
      (testing `qp.preprocess/query->expected-cols
        (is (= ["ID"
                "Orders → ID"]
               (map :display_name (qp.preprocess/query->expected-cols query))))))))
