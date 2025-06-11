(ns ^:mb/driver-tests metabase.query-processor.middleware.annotate-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(mu/defn- add-column-info
  ([query metadata]
   (add-column-info query metadata []))

  ([query    :- :map
    metadata :- ::annotate/metadata
    rows     :- [:maybe [:sequential [:sequential :any]]]]
   (letfn [(rff [metadata]
             (fn rf
               ([]
                {:data metadata})
               ([results]
                (:data results))
               ([results row]
                (update-in results [:data :rows] (fn [rows]
                                                   (conj (or rows []) row))))))]
     (driver/with-driver :h2
       (let [rff' (annotate/add-column-info query rff)
             rf   (rff' metadata)]
         (transduce identity rf rows))))))

(deftest ^:parallel native-column-info-test
  (testing "native column info"
    (testing "should still infer types even if the initial value(s) are `nil` (#4256, #6924)"
      (is (= [:type/Integer]
             (transduce identity (#'annotate/base-type-inferer {:cols [{}]})
                        (concat (repeat 1000 [nil]) [[1] [2]])))))))

(deftest ^:parallel native-column-info-test-2
  (testing "native column info"
    (testing "should use default `base_type` of `type/*` if there are no non-nil values in the sample"
      (is (= [:type/*]
             (transduce identity (#'annotate/base-type-inferer {:cols [{}]})
                        [[nil]]))))))

(deftest ^:parallel native-column-info-test-3
  (testing "native column info"
    (testing "should attempt to infer better base type if driver returns :type/* (#12150)"
      ;; `merged-column-info` handles merging info returned by driver & inferred by annotate
      (is (= [:type/Integer]
             (transduce identity (#'annotate/base-type-inferer {:cols [{:base_type :type/*}]})
                        [[1] [2] [nil] [3]]))))))

(defn- column-info [query {:keys [rows], :as metadata}]
  (let [metadata (cond-> metadata
                   (and (seq (:columns metadata))
                        (empty? (:cols metadata)))
                   (assoc :cols []))]
    (-> (add-column-info query (dissoc metadata :rows) rows)
        :cols)))

(deftest ^:parallel native-column-info-test-4
  (testing "native column info"
    (testing "should disambiguate duplicate names"
      (doseq [rows [[]
                    [[1 nil]]]]
        ;; should work with and without rows
        (testing (format "\nrows = %s" (pr-str rows))
          (is (=? [{:name         "a"
                    :display_name "a"
                    :base_type    :type/Integer
                    :source       :native
                    :field_ref    [:field "a" {:base-type :type/Integer}]}
                   {:name         "a_2"
                    :display_name "a"
                    :base_type    :type/Integer
                    :source       :native
                    :field_ref    [:field "a_2" {:base-type :type/Integer}]}]
                  (column-info
                   (lib/query meta/metadata-provider {:type :native})
                   {:cols [{:name "a" :base_type :type/Integer} {:name "a" :base_type :type/Integer}]
                    :rows rows}))))))))

(deftest ^:parallel native-column-type-inferrence-test
  (testing "native column info should be able to infer types from rows if not provided by driver initial metadata"
    (doseq [[expected-base-type rows] {:type/*       []
                                       :type/Integer [[1 nil]]}]
      ;; should work with and without rows
      (testing (format "\nrows = %s" (pr-str rows))
        (is (=? [{:name         "a"
                  :display_name "a"
                  :base_type    expected-base-type
                  :source       :native
                  :field_ref    [:field "a" {:base-type expected-base-type}]}
                 {:name         "a_2"
                  :display_name "a"
                  :base_type    :type/*
                  :source       :native
                  :field_ref    [:field "a_2" {:base-type :type/*}]}]
                (column-info
                 (lib/query meta/metadata-provider {:type :native})
                 {:cols [{:name "a"} {:name "a"}]
                  :rows rows})))))))

(deftest ^:parallel mbql-cols-nested-queries-test
  (testing "Should be able to infer MBQL columns with nested queries"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [base-query (qp.preprocess/preprocess
                        (lib.tu.macros/mbql-query venues
                          {:joins [{:fields       :all
                                    :source-table $$categories
                                    :condition    [:= $category-id &c.categories.id]
                                    :alias        "c"}]}))
            join-ident (get-in base-query [:query :joins 0 :ident])]
        (doseq [level [0 1 2 3]
                :let [field (fn [field-key legacy-ref]
                              (let [metadata (meta/field-metadata :venues field-key)]
                                (-> metadata
                                    (select-keys [:id :name :ident])
                                    (assoc :field_ref (if (zero? level)
                                                        legacy-ref
                                                        [:field (:name metadata) {:base-type (:base-type metadata)}])))))]]
          (testing (format "%d level(s) of nesting" level)
            (let [nested-query (lib/query
                                (qp.store/metadata-provider)
                                (mt/nest-query base-query level))]
              (is (= (lib.tu.macros/$ids venues
                       [(field :id          $id)
                        (field :name        $name)
                        (field :category-id $category-id)
                        (field :latitude    $latitude)
                        (field :longitude   $longitude)
                        (field :price       $price)
                        {:name      "ID_2"
                         :id        %categories.id
                         :ident     (lib/explicitly-joined-ident (meta/ident :categories :id) join-ident)
                         :field_ref (if (zero? level)
                                      &c.categories.id
                                      [:field "c__ID" {:base-type :type/BigInteger}])}
                        {:name      "NAME_2"
                         :id        %categories.name
                         :ident     (lib/explicitly-joined-ident (meta/ident :categories :name) join-ident)
                         :field_ref (if (zero? level)
                                      &c.categories.name
                                      [:field "c__NAME" {:base-type :type/Text}])}])
                     (map #(select-keys % [:name :id :field_ref :ident])
                          (:cols (add-column-info nested-query {:cols []}))))))))))))

(deftest ^:parallel mbql-cols-nested-queries-test-2
  (testing "Aggregated question with source is an aggregated models should infer display_name correctly (#23248)"
    (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                      meta/metadata-provider
                                      [(lib.tu.macros/mbql-query products
                                         {:aggregation
                                          [[:aggregation-options
                                            [:sum $price]
                                            {:name "sum"}]
                                           [:aggregation-options
                                            [:max $rating]
                                            {:name "max"}]]
                                          :breakout     [$category]
                                          :order-by     [[:asc $category]]})])
      (let [query (lib/query
                   (qp.store/metadata-provider)
                   (qp.preprocess/preprocess
                    (lib.tu.macros/mbql-query nil
                      {:source-table "card__1"
                       :aggregation  [[:aggregation-options
                                       [:sum
                                        [:field
                                         "sum"
                                         {:base-type :type/Float}]]
                                       {:name "sum"}]
                                      [:aggregation-options
                                       [:count]
                                       {:name "count"}]]
                       :limit        1})))]
        (is (= ["Sum of Sum of Price" "Count"]
               (->> (add-column-info query {:cols [{} {}]})
                    :cols
                    (map :display_name))))))))

(deftest ^:parallel inception-test
  (testing "Should return correct metadata for an 'inception-style' nesting of source > source > source with a join (#14745)"
    ;; these tests look at the metadata for just one column so it's easier to spot the differences.
    (letfn [(ean-metadata [result]
              (as-> (:cols result) result
                (m/index-by :name result)
                (get result "EAN")
                (select-keys result [:name :display_name :base_type :semantic_type :id :field_ref])))]
      (qp.store/with-metadata-provider meta/metadata-provider
        (testing "Make sure metadata is correct for the 'EAN' column with"
          (let [base-query (qp.preprocess/preprocess
                            (lib.tu.macros/mbql-query orders
                              {:joins [{:fields       :all
                                        :source-table $$products
                                        :condition    [:= $product-id &Products.products.id]
                                        :alias        "Products"}]
                               :limit 10}))]
            (doseq [level (range 4)]
              (testing (format "%d level(s) of nesting" level)
                (let [nested-query (lib/query
                                    meta/metadata-provider
                                    (mt/nest-query base-query level))]
                  (testing (format "\nQuery = %s" (u/pprint-to-str nested-query))
                    (is (= (lib.tu.macros/$ids products
                             {:name          "EAN"
                              :display_name  "Products → Ean"
                              :base_type     :type/Text
                              :semantic_type nil
                              :id            %ean
                              :field_ref     (if (zero? level)
                                               &Products.ean
                                               [:field "Products__EAN" {:base-type :type/Text}])})
                           (ean-metadata (add-column-info nested-query {:cols []}))))))))))))))

(deftest ^:parallel col-info-for-fields-from-card-test
  (testing "when a nested query is from a saved question, there should be no `:join-alias` on the left side (#14787)"
    (let [card-1-query (lib.tu.macros/mbql-query orders
                         {:joins [{:fields       :all
                                   :source-table $$products
                                   :condition    [:= $product-id &Products.products.id]
                                   :alias        "Products"}]})]
      (qp.store/with-metadata-provider (lib.tu/metadata-provider-with-cards-for-queries
                                        meta/metadata-provider
                                        [card-1-query
                                         (lib.tu.macros/mbql-query people)])
        (lib.tu.macros/$ids nil
          (let [base-query (lib/query
                            (qp.store/metadata-provider)
                            (qp.preprocess/preprocess
                             (lib.tu.macros/mbql-query nil
                               {:source-table "card__1"
                                :joins        [{:fields       :all
                                                :source-table "card__2"
                                                :condition    [:= $orders.user-id &Products.products.id]
                                                :alias        "Q"}]
                                :limit        1})))
                field-ids  #{%orders.discount %products.title %people.source}]
            (is (= [{:display_name "Discount"
                     :field_ref    [:field %orders.discount nil]}
                    {:display_name "Products → Title"
                     ;; this field comes from a join in the source card (previous stage) and thus SHOULD NOT include the
                     ;; join alias. TODO -- shouldn't we be referring to it by name and not ID? I think we're using ID
                     ;; for broken/legacy purposes -- Cam
                     :field_ref    [:field %products.title nil]}
                    {:display_name "Q → Source"
                     :field_ref    [:field %people.source {:join-alias "Q"}]}]
                   (->> (:cols (add-column-info base-query {:cols []}))
                        (filter #(field-ids (:id %)))
                        (map #(select-keys % [:display_name :field_ref])))))))))))

(deftest ^:parallel col-info-for-joined-fields-from-card-test
  (testing "Has the correct display names for joined fields from cards (#14787)"
    (letfn [(native [query] {:type     :native
                             :native   {:query query :template-tags {}}
                             :database (meta/id)})]
      (let [card1-eid (u/generate-nano-id)
            card2-eid (u/generate-nano-id)]
        (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                          meta/metadata-provider
                                          {:cards [{:id              1
                                                    :entity_id       card1-eid
                                                    :name            "Card 1"
                                                    :database-id     (meta/id)
                                                    :dataset-query   (native "select 'foo' as A_COLUMN")
                                                    :result-metadata [{:name         "A_COLUMN"
                                                                       :display_name "A Column"
                                                                       :base_type    :type/Text}]}
                                                   {:id              2
                                                    :entity_id       card2-eid
                                                    :name            "Card 2"
                                                    :database-id     (meta/id)
                                                    :dataset-query   (native "select 'foo' as B_COLUMN")
                                                    :result-metadata [{:name         "B_COLUMN"
                                                                       :display_name "B Column"
                                                                       :base_type    :type/Text}]}]})
          (let [query (lib.tu.macros/mbql-query nil
                        {:source-table "card__1"
                         :joins        [{:fields       "all"
                                         :source-table "card__2"
                                         :condition    [:=
                                                        [:field "A_COLUMN" {:base-type :type/Text}]
                                                        [:field "B_COLUMN" {:base-type  :type/Text
                                                                            :join-alias "alias"}]]
                                         :alias        "alias"}]})
                cols  (qp.preprocess/query->expected-cols query)]
            (is (=? [{}
                     {:display_name "alias → B Column"}]
                    cols)
                "cols has wrong display name")))))))

(deftest ^:parallel preserve-original-join-alias-e2e-test
  (testing "The join alias for the `:field_ref` in results metadata should match the one originally specified (#27464)"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
      (let [join-alias "Products with a very long name - Product ID with a very long name"
            results    (mt/run-mbql-query orders
                         {:joins  [{:source-table $$products
                                    :condition    [:= $product_id [:field %products.id {:join-alias join-alias}]]
                                    :alias        join-alias
                                    :fields       [[:field %products.title {:join-alias join-alias}]]}]
                          :fields [$orders.id
                                   [:field %products.title {:join-alias join-alias}]]
                          :limit  4})]
        (doseq [[location metadata] {"data.cols"                     (mt/cols results)
                                     "data.results_metadata.columns" (get-in results [:data :results_metadata :columns])}]
          (testing location
            (is (=? (mt/$ids
                      [{:display_name "ID"
                        :field_ref    $orders.id}
                       {:display_name (str join-alias " → Title")
                        :field_ref    [:field %products.title {:join-alias join-alias}]}])
                    (map
                     #(select-keys % [:display_name :field_ref])
                     metadata)))))))))
