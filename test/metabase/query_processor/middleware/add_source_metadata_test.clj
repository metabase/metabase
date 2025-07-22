(ns metabase.query-processor.middleware.add-source-metadata-test
  (:require
   [clojure.test :refer :all]
   [medley.core :as m]
   [metabase.driver :as driver]
   [metabase.lib.test-metadata :as meta]
   [metabase.lib.test-util :as lib.tu]
   [metabase.lib.test-util.macros :as lib.tu.macros]
   [metabase.query-processor.middleware.add-source-metadata :as add-source-metadata]
   [metabase.query-processor.preprocess :as qp.preprocess]
   [metabase.query-processor.store :as qp.store]
   [metabase.test :as mt]
   [metabase.util :as u]))

(defn- add-source-metadata [query]
  (driver/with-driver :h2
    (qp.store/with-metadata-provider (if (qp.store/initialized?)
                                       (qp.store/metadata-provider)
                                       meta/metadata-provider)
      (add-source-metadata/add-source-metadata-for-source-queries query))))

(defn- results-col [col]
  (select-keys
   col
   [:id :table_id :name :display_name :base_type :effective_type :coercion_strategy
    :semantic_type :unit :fingerprint :settings :field_ref :nfc_path :parent_id]))

(defn- results-metadata [cols]
  (map results-col cols))

(defn- venues-source-metadata
  ([]
   (venues-source-metadata :id :name :category-id :latitude :longitude :price))

  ([& field-names]
   (let [field-ids (map #(meta/id :venues (keyword (u/lower-case-en (name %))))
                        field-names)]
     (qp.store/with-metadata-provider (if (qp.store/initialized?)
                                        (qp.store/metadata-provider)
                                        meta/metadata-provider)
       (results-metadata
        (qp.preprocess/query->expected-cols
         (lib.tu.macros/mbql-query venues
           {:fields (for [id field-ids] [:field id nil])
            :limit  1})))))))

(deftest ^:parallel basic-test
  (testing "Can we automatically add source metadata to the parent level of a query? If the source query has `:fields`"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query    {:source-table $$venues
                                 :fields       [$id $name]}
               :source-metadata (venues-source-metadata :id :name)})
            (add-source-metadata
             (lib.tu.macros/mbql-query venues
               {:source-query {:source-table $$venues
                               :fields       [$id $name]}}))))))

(deftest ^:parallel basic-parent-level-test
  (testing (str "Can we automatically add source metadata to the parent level of a query? If the source query does not "
                "have `:fields`")
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query    {:source-table $$venues}
               :source-metadata (venues-source-metadata)})
            (add-source-metadata
             (lib.tu.macros/mbql-query venues
               {:source-query {:source-table $$venues}}))))))

(deftest ^:parallel basic-summary-columns-test
  (testing "Can we add source metadata for a source query that has breakouts/aggregations?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query    {:source-table $$venues
                                 :aggregation  [[:count]]
                                 :breakout     [$price]}
               :source-metadata [(-> (venues-source-metadata :price)
                                     first)
                                 {:name          "count"
                                  :display_name  "Count"
                                  :base_type     :type/Integer
                                  :semantic_type :type/Quantity
                                  :field_ref     [:aggregation 0]}]})
            (add-source-metadata
             (lib.tu.macros/mbql-query venues
               {:source-query {:source-table       $$venues
                               :aggregation        [[:count]]
                               :breakout           [$price]}}))))))

(deftest ^:parallel basic-aggregation-with-field-test
  (testing "Can we add source metadata for a source query that has an aggregation for a specific Field?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query    {:source-table       $$venues
                                 :aggregation        [[:avg $id]]
                                 :breakout           [$price]}
               :source-metadata [(-> (venues-source-metadata :price)
                                     first)
                                 {:name          "avg"
                                  :display_name  "Average of ID"
                                  :base_type     :type/Float
                                  :semantic_type :type/PK
                                  :field_ref     [:aggregation 0]}]})
            (add-source-metadata
             (lib.tu.macros/mbql-query venues
               {:source-query {:source-table $$venues
                               :aggregation  [[:avg $id]]
                               :breakout     [$price]}}))))))

(defn- source-metadata [query]
  (get-in query [:query :source-metadata] query))

