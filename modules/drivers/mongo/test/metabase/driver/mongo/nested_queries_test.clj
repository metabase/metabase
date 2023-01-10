(ns metabase.driver.mongo.nested-queries-test
  "Tests for handling queries with nested expressions. Contains the mongo specific
  parts of metabase.query-processor-test.nested-queries-test."
  (:require
   [clojure.test :refer :all]
   [metabase.models.card :as card :refer [Card]]
   [metabase.query-processor :as qp]
   [metabase.query-processor-test :as qp.test]
   [metabase.query-processor-test.nested-queries-test :as qp.nested-test]
   [metabase.test :as mt]
   [metabase.util :as u]))

(deftest card-id-native-source-queries-test
  (mt/with-driver :mongo
    (let [run-native-query
          (fn [pipeline-str]
            (mt/with-temp Card [card {:dataset_query {:database (mt/id),
                                                      :type :native,
                                                      :native {:query pipeline-str
                                                               :collection "venues"}}}]
              (qp.test/rows-and-cols
               (mt/format-rows-by [int int]
                 (qp/process-query
                  (qp.nested-test/query-with-source-card card
                    (mt/$ids venues
                      {:aggregation [:count]
                       :breakout    [*price]})))))))]
      (is (= (-> (qp.nested-test/breakout-results :has-source-metadata? false :native-source? true)
                 (update :cols (fn [cols]
                                 (mapv (fn [col]
                                         (cond-> col
                                           (= (:name col) "price")
                                           (update :field_ref assoc 1 "price")))
                                       cols))))
             (run-native-query "[]"))
          "make sure `card__id`-style queries work with native source queries as well"))))

(deftest field-literals-test
  (mt/with-driver :mongo
    (is (= {:projections ["avg"]
            :query
            [{"$group" {"_id" {"price" "$price"}, "stddev" {"$stdDevSamp" "$_id"}}}
             {"$sort" {"_id" 1}}
             {"$project" {"_id" false, "price" "$_id.price", "stddev" true}}
             {"$sort" {"avg" -1, "price" 1}}
             {"$group" {"_id" nil, "avg" {"$avg" "$stddev"}}}
             {"$sort" {"_id" 1}}
             {"$project" {"_id" false, "avg" true}}]
            :collection  "venues"
            :mbql?       true}
           (qp/compile
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :aggregation  [[:stddev $id]]
                              :breakout     [$price]
                              :order-by     [[[:aggregation 0] :descending]]}
               :aggregation  [[:avg *stddev/Integer]]}))))))

(deftest handle-incorrect-field-forms-gracefully-test
  (testing "make sure that we handle [:field [:field <name> ...]] forms gracefully, despite that not making any sense"
    (mt/with-driver :mongo
      (is (= {:projections ["category_id"],
              :query
              [{"$project"
                {"_id" "$_id",
                 "name" "$name",
                 "category_id" "$category_id",
                 "latitude" "$latitude",
                 "longitude" "$longitude",
                 "price" "$price"}}
               {"$group" {"_id" {"category_id" "$category_id"}}}
               {"$sort" {"_id" 1}}
               {"$project" {"_id" false, "category_id" "$_id.category_id"}}
               {"$sort" {"category_id" 1}}
               {"$limit" 10}],
              :collection "venues",
              :mbql? true}
             (mt/compile
              (mt/mbql-query venues
                {:source-query {:source-table $$venues}
                 :breakout     [[:field [:field "category_id" {:base-type :type/Integer}] nil]]
                 :limit        10})))))))

