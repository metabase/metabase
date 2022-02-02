(ns metabase.query-processor-test.remapping-test
  "Tests for the remapping results"
  (:require [clojure.test :refer :all]
            [metabase.models.card :refer [Card]]
            [metabase.models.dimension :refer [Dimension]]
            [metabase.models.field :refer [Field]]
            [metabase.query-processor :as qp]
            [metabase.query-processor-test :as qp.test]
            [metabase.query-processor.middleware.add-dimension-projections :as add-dimension-projections]
            [metabase.test :as mt]
            [toucan.db :as db]
            [metabase.driver :as driver]))

(deftest basic-internal-remapping-test
  (mt/test-drivers (mt/normal-drivers)
    (mt/with-column-remappings [venues.category_id (values-of categories.name)]
      (is (= {:rows [["20th Century Cafe"               12 "Café"]
                     ["25°"                             11 "Burger"]
                     ["33 Taps"                          7 "Bar"]
                     ["800 Degrees Neapolitan Pizzeria" 58 "Pizza"]]
              :cols [(mt/col :venues :name)
                     (assoc (mt/col :venues :category_id)
                            :remapped_to "Category ID [internal remap]")
                     (#'add-dimension-projections/create-remapped-col
                      "Category ID [internal remap]"
                      (mt/format-name "category_id")
                      :type/Text)]}
             (qp.test/rows-and-cols
              (mt/format-rows-by [str int str]
                (mt/run-mbql-query venues
                  {:fields   [$name $category_id]
                   :order-by [[:asc $name]]
                   :limit    4}))))))))

(deftest basic-external-remapping-test
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys)
    (mt/with-column-remappings [venues.category_id categories.name]
      (let [dimension-id (db/select-one-id Dimension :field_id (mt/id :venues :category_id))]
        (is (= {:rows [["American" 2 8]
                       ["Artisan"  3 2]
                       ["Asian"    4 2]]
                :cols [(merge (mt/col :categories :name)
                              {:display_name  "Category ID [external remap]"
                               :options       {::add-dimension-projections/new-field-dimension-id dimension-id}
                               :remapped_from (mt/format-name "category_id")
                               :field_ref     [:field
                                               (mt/id :categories :name)
                                               {:source-field (mt/id :venues :category_id)}]
                               :fk_field_id   (mt/id :venues :category_id)
                               :source        :breakout})
                       (merge (mt/col :venues :category_id)
                              {:options     {::add-dimension-projections/original-field-dimension-id dimension-id}
                               :remapped_to (mt/format-name "name")
                               :source      :breakout})
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
                                   [(dissoc c1 :source_alias) c2 (dissoc agg :base_type :effective_type)])))))))))

