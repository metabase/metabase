(ns ^:mb/driver-tests metabase.query-processor.remapping-test
  "Tests for the remapping results"
  (:require
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util :as lib.tu]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.add-remaps :as qp.add-remaps]
   [metabase.query-processor.pivot :as qp.pivot]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.test-util :as qp.test-util]
   [metabase.test :as mt]
   [metabase.test.data.dataset-definitions :as defs]
   [metabase.util.date-2 :as u.date]))

(deftest ^:parallel basic-internal-remapping-test
  (mt/test-drivers (mt/normal-drivers)
    (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                         (lib.tu/remap-metadata-provider
                                          (mt/id :venues :category_id)
                                          (qp.test-util/field-values-from-def defs/test-data "categories" "name")))
      (is (=? {:rows [["20th Century Cafe"               12 "Café"]
                      ["25°"                             11 "Burger"]
                      ["33 Taps"                          7 "Bar"]
                      ["800 Degrees Neapolitan Pizzeria" 58 "Pizza"]]
               :cols [(mt/col :venues :name)
                      (assoc (mt/col :venues :category_id)
                             :remapped_to "Category ID [internal remap]")
                      (#'qp.add-remaps/create-remapped-col
                       "Category ID [internal remap]"
                       (mt/format-name "category_id")
                       :type/Text)]}
              (qp.test-util/rows-and-cols
               (mt/format-rows-by
                [str int str]
                (mt/run-mbql-query venues
                  {:fields   [$name $category_id]
                   :order-by [[:asc $name]]
                   :limit    4}))))))))

(deftest ^:parallel basic-external-remapping-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                         (lib.tu/remap-metadata-provider (mt/id :venues :category_id)
                                                                         (mt/id :categories :name)))
      (is (=? {:rows [["American" 2 8]
                      ["Artisan"  3 2]
                      ["Asian"    4 2]]
               :cols [(merge (mt/col :categories :name)
                             {:display_name  "Category ID [external remap]"
                              :options       {::qp.add-remaps/new-field-dimension-id integer?}
                              :remapped_from (mt/format-name "category_id")
                              :field_ref     [:field
                                              (mt/id :categories :name)
                                              {:source-field (mt/id :venues :category_id)}]
                              :fk_field_id   (mt/id :venues :category_id)
                              :source        :breakout})
                      (merge (mt/col :venues :category_id)
                             {:options     {::qp.add-remaps/original-field-dimension-id integer?}
                              :remapped_to (mt/format-name "name")
                              :source      :breakout})
                      {:field_ref     [:aggregation 0]
                       :source        :aggregation
                       :display_name  "Count"
                       :name          "count"
                       :semantic_type :type/Quantity}]}
              (qp.test-util/rows-and-cols
               (mt/format-rows-by
                [str int int]
                (mt/run-mbql-query venues
                  {:aggregation [[:count]]
                   :breakout    [$category_id]
                   :limit       3}))))))))

(deftest ^:parallel nested-remapping-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries)
    (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                         (lib.tu/remap-metadata-provider
                                          (mt/id :venues :category_id)
                                          (qp.test-util/field-values-from-def defs/test-data "categories" "name")))
      (is (=? {:rows [["20th Century Cafe"               12 "Café"]
                      ["25°"                             11 "Burger"]
                      ["33 Taps"                          7 "Bar"]
                      ["800 Degrees Neapolitan Pizzeria" 58 "Pizza"]]
               :cols [(mt/col :venues :name)
                      (-> (mt/col :venues :category_id)
                          (assoc :remapped_to "Category ID [internal remap]"))
                      (#'qp.add-remaps/create-remapped-col
                       "Category ID [internal remap]"
                       (mt/format-name "category_id")
                       :type/Text)]}
              (->> (mt/run-mbql-query venues
                     {:source-query {:source-table (mt/id :venues)
                                     :fields       [[:field (mt/id :venues :name) nil]
                                                    [:field (mt/id :venues :category_id) nil]]
                                     :order-by     [[:asc [:field (mt/id :venues :name) nil]]]
                                     :limit        4}})
                   (mt/format-rows-by
                    [str int str])
                   qp.test-util/rows-and-cols))))))

