(ns metabase.query-processor.middleware.add-source-metadata-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [metabase
             [driver :as driver]
             [test :as mt]]
            [metabase.query-processor
             [store :as qp.store]
             [test-util :as qp.test-util]]
            [metabase.query-processor.middleware.add-source-metadata :as add-source-metadata]
            [metabase.test
             [data :as data]
             [util :as tu]]))

(defn- add-source-metadata [query]
  (driver/with-driver :h2
    (qp.store/with-store
      (qp.test-util/store-referenced-database! query)
      (qp.test-util/store-referenced-tables! query)
      (:pre (mt/test-qp-middleware add-source-metadata/add-source-metadata-for-source-queries query)))))

(defn- results-metadata [query-results]
  (for [col (-> query-results :data :cols)]
    (select-keys col [:id :table_id :name :display_name :base_type :special_type :unit :fingerprint :settings])))

(defn- venues-source-metadata
  ([]
   (venues-source-metadata :id :name :category_id :latitude :longitude :price))

  ([& field-names]
   (let [field-ids (map #(mt/id :venues (keyword (str/lower-case (name %))))
                        field-names)]
     (results-metadata
      (mt/run-mbql-query venues {:fields (for [id field-ids] [:field-id id])
                                 :limit  1})))))

(defn- metadata-from-source-query
  "`:fingerprint` and `:settings` are not usually included in `:source-metadata` if it is pulled up from a nested source
  query, so this function can be used with one of the functions above to remove those keys if applicable.

  TODO - I'm not convinced that behavior makes sense? Maybe we should change it and remove this function. "
  [ms]
  {:pre [(sequential? ms) (every? map? ms)]}
  (for [m ms]
    (reduce
     (fn [m k]
       (if (nil? (get m k))
         (dissoc m k)
         m))
     m
     [:fingerprint :settings])))

(defn- venues-source-metadata-for-field-literals
  "Metadata we'd expect to see from a `:field-literal` clause. The same as normal metadata, but field literals don't
  include special-type info."
  [& field-names]
  (for [field (apply venues-source-metadata field-names)]
    (dissoc field :special_type)))

(deftest basic-test
  (testing "Can we automatically add source metadata to the parent level of a query? If the source query has `:fields`"
    (is (= (data/mbql-query venues
             {:source-query    {:source-table $$venues
                                :fields       [$id $name]}
              :source-metadata (venues-source-metadata :id :name)})
           (add-source-metadata
            (data/mbql-query venues
              {:source-query {:source-table $$venues
                              :fields       [$id $name]}})))))

  (testing (str "Can we automatically add source metadata to the parent level of a query? If the source query does not "
                "have `:fields`")
    (is (= (data/mbql-query venues
             {:source-query    {:source-table $$venues}
              :source-metadata (venues-source-metadata)})
           (add-source-metadata
            (data/mbql-query venues
              {:source-query {:source-table $$venues}})))))

  (testing "Can we add source metadata for a source query that has breakouts/aggregations?"
    (is (= (data/mbql-query venues
             {:source-query    {:source-table $$venues
                                :aggregation  [[:count]]
                                :breakout     [$price]}
              :source-metadata (concat
                                (venues-source-metadata :price)
                                (results-metadata (mt/run-mbql-query venues {:aggregation [[:count]]})))})
           (add-source-metadata
            (data/mbql-query venues
              {:source-query {:source-table $$venues
                              :aggregation  [[:count]]
                              :breakout     [$price]}})))))

  (testing "Can we add source metadata for a source query that has an aggregation for a specific Field?"
    (is (= (data/mbql-query venues
             {:source-query    {:source-table $$venues
                                :aggregation  [[:avg $id]]
                                :breakout     [$price]}
              :source-metadata (concat
                                (venues-source-metadata :price)
                                [{:name         "avg"
                                  :display_name "Average of ID"
                                  :base_type    :type/BigInteger
                                  :special_type :type/PK
                                  :settings     nil}])})
           (add-source-metadata
            (data/mbql-query venues
              {:source-query {:source-table $$venues
                              :aggregation  [[:avg $id]]
                              :breakout     [$price]}}))))))

(defn- source-metadata [query]
  (get-in query [:query :source-metadata] query))

(deftest named-aggregations-test
  (testing "adding source metadata for source queries with named aggregations"
    (testing "w/ `:name` and `:display-name`"
      (is (= (data/mbql-query venues
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
                                    :special_type :type/PK
                                    :settings     nil}])})
             (add-source-metadata
              (data/mbql-query venues
                {:source-query {:source-table $$venues
                                :aggregation  [[:aggregation-options
                                                [:avg $id]
                                                {:name "some_generated_name", :display-name "My Cool Ag"}]]
                                :breakout     [$price]}})))))

    (testing "w/ `:name` only"
      (is (= [{:name         "some_generated_name"
               :display_name "Average of ID"
               :base_type    :type/BigInteger
               :special_type :type/PK
               :settings     nil}]
             (source-metadata
              (add-source-metadata
               (data/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :aggregation  [[:aggregation-options [:avg $id] {:name "some_generated_name"}]]}}))))))

    (testing "w/ `:display-name` only"
      (is (= [{:name         "avg"
               :display_name "My Cool Ag"
               :base_type    :type/BigInteger
               :special_type :type/PK
               :settings     nil}]
             (source-metadata
              (add-source-metadata
               (data/mbql-query venues
                 {:source-query {:source-table $$venues
                                 :aggregation  [[:aggregation-options [:avg $id] {:display-name "My Cool Ag"}]]}}))))))))