(deftest nested-remapping-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (mt/with-column-remappings [venues.category_id (values-of categories.name)]
      (is (= {:rows [["20th Century Cafe"               12 "Café"]
                     ["25°"                             11 "Burger"]
                     ["33 Taps"                          7 "Bar"]
                     ["800 Degrees Neapolitan Pizzeria" 58 "Pizza"]]
              :cols [(mt/col :venues :name)
                     (-> (mt/col :venues :category_id)
                         (assoc :remapped_to "Category ID [internal remap]"))
                     (#'add-dimension-projections/create-remapped-col
                      "Category ID [internal remap]"
                      (mt/format-name "category_id")
                      :type/Text)]}
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
      (let [query         (mt/mbql-query venues
                            {:fields   [$name $category_id]
                             :order-by [[:asc $name]]
                             :limit    4})
            results       (qp/process-query query)
            relevant-keys #(select-keys % [:name :display_name :fk_field_id :remapped_from :remapped_to])]
        (is (= (mt/$ids venues
                 [(relevant-keys (mt/col :venues :name))
                  (assoc (relevant-keys (mt/col :venues :category_id))
                         :remapped_to (mt/format-name "name_2"))
                  (assoc (relevant-keys (mt/col :categories :name))
                         :fk_field_id   %category_id
                         :display_name  "Category ID [external remap]"
                         :name          (mt/format-name "name_2")
                         :remapped_from (mt/format-name "category_id"))])
               (map relevant-keys (mt/cols results))))
        (is (= [["20th Century Cafe"               12 "Café"]
                ["25°"                             11 "Burger"]
                ["33 Taps"                          7 "Bar"]
                ["800 Degrees Neapolitan Pizzeria" 58 "Pizza"]]
               (mt/formatted-rows [str int str] results)))))))

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
                                :display_name  "Category ID [external remap]"
                                :options       {::add-dimension-projections/new-field-dimension-id
                                                (db/select-one-id Dimension :field_id (mt/id :venues :category_id))}
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
                (metabase.test/with-column-remappings [orders.product_id products.title]
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
  (mt/test-drivers (mt/normal-drivers-with-feature :foreign-keys :nested-queries)
    (testing "Queries with implicit joins should still work when FK remaps are used (#13641)"
      (mt/dataset sample-dataset
        (mt/with-column-remappings [orders.product_id products.title]
          (let [query (mt/mbql-query orders
                        {:source-query {:source-table $$orders
                                        :filter       [:= $user_id 1]}
                         :filter       [:= $product_id->products.category "Doohickey"]
                         :order-by     [[:asc $id] [:asc $product_id->products.category]]
                         :limit        1})]
            (mt/with-native-query-testing-context query
              (is (= [[6 1 60 29.8 1.64 31.44 nil "2019-11-06T16:38:50.134Z" 3 "Rustic Paper Car"]]
                     (mt/formatted-rows [int int int 2.0 2.0 2.0 identity str int str]
                       (qp/process-query query)))))))))))

(deftest multiple-fk-remaps-test
  (testing "Should be able to do multiple FK remaps via different FKs from Table A to Table B (#9236)"
    (mt/dataset avian-singles
      (let [query (mt/mbql-query messages
                    {:fields   [$id $sender_id $receiver_id $text]
                     :order-by [[:asc $id]]
                     :limit    3})]
        (mt/with-column-remappings [messages.sender_id   users.name
                                    messages.receiver_id users.name]
          (mt/with-native-query-testing-context query
            (let [results (qp/process-query query)]
              (is (= [{:display_name "ID",                           :name "ID"}
                      {:display_name "Sender ID",                    :name "SENDER_ID",   :remapped_to "NAME"}
                      {:display_name "Receiver ID",                  :name "RECEIVER_ID", :remapped_to "NAME_2"}
                      {:display_name "Text",                         :name "TEXT"}
                      {:display_name "Sender ID [external remap]",   :name "NAME",        :remapped_from "SENDER_ID"}
                      {:display_name "Receiver ID [external remap]", :name "NAME_2",      :remapped_from "RECEIVER_ID"}]
                     (map #(select-keys % [:display_name :name :remapped_from :remapped_to])
                          (mt/cols results))))
              (is (= [[1 8 7 "Coo"             "Annie Albatross" "Brenda Blackbird"]
                      [2 8 3 "Bip bip bip bip" "Annie Albatross" "Peter Pelican"]
                      [3 3 2 "Coo"             "Peter Pelican"   "Lucky Pigeon"]]
                     (mt/rows results))))))))))

(deftest remapped-columns-in-joined-source-queries-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join)
    (testing "Remapped columns in joined source queries should work (#15578)"
      (mt/dataset sample-dataset
        (mt/with-bigquery-fks #{:bigquery :bigquery-cloud-sdk}
          (mt/with-column-remappings [orders.product_id products.title]
            (let [query (mt/mbql-query products
                          {:joins    [{:source-query {:source-table $$orders}
                                       :alias        "Q1"
                                       :condition    [:= $id &Q1.orders.product_id]
                                       :fields       :all}]
                           :order-by [[:asc $id]
                                      [:asc &Q1.orders.id]]
                           :limit    2})]
              (mt/with-native-query-testing-context query
                (let [results (qp/process-query query)]
                  (when (= driver/*driver* :h2)
                    (testing "Metadata - :name"
                      (is (= ["ID"         ; 00 PRODUCTS.ID
                              "EAN"        ; 01 PRODUCTS.EAN
                              "TITLE"      ; 02 PRODUCTS.TITLE
                              "CATEGORY"   ; 03 PRODUCTS.CATEGORY
                              "VENDOR"     ; 04 PRODUCTS.VENDOR
                              "PRICE"      ; 05 PRODUCTS.PRICE
                              "RATING"     ; 06 PRODUCTS.RATING
                              "CREATED_AT" ; 07 PRODUCTS.CREATED_AT
                              ;; TODO -- I'm not 100% sure why the actual *REAL* names of the columns don't come back
                              ;; anywhere in the QP results metadata *at all* but these are the columns they correspond to
                              "ID_2"         ; 08 Q1__ID
                              "USER_ID"      ; 09 Q1__USER_ID
                              "PRODUCT_ID"   ; 10 Q1__PRODUCT_ID
                              "SUBTOTAL"     ; 11 Q1__SUBTOTAL
                              "TAX"          ; 12 Q1__TAX
                              "TOTAL"        ; 13 Q1__TOTAL
                              "DISCOUNT"     ; 14 Q1__DISCOUNT
                              "CREATED_AT_2" ; 15 Q1__CREATED_AT_2
                              "QUANTITY"     ; 16 Q1__QUANTITY
                              ;; TODO -- I think we're doing an extra join against Products to get Title. We really only
                              ;; need to do one. This is more titles than we need. At least the query works. Oh well :shrug:
                              "TITLE_2"      ; 17 PRODUCTS__via__PRODUCT_ID__TITLE
                              "TITLE_3"      ; 18 Q1__PRODUCTS__via__PRODUCT_ID__TITLE
                              ]
                             (map :name (mt/cols results)))))
                    (testing "Metadata - display name"
                      (is (= ["ID"
                              "Ean"
                              "Product ID"
                              "Category"
                              "Vendor"
                              "Price"
                              "Rating"
                              "Created At"
                              "Q1 → ID"
                              "Q1 → User ID"
                              "Q1 → Product ID"
                              "Q1 → Subtotal"
                              "Q1 → Tax"
                              "Q1 → Total"
                              "Q1 → Discount"
                              "Q1 → Created At"
                              "Q1 → Quantity"
                              "Product ID" ; I think these display names are intentional because the remapping is happening.
                              "Product ID"]
                             (map :display_name (mt/cols results)))))
                    ;; these results are clearly a LITTLE broken but I couldn't figure out how to get it working 100% so
                    ;; this will have to do for now until I revisit it.
                    (is (= {"TITLE"      {:remapped_from "PRODUCT_ID"}
                            "PRODUCT_ID" {:remapped_to "TITLE_3"}
                            "TITLE_2"    {:remapped_from "PRODUCT_ID"}
                            "TITLE_3"    {:remapped_from "PRODUCT_ID"}}
                           (into {}
                                 (comp (map (fn [col]
                                              (when-let [remaps (not-empty (select-keys col [:remapped_to :remapped_from]))]
                                                [(:name col) remaps])))
                                       (filter some?))
                                 (mt/cols results)))))
                  (is (= [[ ;; PRODUCTS
                           1 "1018947080336" "Rustic Paper Wallet" "Gizmo" "Swaniawski, Casper and Hilll"
                           29.46 4.6 "2017-07-19T19:44:56.582Z"
                           ;; Q1
                           448 61 1 29.46 1.4 30.86 nil "2016-12-25T22:19:38.656Z" 2
                           ;; Remaps
                           "Rustic Paper Wallet" "Rustic Paper Wallet"]
                          [ ;; PRODUCTS
                           1 "1018947080336" "Rustic Paper Wallet" "Gizmo" "Swaniawski, Casper and Hilll"
                           29.46 4.6 "2017-07-19T19:44:56.582Z"
                           ;; Q1
                           493 65 1 29.46 1.18 30.64 nil "2017-02-04T10:16:00.936Z" 1
                           ;; Remaps
                           "Rustic Paper Wallet" "Rustic Paper Wallet"]]
                         (mt/formatted-rows [int str str str str
                                             2.0 2.0 str
                                             int int int 2.0 2.0 2.0 identity str int
                                             str str]
                           results))))))))))))

(deftest inception-style-nested-query-with-joins-test
  (testing "source query > source query > query with join (with remappings) should work (#14724)"
    ;; this error only seems to be triggered when actually using Cards as sources (and include the source metadata)
    (mt/dataset sample-dataset
      (mt/with-column-remappings [orders.product_id products.title]
        ;; this is only triggered when using the results metadata from the Card itself --  see #19895
        (let [q1 (mt/mbql-query orders
                   {:fields   [$id $product_id]
                    :joins    [{:source-table $$products
                                :alias        "Products"
                                :condition    [:= $product_id &Products.products.id]
                                :fields       [$id
                                               &Products.products.title]}]
                    :order-by [[:asc $id]]
                    :limit    3})]
          (mt/with-temp Card [{card-1-id :id} {:dataset_query   q1
                                               :result_metadata (get-in (qp/process-query q1)
                                                                        [:data :results_metadata :columns])}]
            (let [q2 (mt/mbql-query nil {:source-table (format "card__%d" card-1-id)})]
              (mt/with-temp Card [{card-2-id :id} {:dataset_query   q2
                                                   :result_metadata (get-in (qp/process-query q2)
                                                                            [:data :results_metadata :columns])}]
                (let [q3 (mt/mbql-query nil {:source-table (format "card__%d" card-2-id)})]
                  (mt/with-native-query-testing-context q3
                    (is (= [[1  14 "Awesome Concrete Shoes" "Awesome Concrete Shoes"]
                            [2 123 "Mediocre Wooden Bench"  "Mediocre Wooden Bench"]
                            [3 105 "Fantastic Wool Shirt"   "Fantastic Wool Shirt"]]
                           (mt/rows (qp/process-query q3))))))))))))))