(defn- select-columns
  "Focuses the given resultset to columns that return true when passed to `columns-pred`. Typically this would be done
  as part of the query, however there's a bug currently preventing that from working when remapped. This allows the
  data compared to be smaller and avoid that bug."
  [columns-pred results]
  (let [results-data (qp.test-util/data results)
        col-indexes  (keep-indexed (fn [idx col]
                                     (when (columns-pred (:name col))
                                       idx))
                                   (:cols results-data))]
    {:rows (for [row (:rows results-data)]
             (mapv (vec row) col-indexes))
     :cols (for [col   (:cols results-data)
                 :when (columns-pred (:name col))]
             col)}))

(deftest ^:parallel foreign-keys-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                         (lib.tu/remap-metadata-provider (mt/id :venues :category_id)
                                                                         (mt/id :categories :name)))
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
               (mt/formatted-rows
                [str int str]
                results)))))))

(deftest ^:parallel remappings-with-field-clause-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
    (testing (str "Check that we can have remappings when we include a `:fields` clause that restricts the query "
                  "fields returned")
      (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                           (lib.tu/remap-metadata-provider (mt/id :venues :category_id)
                                                                           (mt/id :categories :name)))
        (is (=? {:rows [["20th Century Cafe"               2 "Café"]
                        ["25°"                             2 "Burger"]
                        ["33 Taps"                         2 "Bar"]
                        ["800 Degrees Neapolitan Pizzeria" 2 "Pizza"]]
                 :cols [(mt/col :venues :name)
                        (mt/col :venues :price)
                        (mt/$ids venues
                          (assoc (mt/col :categories :name)
                                 :fk_field_id   %category_id
                                 :display_name  "Category ID [external remap]"
                                 :options       {::qp.add-remaps/new-field-dimension-id integer?}
                                 :name          (mt/format-name "name_2")
                                 :remapped_from (mt/format-name "category_id")
                                 :field_ref     $category_id->categories.name))]}
                (select-columns (set (map mt/format-name ["name" "price" "name_2"]))
                                (mt/format-rows-by
                                 [str int str str]
                                 (mt/run-mbql-query venues
                                   {:fields   [$name $price $category_id]
                                    :order-by [[:asc $name]]
                                    :limit    4})))))))))

(deftest ^:parallel remap-inside-mbql-query-test
  (testing "Test that we can remap inside an MBQL query"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join :nested-queries)
      (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                           (lib.tu/remap-metadata-provider (mt/id :checkins :venue_id)
                                                                           (mt/id :venues :name)))
        (is (= ["Kinaree Thai Bistro" "Ruen Pair Thai Restaurant" "Yamashiro Hollywood" "Spitz Eagle Rock" "The Gumbo Pot"]
               (->> (mt/run-mbql-query checkins
                      {:order-by [[:asc $date]]
                       :limit    5})
                    mt/rows
                    (map last))))))))

(deftest ^:parallel remapping-with-conflicting-names-test
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join :nested-queries)
    (testing (str "Test a remapping with conflicting names, in the case below there are two name fields, one from "
                  "Venues and the other from Categories")
      (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                           (lib.tu/remap-metadata-provider (mt/id :venues :category_id)
                                                                           (mt/id :categories :name)))
        (is (= ["20th Century Cafe" "25°" "33 Taps" "800 Degrees Neapolitan Pizzeria"]
               (->> (mt/rows
                     (mt/run-mbql-query venues
                       {:order-by [[:asc $name]], :limit 4}))
                    (map second))))))))

(defmethod driver/database-supports? [::driver/driver ::self-referencing-fks]
  [_driver _feature _database]
  true)

;;; Having a self-referencing FK is currently broken with the Redshift and Oracle backends. The issue related to fix
;;; this is https://github.com/metabase/metabase/issues/8510
(doseq [driver [:redshift :oracle :vertica]]
  (defmethod driver/database-supports? [driver ::self-referencing-fks]
    [_driver _feature _database]
    false))