(deftest ^:parallel named-aggregations-test
  (testing "adding source metadata for source queries with named aggregations"
    (testing "w/ `:name` and `:display-name`"
      (is (=? (lib.tu.macros/mbql-query venues
                {:source-query    {:source-table $$venues
                                   :aggregation  [[:aggregation-options
                                                   [:avg $id]
                                                   {:name "some_generated_name", :display-name "My Cool Ag"}]]
                                   :breakout     [$price]}
                 :source-metadata [(-> (venues-source-metadata :price)
                                       first)
                                   {:name          "some_generated_name"
                                    :display_name  "My Cool Ag"
                                    :base_type     :type/Float
                                    :semantic_type :type/PK
                                    :field_ref     [:aggregation 0]}]})
              (add-source-metadata
               (lib.tu.macros/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :aggregation  [[:aggregation-options
                                                 [:avg $id]
                                                 {:name "some_generated_name", :display-name "My Cool Ag"}]]
                                 :breakout     [$price]}})))))))

(deftest ^:parallel named-aggregations-name-only-test
  (testing "w/ `:name` only"
    (is (=? [{:name          "some_generated_name"
              :display_name  "Average of ID"
              :base_type     :type/Float
              :semantic_type :type/PK
              :field_ref     [:aggregation 0]}]
            (source-metadata
             (add-source-metadata
              (lib.tu.macros/mbql-query venues
                {:source-query {:source-table $$venues
                                :aggregation  [[:aggregation-options [:avg $id] {:name "some_generated_name"}]]}})))))))

(deftest ^:parallel named-aggregations-display-name-only-test
  (testing "w/ `:display-name` only"
    (is (=? [{:name          "avg"
              :display_name  "My Cool Ag"
              :base_type     :type/Float
              :semantic_type :type/PK
              :field_ref     [:aggregation 0]}]
            (source-metadata
             (add-source-metadata
              (lib.tu.macros/mbql-query venues
                {:source-query {:source-table $$venues
                                :aggregation  [[:aggregation-options [:avg $id] {:display-name "My Cool Ag"}]]}})))))))

(deftest ^:parallel nested-sources-test
  (testing (str "Can we automatically add source metadata to the parent level of a query? If the source query has a "
                "source query with source metadata")
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query    {:source-query    {:source-table $$venues
                                                   :fields       [$id $name]}
                                 :source-metadata (venues-source-metadata :id :name)}
               :source-metadata (venues-source-metadata :id :name)})
            (add-source-metadata
             (lib.tu.macros/mbql-query venues
               {:source-query {:source-query    {:source-table $$venues
                                                 :fields       [$id $name]}
                               :source-metadata (venues-source-metadata :id :name)}}))))))

(deftest ^:parallel nested-sources-3-levels-with-source-metadata-test
  (testing "Can we automatically add source metadata if a source-query nested 3 levels has `:source-metadata`?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                                     :fields       [$id $name]}
                                                   :source-metadata (venues-source-metadata :id :name)}
                                 :source-metadata (venues-source-metadata :id :name)}
               :source-metadata (venues-source-metadata :id :name)})
            (add-source-metadata
             (lib.tu.macros/mbql-query venues
               {:source-query
                {:source-query
                 {:source-query    {:source-table $$venues
                                    :fields       [$id $name]}
                  :source-metadata (venues-source-metadata :id :name)}}}))))))

(deftest ^:parallel nested-sources-3-levels-with-no-source-metadata-test
  (testing "Ok, how about a source query nested 3 levels with no `source-metadata`?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query    {:source-query    {:source-query    {:source-table $$venues}
                                                   :source-metadata (venues-source-metadata)}
                                 :source-metadata (venues-source-metadata)}
               :source-metadata (venues-source-metadata)})
            (add-source-metadata
             (lib.tu.macros/mbql-query venues
               {:source-query {:source-query {:source-query {:source-table $$venues}}}}))))))

(deftest ^:parallel nested-sources-3-levels-with-fields-test
  (testing "nested 3 levels with `fields`"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                                     :fields       [$id $name]}
                                                   :source-metadata (venues-source-metadata :id :name)}
                                 :source-metadata (venues-source-metadata :id :name)}
               :source-metadata (venues-source-metadata :id :name)})
            (add-source-metadata
             (lib.tu.macros/mbql-query venues
               {:source-query {:source-query {:source-query {:source-table $$venues
                                                             :fields       [$id $name]}}}}))))))