(deftest filter-by-string-fields-test
  (testing "Make sure we can filter by string fields from a source query"
    (mt/with-driver :mongo
      (is (= {:projections ["_id" "name" "category_id" "latitude" "longitude" "price"],
              :query
              [{"$project"
                {"_id" "$_id",
                 "name" "$name",
                 "category_id" "$category_id",
                 "latitude" "$latitude",
                 "longitude" "$longitude",
                 "price" "$price"}}
               {"$match" {"text" {"$ne" "Coo"}}}
               {"$project"
                {"_id" "$_id",
                 "name" "$name",
                 "category_id" "$category_id",
                 "latitude" "$latitude",
                 "longitude" "$longitude",
                 "price" "$price"}}
               {"$limit" 10}],
              :collection "venues",
              :mbql? true}
             (qp/compile
              (mt/mbql-query nil
                {:source-query {:source-table $$venues}
                 :limit        10
                 :filter       [:!= [:field "text" {:base-type :type/Text}] "Coo"]})))))))

(deftest filter-by-number-fields-test
  (testing "Make sure we can filter by number fields form a source query"
    (mt/with-driver :mongo
      (is (= {:projections ["_id" "name" "category_id" "latitude" "longitude" "price"]
              :query
              [{"$project"
                {"_id" "$_id"
                 "name" "$name"
                 "category_id" "$category_id"
                 "latitude" "$latitude"
                 "longitude" "$longitude"
                 "price" "$price"}}
               {"$match" {"sender_id" {"$gt" 3}}}
               {"$project"
                {"_id" "$_id",
                 "name" "$name"
                 "category_id" "$category_id"
                 "latitude" "$latitude"
                 "longitude" "$longitude"
                 "price" "$price"}}
               {"$limit" 10}]
              :collection "venues"
              :mbql? true}
             (qp/compile
              (mt/mbql-query nil
                {:source-query {:source-table $$venues}
                 :limit        10
                 :filter       [:> *sender_id/Integer 3]})))))))

(deftest native-query-with-default-params-as-source-test
  (testing "make sure using a native query with default params as a source works"
    (mt/with-driver :mongo
      (mt/dataset sample-dataset
        (is (= [[9 "7217466997444" "Practical Bronze Computer" "Widget"
                 "Keely Stehr Group" 58.31 4.2 "2019-02-07T08:26:25.647Z"]
                [14 "8833419218504" "Awesome Concrete Shoes" "Widget"
                 "McClure-Lockman" 25.1 4.0 "2017-12-31T14:41:56.87Z"]
                [15 "5881647583898" "Aerodynamic Paper Computer" "Widget"
                 "Friesen-Anderson" 25.1 4.0 "2016-09-08T14:42:57.264Z"]]
               (mt/with-temp Card [card {:dataset_query
                                         {:database (mt/id)
                                          :type     :native
                                          :native
                                          {:query         "[{\"$match\": {\"category\": {\"$eq\": {{category}} }}} {\"$sort\": {\"_id\": 1}} {\"$limit\": 3}]"
                                           :collection    "products"
                                           :template-tags {:category {:name         "category"
                                                                      :display_name "Category"
                                                                      :type         "text"
                                                                      :required     true
                                                                      :default      "Widget"}}}}}]
                 (mt/rows
                  (qp/process-query
                   {:database (mt/id)
                    :type     :query
                    :query    {:source-table (str "card__" (u/the-id card))}})))))))))

(deftest correct-column-metadata-test
  (mt/with-driver :mongo
    (testing "make sure nested queries return the right columns metadata for native string source queries and datetime breakouts"
      (is (= [(-> (qp.test/breakout-col (qp.test/field-literal-col :checkins :date))
                  (assoc :field_ref    [:field "date" {:base-type :type/Instant, :temporal-unit :day}]
                         :unit         :day)
                  ;; because this field literal comes from a native query that does not include `:source-metadata` it won't have
                  ;; the usual extra keys
                  (dissoc :semantic_type :coercion_strategy :table_id
                          :id :settings :fingerprint :nfc_path))
              (qp.test/aggregate-col :count)]
             (mt/cols
              (mt/with-temp Card [card {:dataset_query {:database (mt/id)
                                                        :type     :native
                                                        :native   {:query "[]"
                                                                   :collection "checkins"}}}]
                (qp/process-query
                 (qp.nested-test/query-with-source-card card
                   (mt/$ids checkins
                     {:aggregation [[:count]]
                      :breakout    [!day.*date]}))))))))))