(deftest ^:parallel self-referencing-test
  ;; Test out a self referencing column. This has a users table like the one that is in `test-data`, but also includes a
  ;; `created_by` column which references the PK column in that same table. This tests that remapping table aliases are
  ;; handled correctly
  (mt/test-drivers (mt/normal-drivers-with-feature :left-join ::self-referencing-fks)
    (mt/dataset test-data-self-referencing-user
      (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                           (lib.tu/remap-metadata-provider (mt/id :users :created_by)
                                                                           (mt/id :users :name))
                                           ;; simulate this being a real FK so implicit joins work
                                           (lib.tu/merged-mock-metadata-provider
                                            {:fields [{:id                 (mt/id :users :created_by)
                                                       :fk-target-field-id (mt/id :users :id)}]}))
        (let [results (mt/run-mbql-query users
                        {:order-by [[:asc $name]]
                         :limit    4})]
          (when (= driver/*driver* :h2)
            (is (= ["ID"
                    "NAME"
                    "LAST_LOGIN"
                    "CREATED_BY"
                    "USERS__via__CREATED_BY__NAME"] ; <- remapped column
                   (map :lib/desired-column-alias (mt/cols results)))))
          (is (= [[14 "Broen Olujimi"       "2014-10-03T13:45:00Z" 13 "Dwight Gresham"]
                  [7  "Conchúr Tihomir"     "2014-08-02T09:30:00Z" 6  "Shad Ferdynand"]
                  [13 "Dwight Gresham"      "2014-08-01T10:30:00Z" 12 "Kfir Caj"]
                  [2  "Felipinho Asklepios" "2014-12-05T15:15:00Z" 1  "Plato Yeshua"]]
                 (mt/rows results))))))))

(defn- remappings-with-metadata
  [metadata]
  (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                       (lib.tu/remap-metadata-provider (mt/id :orders :product_id)
                                                                       (mt/id :products :title)))
    (mt/rows
     (mt/run-mbql-query nil
       {:source-query    {:native "SELECT * FROM ORDERS WHERE USER_ID = 1 AND TOTAL > 10 ORDER BY ID ASC LIMIT 2;"}
        :source-metadata metadata}))))

(deftest ^:parallel native-query-remapping-test
  (testing "Remapping should work for native queries"
    (mt/dataset test-data
      (testing "With the metadata from an MBQL query"
        (let [metadata (get-in (qp/process-query (mt/mbql-query orders))
                               [:data :results_metadata :columns])]
          (is (seq metadata))
          (is (= [[1 1  14 37.65  2.07  39.72 nil "2019-02-11T21:40:27.892Z" 2 "Awesome Concrete Shoes"]
                  [2 1 123 110.93  6.1 117.03 nil  "2018-05-15T08:04:04.58Z" 3 "Mediocre Wooden Bench"]]
                 (remappings-with-metadata metadata))))))))
        ;; doesn't currently work with any other metadata.

(deftest remappings-with-implicit-joins-test
  (mt/with-temporary-setting-values [report-timezone "UTC"]
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join :nested-queries)
      (testing "Queries with implicit joins should still work when FK remaps are used (#13641)"
        (mt/dataset test-data
          (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                               (lib.tu/remap-metadata-provider (mt/id :orders :product_id)
                                                                               (mt/id :products :title)))
            (let [query (mt/mbql-query orders
                          {:source-query {:source-table $$orders
                                          :filter       [:= $user_id 1]}
                           :filter       [:= $product_id->products.category "Doohickey"]
                           :order-by     [[:asc $id] [:asc $product_id->products.category]]
                           :limit        1})]
              (mt/with-native-query-testing-context query
                (is (= [[6 1 60 29.8 1.64 31.44 nil "2019-11-06T16:38:50Z" 3 "Rustic Paper Car"]]
                       (mt/formatted-rows
                        [int int int 2.0 2.0 2.0 identity u.date/temporal-str->iso8601-str int str]
                        (qp/process-query query))))))))))))

(deftest ^:parallel multiple-fk-remaps-test
  (testing "Should be able to do multiple FK remaps via different FKs from Table A to Table B (#9236)"
    (mt/dataset avian-singles
      (let [query (mt/mbql-query messages
                    {:fields   [$id $sender_id $receiver_id $text]
                     :order-by [[:asc $id]]
                     :limit    3})]
        (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                             (lib.tu/remap-metadata-provider (mt/id :messages :sender_id)
                                                                             (mt/id :users :name)
                                                                             (mt/id :messages :receiver_id)
                                                                             (mt/id :users :name)))
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

(defmethod driver/database-supports? [::driver/driver ::remapped-columns-in-joined-source-queries-test]
  [_driver _feature _database]
  true)

;;; mongodb doesn't support foreign keys required by this test
(defmethod driver/database-supports? [:mongo ::remapped-columns-in-joined-source-queries-test]
  [_driver _feature _database]
  false)

;;; see also [[metabase.lib.field-test/remapped-columns-in-joined-source-queries-display-names-test]]
(deftest ^:parallel remapped-columns-in-joined-source-queries-test
  (mt/test-drivers (mt/normal-drivers-with-feature :nested-queries :left-join ::remapped-columns-in-joined-source-queries-test)
    (testing "Remapped columns in joined source queries should work (#15578)"
      (mt/dataset test-data
        (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                             qp.test-util/mock-fks-application-database-metadata-provider
                                             (lib.tu/remap-metadata-provider (mt/id :orders :product_id) (mt/id :products :title)))
          (let [query (mt/mbql-query products
                        {:joins    [{:source-query {:source-table $$orders
                                                    :breakout     [$orders.product_id]
                                                    :aggregation  [[:sum $orders.quantity]]}
                                     :alias        "Orders"
                                     :condition    [:= $id &Orders.orders.product_id]
                                     ;; we can get products.title since orders.product_id is remapped to title
                                     :fields       [[:field %products.title {:source-field (mt/id :orders :product_id), :join-alias "Orders"}]
                                                    &Orders.*sum/Integer]}]
                         :fields   [$title $category]
                         :order-by [[:asc $id]]
                         :limit    3})]
            (is (= ["Title"                     ; products.title
                    "Category"                  ; products.category
                    ;; when generating the display name for Product ID -> Orders Title we take the name of the FK
                    ;; column and strip off ID (`Product`) which results in `Product → Title`.
                    "Product → Title"           ; product.title, remapped from orders.product_id
                    "Orders → Sum of Quantity"] ; sum(orders.quantity)
                   (map :display_name (qp.preprocess/query->expected-cols query))))
            (mt/with-native-query-testing-context query
              (let [results (qp/process-query query)]
                (when (= driver/*driver* :h2)
                  (testing "Metadata"
                    (is (= [["TITLE"    nil      "Title"]                     ; products.title
                            ["CATEGORY" nil      "Category"]                  ; products.category
                            ["TITLE_2"  "Orders" "Product → Title"]           ; product.title, remapped from orders.product_id
                            ["sum"      "Orders" "Orders → Sum of Quantity"]] ; sum(orders.quantity)
                           (map (juxt :name :metabase.lib.join/join-alias :display_name) (mt/cols results))))))
                (is (= [["Rustic Paper Wallet"       "Gizmo"     "Rustic Paper Wallet"       347]
                        ["Small Marble Shoes"        "Doohickey" "Small Marble Shoes"        352]
                        ["Synergistic Granite Chair" "Doohickey" "Synergistic Granite Chair" 286]]
                       (mt/formatted-rows
                        [str str str int]
                        results)))))))))))

(deftest ^:parallel inception-style-nested-query-with-joins-test
  (testing "source query > source query > query with join (with remappings) should work (#14724)"
    ;; this error only seems to be triggered when actually using Cards as sources (and include the source metadata)
    (mt/dataset test-data
      ;; this is only triggered when using the results metadata from the Card itself --  see #19895
      (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                           (lib.tu/remap-metadata-provider (mt/id :orders :product_id)
                                                                           (mt/id :products :title))
                                           (qp.test-util/metadata-provider-with-cards-with-metadata-for-queries
                                            [(mt/mbql-query orders
                                               {:fields   [$id $product_id]
                                                :joins    [{:source-table $$products
                                                            :alias        "Products"
                                                            :condition    [:= $product_id &Products.products.id]
                                                            :fields       [&Products.products.title]}]
                                                :order-by [[:asc $id]]
                                                :limit    3})
                                             (mt/mbql-query nil {:source-table "card__1"})
                                             (mt/mbql-query nil {:source-table "card__2"})]))
        (let [q3 (:dataset-query (lib.metadata/card (qp.store/metadata-provider) 3))]
          (mt/with-native-query-testing-context q3
            (is (= [[1  14 "Awesome Concrete Shoes" "Awesome Concrete Shoes"]
                    [2 123 "Mediocre Wooden Bench"  "Mediocre Wooden Bench"]
                    [3 105 "Fantastic Wool Shirt"   "Fantastic Wool Shirt"]]
                   (mt/rows (qp/process-query q3))))))))))

(deftest ^:parallel remapped-breakout-test
  (testing "remapped columns should be accounted for in the result rows (#46919)"
    (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                         (lib.tu/remap-metadata-provider (mt/id :orders :product_id)
                                                                         (mt/id :products :title)))
      (let [query (mt/mbql-query orders
                    {:aggregation [[:sum [:field (mt/id :orders :total)]]]
                     :breakout    [[:field
                                    (mt/id :orders :product_id)
                                    {:base-type    :type/Integer}]]
                     :limit       3})]
        (is (= [["Aerodynamic Bronze Hat"     144    5753.63]
                ["Aerodynamic Concrete Bench" 116   10035.81]
                ["Aerodynamic Concrete Lamp"  197    6478.65]]
               (mt/formatted-rows [str int 2.0]
                                  (qp/process-query query))))))))

(deftest ^:parallel pivot-with-remapped-breakout
  (testing "remapped columns should be accounted for in the result rows (#46919)"
    (qp.store/with-metadata-provider (-> (mt/metadata-provider)
                                         (lib.tu/remap-metadata-provider (mt/id :orders :product_id)
                                                                         (mt/id :products :title)))
      (let [query (merge (mt/mbql-query orders
                           {:aggregation [[:sum [:field (mt/id :orders :total)]]]
                            :breakout    [[:field
                                           (mt/id :orders :product_id)
                                           {:base-type    :type/Integer}]]
                            :limit       3})
                         {:pivot_rows [0]
                          :pivot_cols []})]
        (is (= [["Aerodynamic Bronze Hat"     144 0    5753.63]
                ["Aerodynamic Concrete Bench" 116 0   10035.81]
                ["Aerodynamic Concrete Lamp"  197 0    6478.65]
                [nil                          nil 1 1510617.7]]
               (mt/formatted-rows [str int int 2.0]
                                  (qp.pivot/run-pivot-query query))))))))

(deftest ^:parallel multiple-fk-remaps-test-in-joins-e2e-test
  (testing "Should be able to do multiple FK remaps via different FKs from Table A to Table B in a join"
    (let [mp    (-> (mt/metadata-provider)
                    (lib.tu/remap-metadata-provider (mt/id :venues :category_id)
                                                    (mt/id :categories :name))
                    (lib.tu/remap-metadata-provider (mt/id :venues :id)
                                                    (mt/id :categories :name))
                    ;; mock VENUES.ID being an FK to CATEGORIES.ID (required for implicit joins to work)
                    (lib.tu/merged-mock-metadata-provider
                     {:fields [{:id                 (mt/id :venues :id)
                                :fk-target-field-id (mt/id :categories :id)}]}))
          query (lib/query
                 mp
                 (mt/mbql-query venues
                   {:joins    [{:source-table $$venues
                                :alias        "J"
                                :condition    [:= $id [:+ &J.id 1]]
                                :fields       :all}]
                    :fields   [$category_id
                               $id
                               $name]
                    :order-by [[:asc $id]
                               [:asc [:field %id {:join-alias "J"}]]]
                    :filter   [:between $id 2 75]
                    :limit    3}))
          results (qp/process-query query)]
      (is (= [;; 3 columns from top-level `:fields`
              "CATEGORY_ID"
              "ID"
              "NAME"
              ;; 6 columns from join against `VENUES`
              "J__ID"
              "J__NAME"
              "J__CATEGORY_ID"
              "J__LATITUDE"
              "J__LONGITUDE"
              "J__PRICE"
              ;;
              ;; The order of remaps is not important to the FE. If it changes in the future that is ok.
              ;;
              ;; 2 remaps for the top-level query
              "CATEGORIES__via__CATEGORY_ID__NAME"
              "CATEGORIES__via__ID__NAME"
              ;; 2 remaps from the join against `VENUES`
              "J__CATEGORIES__via__ID__NAME"
              "J__CATEGORIES__via__CATEGORY_ID__NAME"]
             (map :lib/desired-column-alias (mt/cols results))))
      ;; The extra incorrect duplicate column seems to be sorta indetermiate? I've seen it match the value of
      ;; `J__CATEGORIES__via__ID__NAME` and `J__CATEGORIES__via__CATEGORY_ID__NAME` in different test runs and I'm not
      ;; sure why. Not bothering to debug since it's not even supposed to be returned anyway.
      ;;
      ;;      <top-level :fields>          <join>                                            <fields remaps>     <join remaps>
      (is (=? [[11 2 "Stout Burgers & Beers" 1 "Red Medicine"          4  10.0646 -165.374 3 "Burger" "American" "African"  "Asian"]
               [11 3 "The Apple Pan"         2 "Stout Burgers & Beers" 11 34.0996 -118.329 2 "Burger" "Artisan"  "American" "Burger"]
               [29 4 "Wurstküche"            3 "The Apple Pan"         11 34.0406 -118.428 2 "German" "Asian"    "Artisan"  "Burger"]]
              (mt/rows results))))))

(deftest ^:parallel explicit-join-with-fields-and-implicitly-joined-remaps-test
  (testing "#62591"
    (let [query (let [mp (-> (mt/metadata-provider)
                             (lib.tu/remap-metadata-provider
                              (mt/id :orders :user_id)    (mt/id :people :name)
                              (mt/id :orders :product_id) (mt/id :products :title)))]
                  (-> (lib/query mp (lib.metadata/table mp (mt/id :people)))
                      (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :orders)))
                                    (lib/with-join-alias "Orders")))
                      (lib/remove-field -1 (-> (lib.metadata/field mp (mt/id :orders :id))
                                               (lib/with-join-alias "Orders")))
                      (lib/order-by (lib.metadata/field mp (mt/id :people :id)))
                      (lib/limit 2)))]
      (is (=? {:stages [{:joins [{:alias      "Orders"
                                  :stages     [{:source-table (mt/id :orders)}]
                                  :fields     [[:field {:join-alias "Orders"} (mt/id :orders :user_id)]
                                               [:field {:join-alias "Orders"} (mt/id :orders :product_id)]
                                               [:field {:join-alias "Orders"} (mt/id :orders :subtotal)]
                                               [:field {:join-alias "Orders"} (mt/id :orders :tax)]
                                               [:field {:join-alias "Orders"} (mt/id :orders :total)]
                                               [:field {:join-alias "Orders"} (mt/id :orders :discount)]
                                               [:field {:join-alias "Orders"} (mt/id :orders :created_at)]
                                               [:field {:join-alias "Orders"} (mt/id :orders :quantity)]]
                                  :conditions [[:= {}
                                                [:field {} (mt/id :people :id)]
                                                [:field {:join-alias "Orders"} (mt/id :orders :user_id)]]]}]}]}
              query))
      (doseq [f [#'lib/returned-columns
                 #'qp.preprocess/query->expected-cols]]
        (testing f
          (is (= (concat
                  ["ID"
                   "ADDRESS"
                   "EMAIL"
                   "PASSWORD"
                   "NAME"
                   "CITY"
                   "LONGITUDE"
                   "STATE"
                   "SOURCE"
                   "BIRTH_DATE"
                   "ZIP"
                   "LATITUDE"
                   "CREATED_AT"
                   "Orders__USER_ID"
                   "Orders__PRODUCT_ID"
                   "Orders__SUBTOTAL"
                   "Orders__TAX"
                   "Orders__TOTAL"
                   "Orders__DISCOUNT"
                   "Orders__CREATED_AT"
                   "Orders__QUANTITY"]
                  (condp = f
                    #'lib/returned-columns
                    ["Orders__NAME"
                     "Orders__TITLE"]

                    #'qp.preprocess/query->expected-cols
                    ["Orders__PEOPLE__via__USER_ID__NAME"
                     "Orders__PRODUCTS__via__PRODUCT_ID__TITLE"]))
                 (map :lib/desired-column-alias
                      (condp = f
                        #'lib/returned-columns
                        (lib/returned-columns query -1 -1 {:include-remaps? true})

                        #'qp.preprocess/query->expected-cols
                        (qp.preprocess/query->expected-cols query)))))))
      (mt/with-native-query-testing-context query
        (is (= [[1 "9611-9809 West Rosedale Road" "borer-hudson@yahoo.com" "ccca881f-3e4b-4e5c-8336-354103604af6"
                 "Hudson Borer" "Wood River" -98.53 "NE" "Twitter" "1986-12-12T00:00:00Z" "68883" 40.71 "2017-10-07T01:34:35.462Z"
                 1 14 37.65 2.07 39.72 nil "2019-02-11T21:40:27.892Z" 2 "Hudson Borer" "Awesome Concrete Shoes"]
                [1 "9611-9809 West Rosedale Road" "borer-hudson@yahoo.com" "ccca881f-3e4b-4e5c-8336-354103604af6"
                 "Hudson Borer" "Wood River" -98.53 "NE" "Twitter" "1986-12-12T00:00:00Z" "68883" 40.71 "2017-10-07T01:34:35.462Z"
                 1 123 110.93 6.1 117.03 nil "2018-05-15T08:04:04.58Z" 3 "Hudson Borer" "Mediocre Wooden Bench"]]
               (mt/formatted-rows [int str str str str str 2.0 str str str str 2.0 str
                                   int int 2.0 2.0 2.0 2.0 str int str str]
                                  (qp/process-query query))))))))

(deftest ^:parallel fk-remapped-should-remap-test
  (testing (format "Check that we return the title when it's remapped")
    (let [mp (-> (mt/metadata-provider)
                 (lib.tu/remap-metadata-provider (mt/id :orders :product_id)
                                                 (mt/id :products :title)))
          query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                    (lib/limit 1))]
      ;; make sure the title is returned
      (is (string? (last (first (mt/rows (qp/process-query query)))))))))

(deftest ^:parallel fk-excluded-should-not-break-test
  (doseq [field [:id :title]
          vis   [:sensitive :retired]]
    (testing (format "Check that we don't error when product %s is %s (#64050)" (name field) (name vis))
      (let [mp (-> (mt/metadata-provider)
                   (lib.tu/remap-metadata-provider (mt/id :orders :product_id)
                                                   (mt/id :products :title))
                   (lib.tu/merged-mock-metadata-provider
                    {:fields [{:id (mt/id :products field)
                               :visibility-type vis}]}))
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                      (lib/limit 1))]
        (is (seq (mt/rows (qp/process-query query))))))))

(deftest ^:parallel fk-do-not-include-should-not-break-nested-test
  (doseq [field [:id :title]
          vis   [:sensitive :retired]]
    (testing (format "Check that we don't error when product %s is %s in nested query (#64050)" (name field) (name vis))
      (let [mp (-> (mt/metadata-provider)
                   (lib.tu/remap-metadata-provider (mt/id :orders :product_id)
                                                   (mt/id :products :title))
                   (lib.tu/merged-mock-metadata-provider
                    {:fields [{:id (mt/id :products field)
                               :visibility-type vis}]}))
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :orders)))
                      (lib/limit 1))
            mp (lib.tu/mock-metadata-provider mp {:cards
                                                  [{:id              1
                                                    :name            "ORDERS"
                                                    :database-id     (mt/id)
                                                    :dataset-query   query
                                                    :type :model}]})
            q2 (-> (lib/query mp (lib.metadata/card mp 1))
                   (lib/limit 1))]
        (is (seq (mt/rows (qp/process-query q2))))))))