(deftest ^:parallel nested-sources-3-levels-with-summary-columns-test
  (testing "nested 3 levels with breakouts/aggregations"
    (qp.store/with-metadata-provider meta/metadata-provider
      ;; field ref for the count aggregation differs slightly depending on what level of the query we're at; at the
      ;; most-deeply-nested level we can use the `[:aggregation 0]` ref to refer to it; at higher levels we have to
      ;; refer to it with a field literal
      (is (=? (letfn [(metadata-with-count-field-ref [field-ref]
                        [(-> (venues-source-metadata :price) first)
                         (let [[count-col] (->> (lib.tu.macros/mbql-query venues
                                                  {:aggregation [[:count]]})
                                                qp.preprocess/query->expected-cols
                                                results-metadata)]
                           (-> count-col
                               (dissoc :effective_type)
                               (assoc :field_ref field-ref
                                      :base_type :type/Integer)))])]
                (lib.tu.macros/mbql-query venues
                  {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                                         :aggregation  [[:count]]
                                                                         :breakout     [$price]}
                                                       :source-metadata (metadata-with-count-field-ref [:aggregation 0])}
                                     :source-metadata (metadata-with-count-field-ref *count/Integer)}
                   :source-metadata (metadata-with-count-field-ref *count/Integer)}))
              (add-source-metadata
               (lib.tu.macros/mbql-query venues
                 {:source-query {:source-query {:source-query {:source-table $$venues
                                                               :aggregation  [[:count]]
                                                               :breakout     [$price]}}}})))))))

(deftest ^:parallel nested-sources-with-source-native-query-test
  (testing "can we add `source-metadata` to the parent level if the source query has a native source query, but itself has `source-metadata`?"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-query    {:source-query    {:native "SELECT \"ID\", \"NAME\" FROM \"VENUES\";"}
                                 :source-metadata (venues-source-metadata :id :name)}
               :source-metadata (venues-source-metadata :id :name)})
            (add-source-metadata
             (lib.tu.macros/mbql-query venues
               {:source-query {:source-query    {:native "SELECT \"ID\", \"NAME\" FROM \"VENUES\";"}
                               :source-metadata (venues-source-metadata :id :name)}}))))))

(deftest ^:parallel joins-test
  (testing "should work inside JOINS as well"
    (is (=? (lib.tu.macros/mbql-query venues
              {:source-table $$venues
               :joins        [{:source-query    {:source-table $$venues
                                                 :fields       [$id $name]}
                               :source-metadata (venues-source-metadata :id :name)}]})
            (add-source-metadata
             (lib.tu.macros/mbql-query venues
               {:source-table $$venues
                :joins        [{:source-query {:source-table $$venues
                                               :fields       [$id $name]}}]}))))))

(deftest ^:parallel binned-fields-test
  (testing "source metadata should handle source queries that have binned fields"
    (qp.store/with-metadata-provider (lib.tu/mock-metadata-provider
                                      meta/metadata-provider
                                      {:settings {:breakout-bin-width 5.0}})
      (is (=? (lib.tu.macros/mbql-query venues
                {:source-query    {:source-table       $$venues
                                   :aggregation        [[:count]]
                                   :breakout           [[:field %latitude {:binning {:strategy :default}}]]}
                 :source-metadata (concat
                                   (let [[lat-col]   (venues-source-metadata :latitude)
                                         [count-col] (results-metadata (qp.preprocess/query->expected-cols
                                                                        (lib.tu.macros/mbql-query venues
                                                                          {:aggregation [[:count]]})))]
                                     [(assoc lat-col
                                             :field_ref [:field
                                                         (meta/id :venues :latitude)
                                                         {:binning {:strategy  :bin-width
                                                                    :min-value 10.0
                                                                    :max-value 45.0
                                                                    :num-bins  7
                                                                    :bin-width 5.0}}]
                                             :display_name "Latitude: 5°")
                                      ;; computed column doesn't have an effective type in middleware before query
                                      (-> count-col
                                          (dissoc :effective_type)
                                          ;; the type that comes back from H2 is :type/BigInteger but the type that comes
                                          ;; back from calculating it with MLv2 is just plain :type/Integer
                                          (assoc :base_type :type/Integer))]))})
              (add-source-metadata
               (lib.tu.macros/mbql-query venues
                 {:source-query
                  {:source-table       $$venues
                   :aggregation        [[:count]]
                   :breakout           [[:field %latitude {:binning {:strategy :default}}]]}})))))))

(deftest ^:parallel deduplicate-column-names-test
  (testing "Metadata that gets added to source queries should have deduplicated column names"
    (let [query (add-source-metadata
                 (lib.tu.macros/mbql-query checkins
                   {:source-query {:source-table $$checkins
                                   :joins        [{:fields       :all
                                                   :alias        "u"
                                                   :source-table $$users
                                                   :condition    [:= $user-id &u.users.id]}]}
                    :joins        [{:fields       :all
                                    :alias        "v"
                                    :source-table $$venues
                                    :condition    [:= *user-id &v.venues.id]}]
                    :order-by     [[:asc $id]]
                    :limit        2}))]
      (is (= ["ID" "DATE" "USER_ID" "VENUE_ID" "ID_2" "NAME" "LAST_LOGIN"]
             (map :name (get-in query [:query :source-metadata])))))))

