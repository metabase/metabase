(ns metabase.query-processor.middleware.annotate-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.models :refer [Card]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.middleware.annotate :as annotate]
   [metabase.test :as mt]
   [metabase.util :as u]))

(set! *warn-on-reflection* true)

(defn- add-column-info [query metadata]
  (mt/with-everything-store
    (driver/with-driver :h2
      ((annotate/add-column-info query identity) metadata))))

(deftest ^:parallel native-column-info-test
  (testing "native column info"
    (testing "should still infer types even if the initial value(s) are `nil` (#4256, #6924)"
      (is (= [:type/Integer]
             (transduce identity (#'annotate/base-type-inferer {:cols [{}]})
                        (concat (repeat 1000 [nil]) [[1] [2]])))))

    (testing "should use default `base_type` of `type/*` if there are no non-nil values in the sample"
      (is (= [:type/*]
             (transduce identity (#'annotate/base-type-inferer {:cols [{}]})
                        [[nil]]))))

    (testing "should attempt to infer better base type if driver returns :type/* (#12150)"
      ;; `merged-column-info` handles merging info returned by driver & inferred by annotate
      (is (= [:type/Integer]
             (transduce identity (#'annotate/base-type-inferer {:cols [{:base_type :type/*}]})
                        [[1] [2] [nil] [3]]))))

    (testing "should disambiguate duplicate names"
      (is (= [{:name "a", :display_name "a", :base_type :type/Integer, :source :native, :field_ref [:field "a" {:base-type :type/Integer}]}
              {:name "a", :display_name "a", :base_type :type/Integer, :source :native, :field_ref [:field "a_2" {:base-type :type/Integer}]}]
             (annotate/column-info
              {:type :native}
              {:cols [{:name "a" :base_type :type/Integer} {:name "a" :base_type :type/Integer}]
               :rows [[1 nil]]}))))))

;;; TODO -- figure out which of these should be ported to [[metabase.lib.metadata.calculate-test]]

(deftest mbql-cols-nested-queries-test
  (testing "Should be able to infer MBQL columns with nested queries"
    (let [base-query (qp/preprocess
                      (mt/mbql-query venues
                        {:joins [{:fields       :all
                                  :source-table $$categories
                                  :condition    [:= $category_id &c.categories.id]
                                  :alias        "c"}]}))]
      (doseq [level [0 1 2 3]]
        (testing (format "%d level(s) of nesting" level)
          (let [nested-query (mt/nest-query base-query level)]
            (testing (format "\nQuery = %s" (u/pprint-to-str nested-query))
              (is (= (mt/$ids venues
                       [{:name "ID",          :id %id,              :field_ref $id}
                        {:name "NAME",        :id %name,            :field_ref $name}
                        {:name "CATEGORY_ID", :id %category_id,     :field_ref $category_id}
                        {:name "LATITUDE",    :id %latitude,        :field_ref $latitude}
                        {:name "LONGITUDE",   :id %longitude,       :field_ref $longitude}
                        {:name "PRICE",       :id %price,           :field_ref $price}
                        {:name "ID_2",        :id %categories.id,   :field_ref &c.categories.id}
                        {:name "NAME_2",      :id %categories.name, :field_ref &c.categories.name}])
                     (map #(select-keys % [:name :id :field_ref])
                          (:cols (add-column-info nested-query {})))))))))))

  (testing "Aggregated question with source is an aggregated models should infer display_name correctly (#23248)"
    (mt/dataset sample-dataset
     (mt/with-temp* [Card [{card-id :id}
                           {:dataset true
                            :dataset_query
                            (mt/$ids :products
                                     {:type     :query
                                      :database (mt/id)
                                      :query    {:source-table $$products
                                                 :aggregation
                                                 [[:aggregation-options
                                                   [:sum $price]
                                                   {:name "sum"}]
                                                  [:aggregation-options
                                                   [:max $rating]
                                                   {:name "max"}]]
                                                 :breakout     $category
                                                 :order-by     [[:asc $category]]}})}]]
       (let [query (qp/preprocess
                     (mt/mbql-query nil
                                    {:source-table (str "card__" card-id)
                                     :aggregation  [[:aggregation-options
                                                     [:sum
                                                      [:field
                                                       "sum"
                                                       {:base-type :type/Float}]]
                                                     {:name "sum"}]
                                                    [:aggregation-options
                                                     [:count]
                                                     {:name "count"}]]
                                     :limit        1}))]
        (is (= ["Sum of Sum of Price" "Count"]
              (->> (add-column-info query {})
                  :cols
                  (map :display_name)))))))))

(deftest inception-test
  (testing "Should return correct metadata for an 'inception-style' nesting of source > source > source with a join (#14745)"
    (mt/dataset sample-dataset
      ;; these tests look at the metadata for just one column so it's easier to spot the differences.
      (letfn [(ean-metadata [result]
                (as-> (:cols result) result
                  (m/index-by :name result)
                  (get result "EAN")
                  (select-keys result [:name :display_name :base_type :semantic_type :id :field_ref])))]
        (testing "Make sure metadata is correct for the 'EAN' column with"
          (let [base-query (qp/preprocess
                            (mt/mbql-query orders
                              {:joins [{:fields       :all
                                        :source-table $$products
                                        :condition    [:= $product_id &Products.products.id]
                                        :alias        "Products"}]
                               :limit 10}))]
            (doseq [level (range 4)]
              (testing (format "%d level(s) of nesting" level)
                (let [nested-query (mt/nest-query base-query level)]
                  (testing (format "\nQuery = %s" (u/pprint-to-str nested-query))
                    (is (= (mt/$ids products
                             {:name         "EAN"
                              :display_name "Products → Ean"
                              :base_type    :type/Text
                              :semantic_type nil
                              :id           %ean
                              :field_ref    &Products.ean})
                           (ean-metadata (add-column-info nested-query {}))))))))))))))

;; metabase#14787
(deftest col-info-for-fields-from-card-test
  (mt/dataset sample-dataset
    (let [card-1-query (mt/mbql-query orders
                         {:joins [{:fields       :all
                                   :source-table $$products
                                   :condition    [:= $product_id &Products.products.id]
                                   :alias        "Products"}]})]
      (mt/with-temp* [Card [{card-1-id :id} {:dataset_query card-1-query}]
                      Card [{card-2-id :id} {:dataset_query (mt/mbql-query people)}]]
        (testing "when a nested query is from a saved question, there should be no `:join-alias` on the left side"
          (mt/$ids nil
            (let [base-query (qp/preprocess
                              (mt/mbql-query nil
                                {:source-table (str "card__" card-1-id)
                                 :joins        [{:fields       :all
                                                 :source-table (str "card__" card-2-id)
                                                 :condition    [:= $orders.user_id &Products.products.id]
                                                 :alias        "Q"}]
                                 :limit        1}))
                  fields     #{%orders.discount %products.title %people.source}]
              (is (= [{:display_name "Discount" :field_ref [:field %orders.discount nil]}
                      {:display_name "Products → Title" :field_ref [:field %products.title nil]}
                      {:display_name "Q → Source" :field_ref [:field %people.source {:join-alias "Q"}]}]
                     (->> (:cols (add-column-info base-query {}))
                          (filter #(fields (:id %)))
                          (map #(select-keys % [:display_name :field_ref])))))))))))

  (testing "Has the correct display names for joined fields from cards"
    (letfn [(native [query] {:type :native
                             :native {:query query :template-tags {}}
                             :database (mt/id)})]
      (mt/with-temp* [Card [{card1-id :id} {:dataset_query
                                            (native "select 'foo' as A_COLUMN")}]
                      Card [{card2-id :id} {:dataset_query
                                            (native "select 'foo' as B_COLUMN")}]]
        (doseq [card-id [card1-id card2-id]]
          ;; populate metadata
          (mt/user-http-request :rasta :post 202 (format "card/%d/query" card-id)))
        (let [query {:database (mt/id)
                     :type :query
                     :query {:source-table (str "card__" card1-id)
                             :joins [{:fields "all"
                                      :source-table (str "card__" card2-id)
                                      :condition [:=
                                                  [:field "A_COLUMN" {:base-type :type/Text}]
                                                  [:field "B_COLUMN" {:base-type :type/Text
                                                                      :join-alias "alias"}]]
                                      :alias "alias"}]}}
              results (qp/process-query query)]
          (is (= "alias → B Column" (-> results :data :cols second :display_name))
              "cols has wrong display name")
          (is (= "alias → B Column" (-> results :data :results_metadata
                                        :columns second :display_name))
              "Results metadata cols has wrong display name"))))))

(deftest ^:parallel preserve-original-join-alias-test
  (testing "The join alias for the `:field_ref` in results metadata should match the one originally specified (#27464)"
    (mt/test-drivers (mt/normal-drivers-with-feature :left-join)
      (mt/dataset sample-dataset
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
              (is (= (mt/$ids
                       [{:display_name "ID"
                         :field_ref    $orders.id}
                        (merge
                         {:display_name (str join-alias " → Title")
                          :field_ref    [:field %products.title {:join-alias join-alias}]}
                         ;; `source_alias` is only included in `data.cols`, but not in `results_metadata`
                         (when (= location "data.cols")
                           {:source_alias join-alias}))])
                     (map
                      #(select-keys % [:display_name :field_ref :source_alias])
                      metadata))))))))))
