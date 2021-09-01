(ns metabase.query-processor.middleware.add-source-metadata-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.driver :as driver]
            [metabase.query-processor :as qp]
            [metabase.query-processor.middleware.add-source-metadata :as add-source-metadata]
            [metabase.test :as mt]
            [metabase.util :as u]))

(defn- add-source-metadata [query]
  (driver/with-driver :h2
    (mt/with-everything-store
      (:pre (mt/test-qp-middleware add-source-metadata/add-source-metadata-for-source-queries query)))))

(defn- results-metadata [query-results]
  (for [col (-> query-results :data :cols)]
    (select-keys
     col
     [:id :table_id :name :display_name :base_type :effective_type :coercion_strategy
      :semantic_type :unit :fingerprint :settings :field_ref :parent_id])))

(defn- venues-source-metadata
  ([]
   (venues-source-metadata :id :name :category_id :latitude :longitude :price))

  ([& field-names]
   (let [field-ids (map #(mt/id :venues (keyword (str/lower-case (name %))))
                        field-names)]
     (results-metadata
      (mt/run-mbql-query venues {:fields (for [id field-ids] [:field id nil])
                                 :limit  1})))))

(defn- venues-source-metadata-for-field-literals
  "Metadata we'd expect to see from a `:field` clause with a string name. The same as normal metadata, but field
  literals don't include semantic-type info."
  [& field-names]
  (for [field (apply venues-source-metadata field-names)]
    (dissoc field :semantic_type)))

(deftest basic-test
  (testing "Can we automatically add source metadata to the parent level of a query? If the source query has `:fields`"
    (is (= (mt/mbql-query venues
             {:source-query    {:source-table $$venues
                                :fields       [$id $name]}
              :source-metadata (venues-source-metadata :id :name)})
           (add-source-metadata
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :fields       [$id $name]}})))))

  (testing (str "Can we automatically add source metadata to the parent level of a query? If the source query does not "
                "have `:fields`")
    (is (= (mt/mbql-query venues
             {:source-query    {:source-table $$venues}
              :source-metadata (venues-source-metadata)})
           (add-source-metadata
            (mt/mbql-query venues
              {:source-query {:source-table $$venues}})))))

  (testing "Can we add source metadata for a source query that has breakouts/aggregations?"
    (is (= (mt/mbql-query venues
             {:source-query    {:source-table $$venues
                                :aggregation  [[:count]]
                                :breakout     [$price]}
              :source-metadata (concat
                                (venues-source-metadata :price)
                                [{:name          "count"
                                  :display_name  "Count"
                                  :base_type     :type/BigInteger
                                  :semantic_type :type/Quantity
                                  :field_ref     [:aggregation 0]}])})
           (add-source-metadata
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :aggregation  [[:count]]
                              :breakout     [$price]}})))))

  (testing "Can we add source metadata for a source query that has an aggregation for a specific Field?"
    (is (= (mt/mbql-query venues
             {:source-query    {:source-table $$venues
                                :aggregation  [[:avg $id]]
                                :breakout     [$price]}
              :source-metadata (concat
                                (venues-source-metadata :price)
                                [{:name          "avg"
                                  :display_name  "Average of ID"
                                  :base_type     :type/BigInteger
                                  :semantic_type :type/PK
                                  :settings      nil
                                  :field_ref     [:aggregation 0]}])})
           (add-source-metadata
            (mt/mbql-query venues
              {:source-query {:source-table $$venues
                              :aggregation  [[:avg $id]]
                              :breakout     [$price]}}))))))

(defn- source-metadata [query]
  (get-in query [:query :source-metadata] query))