(deftest ^:parallel inception-test
  (testing "Should be able to do an 'inception-style' nesting of source > source > source with a join (#14724)"
    ;; these tests look at the metadata for just one column so it's easier to spot the differences.
    (letfn [(ean-metadata [query]
              (as-> query query
                (get-in query [:query :source-metadata])
                (m/index-by :name query)
                (get query "EAN")
                (select-keys query [:name :display_name :base_type :semantic_type :id :field_ref])))]
      (let [base-query (lib.tu.macros/mbql-query orders
                         {:source-table $$orders
                          :joins        [{:fields       :all
                                          :source-table $$products
                                          :condition    [:= $product-id &Products.products.id]
                                          :alias        "Products"}]
                          :limit        10})]
        (testing "Make sure metadata is correct for the 'EAN' column with"
          (doseq [level (range 1 4)
                  :let  [query (mt/nest-query base-query level)]]
            (testing (format "%d level(s) of nesting" level)
              (is (= (lib.tu.macros/$ids products
                       {:name         "EAN"
                        :display_name "Products → Ean"
                        :base_type    :type/Text
                        :id           %ean
                        :field_ref    &Products.ean})
                     (ean-metadata (add-source-metadata query)))))))))))

(deftest ^:parallel ignore-legacy-source-metadata-test
  (testing "Should ignore 'legacy' < 0.38.0 source metadata and recalculate it for MBQL queries (#14788)"
    ;; normally this middleware will use existing source metadata rather than recalculating it, but if we encounter <
    ;; 0.38.0 source metadata that is missing `:field_ref` and `:id` information we should ignore it.
    (let [query             (lib.tu.macros/mbql-query orders
                              {:source-query {:source-table $$orders
                                              :joins        [{:source-table $$products
                                                              :alias         "ℙ"
                                                              :fields       :all
                                                              :condition    [:= $product-id &ℙ.products.id]}]
                                              :order-by     [[:asc $id]]
                                              :limit        2}})
          metadata          (qp.store/with-metadata-provider meta/metadata-provider
                              (qp.preprocess/query->expected-cols query))
          ;; the actual metadata this middleware should return. Doesn't have all the columns that come back from
          ;; `qp.preprocess/query->expected-cols`
          expected-metadata (map results-col metadata)]
      (letfn [(added-metadata [query]
                (get-in (add-source-metadata query) [:query :source-metadata]))]
        (testing "\nShould add source metadata if there's none already"
          (is (=? expected-metadata
                  (added-metadata query))))
        (testing "\nShould use existing metadata if it's already there"
          ;; since it's using the existing metadata, it should have all the extra keys instead of the subset in
          ;; `expected-metadata`
          (is (= metadata
                 (added-metadata (assoc-in query [:query :source-metadata] metadata)))))
        (testing "\nShould ignore legacy metadata"
          ;; pre-0.38.0 metadata didn't have `field_ref` or `id.`
          (let [legacy-metadata (for [col metadata]
                                  (dissoc col :field_ref :id))]
            (is (=? expected-metadata
                    (added-metadata (assoc-in query [:query :source-metadata] legacy-metadata))))))))))

(deftest ^:parallel add-correct-metadata-fields-for-deeply-nested-source-queries-test
  (testing "Make sure we add correct `:fields` from deeply-nested source queries (#14872)"
    ;; this should return a field literal ref because that's what we used in the query, even if that's not technically
    ;; correct.
    (is (= [[:field "TITLE" {:base-type :type/Text}]
            [:aggregation 0]]
           (->> (lib.tu.macros/mbql-query orders
                  {:source-query {:source-query {:source-table $$orders
                                                 :filter       [:= $id 1]
                                                 :aggregation  [[:sum $total]]
                                                 :breakout     [!day.created-at
                                                                $product-id->products.title
                                                                $product-id->products.category]}
                                  :filter       [:> *sum/Float 100]
                                  :aggregation  [[:sum *sum/Float]]
                                  :breakout     [*TITLE/Text]}
                   :filter       [:> *sum/Float 100]})
                add-source-metadata
                :query
                :source-metadata
                (map :field_ref))))))