(deftest nested-sources-test
  (testing (str "Can we automatically add source metadata to the parent level of a query? If the source query has a "
                "source query with source metadata")
    (is (= (data/mbql-query venues
             {:source-query    {:source-query    {:source-table $$venues
                                                  :fields       [$id $name]}
                                :source-metadata (venues-source-metadata :id :name)}
              :source-metadata (metadata-from-source-query (venues-source-metadata :id :name))})
           (add-source-metadata
            (data/mbql-query venues
              {:source-query {:source-query    {:source-table $$venues
                                                :fields       [$id $name]}
                              :source-metadata (venues-source-metadata :id :name)}})))))

  (testing "Can we automatically add source metadata if a source-query nested 3 levels has `:source-metadata`?"
    (is (= (data/mbql-query venues
             {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                                    :fields       [$id $name]}
                                                  :source-metadata (venues-source-metadata :id :name)}
                                :source-metadata (metadata-from-source-query (venues-source-metadata :id :name))}
              :source-metadata (metadata-from-source-query (venues-source-metadata :id :name))})
           (add-source-metadata
            (data/mbql-query venues
              {:source-query
               {:source-query
                {:source-query    {:source-table $$venues
                                   :fields       [$id $name]}
                 :source-metadata (venues-source-metadata :id :name)}}})))))

  (testing "Ok, how about a source query nested 3 levels with no `source-metadata`?"
    (is (= (data/mbql-query venues
             {:source-query    {:source-query    {:source-query    {:source-table $$venues}
                                                  :source-metadata (venues-source-metadata)}
                                :source-metadata (metadata-from-source-query (venues-source-metadata))}
              :source-metadata (metadata-from-source-query (venues-source-metadata))})
           (add-source-metadata
            (data/mbql-query venues
              {:source-query {:source-query {:source-query {:source-table $$venues}}}})))))

  (testing "Ok, how about a source query nested 3 levels with no `source-metadata`, but with `fields`"
    (is (= (data/mbql-query venues
             {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                                    :fields       [$id $name]}
                                                  :source-metadata (venues-source-metadata :id :name)}
                                :source-metadata (metadata-from-source-query (venues-source-metadata :id :name))}
              :source-metadata (metadata-from-source-query (venues-source-metadata :id :name))})
           (add-source-metadata
            (data/mbql-query venues
              {:source-query {:source-query {:source-query {:source-table $$venues
                                                            :fields       [$id $name]}}}})))))

  (testing "Ok, how about a source query nested 3 levels with no `source-metadata`, but with breakouts/aggregations"
    (is (= (let [metadata (concat
                           (venues-source-metadata :price)
                           (results-metadata (mt/run-mbql-query venues {:aggregation [[:count]]})))]
             (data/mbql-query venues
               {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                                      :aggregation  [[:count]]
                                                                      :breakout     [$price]}
                                                    :source-metadata metadata}
                                  :source-metadata (metadata-from-source-query metadata)}
                :source-metadata (metadata-from-source-query metadata)}))
           (add-source-metadata
            (data/mbql-query venues
              {:source-query {:source-query {:source-query {:source-table $$venues
                                                            :aggregation  [[:count]]
                                                            :breakout     [$price]}}}})))))

  (testing "can we add `source-metadata` to the parent level if the source query has a native source query, but itself has `source-metadata`?"
    (is (= (data/mbql-query venues
             {:source-query    {:source-query    {:native "SELECT \"ID\", \"NAME\" FROM \"VENUES\";"}
                                :source-metadata (venues-source-metadata :id :name)}
              :source-metadata (metadata-from-source-query (venues-source-metadata :id :name))})
           (add-source-metadata
            (data/mbql-query venues
              {:source-query {:source-query    {:native "SELECT \"ID\", \"NAME\" FROM \"VENUES\";"}
                              :source-metadata (venues-source-metadata :id :name)}}))))))

(deftest joins-test
  (testing "should work inside JOINS as well"
    (is (= (data/mbql-query venues
             {:source-table $$venues
              :joins        [{:source-query    {:source-table $$venues
                                                :fields       [$id $name]}
                              :source-metadata (venues-source-metadata :id :name)}]})
           (add-source-metadata
            (data/mbql-query venues
              {:source-table $$venues
               :joins        [{:source-query {:source-table $$venues
                                              :fields       [$id $name]}}]}))))))

(deftest binned-fields-test
  (testing "source metadata should handle source queries that have binned fields"
    (is (= (data/mbql-query venues
             {:source-query    {:source-table $$venues
                                :aggregation  [[:count]]
                                :breakout     [[:binning-strategy $latitude :default]]}
              :source-metadata (concat
                                (venues-source-metadata :latitude)
                                (results-metadata (mt/run-mbql-query venues {:aggregation [[:count]]})))})
           (tu/with-temporary-setting-values [breakout-bin-width 5.0]
             (add-source-metadata
              (data/mbql-query venues
                {:source-query
                 {:source-table $$venues
                  :aggregation  [[:count]]
                  :breakout     [[:binning-strategy $latitude :default]]}})))))))