(deftest named-aggregations-test
  (testing "adding source metadata for source queries with named aggregations"
    (testing "w/ `:name` and `:display-name`"
      (is (= (mt/mbql-query venues
               {:source-query    {:source-table $$venues
                                  :aggregation  [[:aggregation-options
                                                  [:avg $id]
                                                  {:name "some_generated_name", :display-name "My Cool Ag"}]]
                                  :breakout     [$price]}
                :source-metadata (concat
                                  (venues-source-metadata :price)
                                  [{:name         "some_generated_name"
                                    :display_name "My Cool Ag"
                                    :base_type    :type/BigInteger
                                    :semantic_type :type/PK
                                    :settings     nil
                                    :field_ref    [:aggregation 0]}])})
             (add-source-metadata
              (mt/mbql-query venues
                {:source-query {:source-table $$venues
                                :aggregation  [[:aggregation-options
                                                [:avg $id]
                                                {:name "some_generated_name", :display-name "My Cool Ag"}]]
                                :breakout     [$price]}})))))

    (testing "w/ `:name` only"
      (is (= [{:name         "some_generated_name"
               :display_name "Average of ID"
               :base_type    :type/BigInteger
               :semantic_type :type/PK
               :settings     nil
               :field_ref    [:aggregation 0]}]
             (source-metadata
              (add-source-metadata
               (mt/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :aggregation  [[:aggregation-options [:avg $id] {:name "some_generated_name"}]]}}))))))

    (testing "w/ `:display-name` only"
      (is (= [{:name         "avg"
               :display_name "My Cool Ag"
               :base_type    :type/BigInteger
               :semantic_type :type/PK
               :settings     nil
               :field_ref    [:aggregation 0]}]
             (source-metadata
              (add-source-metadata
               (mt/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :aggregation  [[:aggregation-options [:avg $id] {:display-name "My Cool Ag"}]]}}))))))))

(deftest nested-sources-test
  (testing (str "Can we automatically add source metadata to the parent level of a query? If the source query has a "
                "source query with source metadata")
    (is (= (mt/mbql-query venues
             {:source-query    {:source-query    {:source-table $$venues
                                                  :fields       [$id $name]}
                                :source-metadata (venues-source-metadata :id :name)}
              :source-metadata (venues-source-metadata :id :name)})
           (add-source-metadata
            (mt/mbql-query venues
              {:source-query {:source-query    {:source-table $$venues
                                                :fields       [$id $name]}
                              :source-metadata (venues-source-metadata :id :name)}})))))

  (testing "Can we automatically add source metadata if a source-query nested 3 levels has `:source-metadata`?"
    (is (= (mt/mbql-query venues
             {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                                    :fields       [$id $name]}
                                                  :source-metadata (venues-source-metadata :id :name)}
                                :source-metadata (venues-source-metadata :id :name)}
              :source-metadata (venues-source-metadata :id :name)})
           (add-source-metadata
            (mt/mbql-query venues
              {:source-query
               {:source-query
                {:source-query    {:source-table $$venues
                                   :fields       [$id $name]}
                 :source-metadata (venues-source-metadata :id :name)}}})))))

  (testing "Ok, how about a source query nested 3 levels with no `source-metadata`?"
    (is (= (mt/mbql-query venues
             {:source-query    {:source-query    {:source-query    {:source-table $$venues}
                                                  :source-metadata (venues-source-metadata)}
                                :source-metadata (venues-source-metadata)}
              :source-metadata (venues-source-metadata)})
           (add-source-metadata
            (mt/mbql-query venues
              {:source-query {:source-query {:source-query {:source-table $$venues}}}}))))

    (testing "with `fields`"
      (is (= (mt/mbql-query venues
               {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                                      :fields       [$id $name]}
                                                    :source-metadata (venues-source-metadata :id :name)}
                                  :source-metadata (venues-source-metadata :id :name)}
                :source-metadata (venues-source-metadata :id :name)})
             (add-source-metadata
              (mt/mbql-query venues
                {:source-query {:source-query {:source-query {:source-table $$venues
                                                              :fields       [$id $name]}}}})))))

    (testing "with breakouts/aggregations"
      ;; field ref for the count aggregation differs slightly depending on what level of the query we're at; at the
      ;; most-deeply-nested level we can use the `[:aggregation 0]` ref to refer to it; at higher levels we have to
      ;; refer to it with a field literal
      (is (= (letfn [(metadata-with-count-field-ref [field-ref]
                       (concat
                        (venues-source-metadata :price)
                        (let [[count-col] (results-metadata (mt/run-mbql-query venues {:aggregation [[:count]]}))]
                          [(assoc count-col :field_ref field-ref)])))]
               (mt/mbql-query venues
                 {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                                        :aggregation  [[:count]]
                                                                        :breakout     [$price]}
                                                      :source-metadata (metadata-with-count-field-ref [:aggregation 0])}
                                    :source-metadata (metadata-with-count-field-ref *count/BigInteger)}
                  :source-metadata (metadata-with-count-field-ref *count/BigInteger)}))
             (add-source-metadata
              (mt/mbql-query venues
                {:source-query {:source-query {:source-query {:source-table $$venues
                                                              :aggregation  [[:count]]
                                                              :breakout     [$price]}}}}))))))

  (testing "can we add `source-metadata` to the parent level if the source query has a native source query, but itself has `source-metadata`?"
    (is (= (mt/mbql-query venues
             {:source-query    {:source-query    {:native "SELECT \"ID\", \"NAME\" FROM \"VENUES\";"}
                                :source-metadata (venues-source-metadata :id :name)}
              :source-metadata (venues-source-metadata :id :name)})
           (add-source-metadata
            (mt/mbql-query venues
              {:source-query {:source-query    {:native "SELECT \"ID\", \"NAME\" FROM \"VENUES\";"}
                              :source-metadata (venues-source-metadata :id :name)}}))))))

