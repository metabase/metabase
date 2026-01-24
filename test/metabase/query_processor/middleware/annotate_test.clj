(ns ^:mb/driver-tests metabase.query-processor.middleware.annotate-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.config.core :as config]
   [metabase.driver :as driver]
   [metabase.lib.core :as lib]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.query-processor.preprocess :as qp.preprocess]
   ^{:clj-kondo/ignore [:deprecated-namespace]} [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

(deftest ^:parallel needs-type-inference?-test
  (is (#'annotate/needs-type-inference?
       {:lib/type :mbql/query, :stages [{:lib/type :mbql.stage/native}]}
       {:cols [{:name "_id"} {:name "longitude"} {:name "category_id"} {:name "price"} {:name "name"} {:name "latitude"}]})))

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
                    [[1 nil]]]
              query [{:type :native, :native {:query "SELECT *"}}
                     {:type :query, :query {:source-query {:native "SELECT *"}}}]
              initial-base-type [:type/Integer
                                 :type/*]
              :let [expected-base-type-col-1 (if (or (= rows [[1 nil]])
                                                     (= initial-base-type :type/Integer))
                                               :type/Integer
                                               :type/*)
                    expected-base-type-col-2 (if (= initial-base-type :type/Integer)
                                               :type/Integer
                                               :type/*)]]
        ;; should work with and without rows
        (testing (format "\nrows = %s, query = %s, initial-base-type = %s" (pr-str rows) (pr-str query) initial-base-type)
          (is (=? [{:name           "a"
                    :display_name   "a"
                    :base_type      expected-base-type-col-1
                    :effective_type expected-base-type-col-1
                    :source         :native
                    :field_ref      [:field "a" {:base-type expected-base-type-col-1}]}
                   {:name           "a_2"
                    :display_name   "a"
                    :base_type      expected-base-type-col-2
                    :effective_type expected-base-type-col-2
                    :source         :native
                    :field_ref      [:field "a_2" {:base-type expected-base-type-col-2}]}]
                  (column-info
                   (lib/query meta/metadata-provider query)
                   {:cols [{:name "a" :base_type initial-base-type}
                           {:name "a" :base_type initial-base-type}]
                    :rows rows}))))))))

(deftest ^:parallel native-column-type-inference-test
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
                 (lib/query meta/metadata-provider {:type :native, :native {:query "SELECT 1;"}})
                 {:cols [{:name "a"} {:name "a"}]
                  :rows rows})))))))

(deftest ^:parallel mbql-cols-nested-queries-test
  (testing "Should be able to infer MBQL columns with nested queries"
    (qp.store/with-metadata-provider meta/metadata-provider
      (let [base-query (-> (lib.tu.macros/mbql-query venues
                             {:joins [{:fields       :all
                                       :source-table $$categories
                                       :condition    [:= $category-id &c.categories.id]
                                       :alias        "c"}]})
                           qp.preprocess/preprocess)]
        (doseq [level [0 1 2 3]
                :let [field (fn [field-key legacy-ref]
                              (let [metadata (meta/field-metadata :venues field-key)]
                                (-> metadata
                                    (select-keys [:id :name])
                                    (assoc :field_ref legacy-ref))))]]
          (testing (format "%d level(s) of nesting" level)
            (let [nested-query (nth (iterate lib/append-stage base-query) level)]
              (is (=? (lib.tu.macros/$ids venues
                        [(field :id          $id)
                         (field :name        $name)
                         (field :category-id $category-id)
                         (field :latitude    $latitude)
                         (field :longitude   $longitude)
                         (field :price       $price)
                         {:name      "ID_2"
                          :id        %categories.id
                          :field_ref &c.categories.id}
                         {:name      "NAME_2"
                          :id        %categories.name
                          :field_ref &c.categories.name}])
                      (map #(select-keys % [:name :id :field_ref])
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
      (let [query (qp.preprocess/preprocess
                   (lib/query
                    (qp.store/metadata-provider)
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
                            (lib/query
                             meta/metadata-provider
                             (lib.tu.macros/mbql-query orders
                               {:joins [{:fields       :all
                                         :source-table $$products
                                         :condition    [:= $product-id &Products.products.id]
                                         :alias        "Products"}]
                                :limit 10})))]
            (doseq [level (range 4)]
              (testing (format "%d level(s) of nesting" level)
                (let [nested-query (nth (iterate lib/append-stage base-query) level)]
                  (testing (format "\nQuery = %s" (u/pprint-to-str nested-query))
                    (is (= (lib.tu.macros/$ids products
                             {:name          "EAN"
                              :display_name  "Products → Ean"
                              :base_type     :type/Text
                              :id            %ean
                              :field_ref     &Products.ean})
                           (ean-metadata (add-column-info nested-query {:cols []}))))))))))))))

(deftest ^:parallel col-info-for-fields-from-card-test
  (testing "#14787"
    (let [card-1-query (lib.tu.macros/mbql-query orders
                         {:joins [{:fields       :all
                                   :source-table $$products
                                   :condition    [:= $product-id &Products.products.id]
                                   :alias        "Products"}]})
          mp (lib.tu/metadata-provider-with-cards-for-queries
              meta/metadata-provider
              [card-1-query
               (lib.tu.macros/mbql-query people)])]
      (testing "when a nested query is from a saved question, there should be no `:join-alias` on the left side"
        (lib.tu.macros/$ids nil
          (let [base-query (qp.preprocess/preprocess
                            (lib/query
                             mp
                             (lib.tu.macros/mbql-query nil
                               {:source-table "card__1"
                                :joins        [{:fields       :all
                                                :source-table "card__2"
                                                :condition    [:= $orders.user-id &Products.products.id]
                                                :alias        "Q"}]
                                :limit        1})))
                fields     #{%orders.discount %products.title %people.source}]
            (is (= [{:display_name "Discount"
                     :field_ref    [:field %orders.discount nil]}
                    {:display_name "Products → Title"
                     :field_ref    [:field %products.title nil]}
                    {:display_name "Q → Source"
                     :field_ref    [:field %people.source {:join-alias "Q"}]}]
                   (->> (:cols (add-column-info base-query {}))
                        (filter #(fields (:id %)))
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

;;; adapted from [[metabase.driver.postgres-test/pgobject-test]], but does not actually run any queries.
(deftest ^:parallel native-query-infer-effective-type-test
  (testing "Inferred base-type should also get propagated to effective-type"
    (let [query (lib/query
                 meta/metadata-provider
                 {:database (meta/id)
                  :type     :native
                  :native   {:query "SELECT pg_sleep(0.01) AS sleep;"}})]
      (is (=? [{:display_name   "sleep"
                :base_type      :type/Text
                :effective_type :type/Text
                :database_type  "void"
                :source         :native
                :field_ref      [:field "sleep" {:base-type :type/Text}]
                :name           "sleep"}]
              (-> (add-column-info
                   query
                   {:cols [{:name "sleep", :base_type :type/*, :database_type "void"}]}
                   [[""]])
                  :cols))))))

(deftest ^:sequential expected-cols-no-infinite-loop-test
  (testing "In case of a lib vs. driver column count mismatch, don't loop infinitely (#66955)"
    (let [query       (lib/query meta/metadata-provider
                                 (meta/table-metadata :orders))
          all-cols    (mapv #(select-keys % [:name :base-type]) (lib/returned-columns query))
          missing-one (butlast all-cols)]
      (is (= 9 (count (annotate/expected-cols query all-cols))))
      (testing "in dev and test modes, we throw an error when the counts differ"
        (is (thrown-with-msg? Exception #"column number mismatch"
                              (annotate/expected-cols query missing-one))))
      (testing "in prod, we log and append nils to make the counts line up - this looped forever before #66955!"
        (with-redefs [config/is-prod? true]
          (is (= 8 (count (annotate/expected-cols query missing-one)))))))))