(deftest joins-test
  (testing "should work inside JOINS as well"
    (is (= (mt/mbql-query venues
             {:source-table $$venues
              :joins        [{:source-query    {:source-table $$venues
                                                :fields       [$id $name]}
                              :source-metadata (venues-source-metadata :id :name)}]})
           (add-source-metadata
            (mt/mbql-query venues
              {:source-table $$venues
               :joins        [{:source-query {:source-table $$venues
                                              :fields       [$id $name]}}]}))))))

(deftest binned-fields-test
  (testing "source metadata should handle source queries that have binned fields"
    (mt/with-temporary-setting-values [breakout-bin-width 5.0]
      (is (= (mt/mbql-query venues
               {:source-query    {:source-table $$venues
                                  :aggregation  [[:count]]
                                  :breakout     [[:field %latitude {:binning {:strategy :default}}]]}
                :source-metadata (concat
                                  (let [[lat-col] (venues-source-metadata :latitude)]
                                    [(assoc lat-col :field_ref [:field
                                                                (mt/id :venues :latitude)
                                                                {:binning {:strategy :bin-width
                                                                           :min-value 10.0
                                                                           :max-value 45.0
                                                                           :num-bins  7
                                                                           :bin-width 5.0}}])])
                                  (results-metadata (mt/run-mbql-query venues {:aggregation [[:count]]})))})
             (add-source-metadata
              (mt/mbql-query venues
                {:source-query
                 {:source-table $$venues
                  :aggregation  [[:count]]
                  :breakout     [[:field %latitude {:binning {:strategy :default}}]]}})))))))

(deftest deduplicate-column-names-test
  (testing "Metadata that gets added to source queries should have deduplicated column names"
    (let [query (add-source-metadata
                 (mt/mbql-query checkins
                   {:source-query {:source-table $$checkins
                                   :joins
                                   [{:fields       :all
                                     :alias        "u"
                                     :source-table $$users
                                     :condition    [:= $user_id &u.users.id]}]}
                    :joins        [{:fields       :all
                                    :alias        "v"
                                    :source-table $$venues
                                    :condition    [:= *user_id &v.venues.id]}]
                    :order-by     [[:asc $id]]
                    :limit        2}))]
      (is (= ["ID" "DATE" "USER_ID" "VENUE_ID" "ID_2" "NAME" "LAST_LOGIN"]
             (map :name (get-in query [:query :source-metadata])))))))

(deftest inception-test
  (testing "Should be able to do an 'inception-style' nesting of source > source > source with a join (#14724)"
    (mt/dataset sample-dataset
      ;; these tests look at the metadata for just one column so it's easier to spot the differences.
      (letfn [(ean-metadata [query]
                (as-> query query
                  (get-in query [:query :source-metadata])
                  (u/key-by :name query)
                  (get query "EAN")
                  (select-keys query [:name :display_name :base_type :semantic_type :id :field_ref])))]
        (let [base-query (mt/mbql-query orders
                           {:source-table $$orders
                            :joins        [{:fields       :all
                                            :source-table $$products
                                            :condition    [:= $product_id &Products.products.id]
                                            :alias        "Products"}]
                            :limit        10})]
          (testing "Make sure metadata is correct for the 'EAN' column with"
            (doseq [level (range 1 4)
                    :let  [query (mt/nest-query base-query level)]]
              (testing (format "%d level(s) of nesting" level)
                (is (= (mt/$ids products
                         {:name         "EAN"
                          :display_name "Products → Ean"
                          :base_type    :type/Text
                          :semantic_type nil
                          :id           %ean
                          :field_ref    &Products.ean})
                       (ean-metadata (add-source-metadata query))))))))))))

(deftest ignore-legacy-source-metadata-test
  (testing "Should ignore 'legacy' < 0.38.0 source metadata and recalculate it for MBQL queries (#14788)"
    ;; normally this middleware will use existing source metadata rather than recalculating it, but if we encounter <
    ;; 0.38.0 source metadata that is missing `:field_ref` and `:id` information we should ignore it.
    (mt/dataset sample-dataset
      (let [query             (mt/mbql-query orders
                                {:source-query {:source-table $$orders
                                                :joins        [{:source-table $$products
                                                                :alias         "ℙ"
                                                                :fields       :all
                                                                :condition    [:= $product_id &ℙ.products.id]}]
                                                :order-by     [[:asc $id]]
                                                :limit        2}})
            metadata          (qp/query->expected-cols query)
            ;; the actual metadata this middleware should return. Doesn't have all the columns that come back from
            ;; `qp/query->expected-cols`
            expected-metadata (for [col metadata]
                                (cond-> (dissoc col :description :source :visibility_type)
                                  ;; for some reason this middleware returns temporal fields with a `:default` unit,
                                  ;; whereas `query->expected-cols` does not return the unit. It ulimately makes zero
                                  ;; difference, so I haven't looked into why this is the case yet.
                                  (isa? (:base_type col) :type/Temporal)
                                  (update :field_ref (fn [[_ id-or-name opts]]
                                                       [:field id-or-name (assoc opts :temporal-unit :default)]))))]
        (letfn [(added-metadata [query]
                  (get-in (add-source-metadata query) [:query :source-metadata]))]
          (testing "\nShould add source metadata if there's none already"
            (is (= expected-metadata
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
              (is (= expected-metadata
                     (added-metadata (assoc-in query [:query :source-metadata] legacy-metadata)))))))))))

(deftest add-correct-metadata-fields-for-deeply-nested-source-queries-test
  (testing "Make sure we add correct `:fields` from deeply-nested source queries (#14872)"
    (mt/dataset sample-dataset
      (is (= (mt/$ids orders
               [$product_id->products.title
                [:aggregation 0]])
             (->> (mt/mbql-query orders
                    {:source-query {:source-query {:source-table $$orders
                                                   :filter       [:= $id 1]
                                                   :aggregation  [[:sum $total]]
                                                   :breakout     [!day.created_at
                                                                  $product_id->products.title
                                                                  $product_id->products.category]}
                                    :filter       [:> *sum/Float 100]
                                    :aggregation  [[:sum *sum/Float]]
                                    :breakout     [*TITLE/Text]}
                     :filter       [:> *sum/Float 100]})
                  add-source-metadata
                  :query
                  :source-metadata
                  (map :field_ref)))))))
