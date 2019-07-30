(ns metabase.query-processor.middleware.add-source-metadata-test
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.models.field :refer [Field]]
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
      ((add-source-metadata/add-source-metadata-for-source-queries identity) query))))

(defn- venues-metadata [field-name]
  (select-keys
   (Field (data/id :venues field-name))
   [:id :table_id :name :display_name :base_type :special_type :unit :fingerprint :settings]))

(defn- venues-source-metadata
  ([]
   (venues-source-metadata :id :name :category_id :latitude :longitude :price))

  ([& field-names]
   (for [field-name field-names]
     (venues-metadata (keyword (str/lower-case (name field-name)))))))

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

;; Can we automatically add source metadata to the parent level of a query? If the source query has `:fields`
(expect
  (data/mbql-query venues
    {:source-query    {:source-table $$venues
                       :fields       [$id $name]}
     :source-metadata (venues-source-metadata :id :name)})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-table $$venues
                     :fields       [$id $name]}})))

;; Can we automatically add source metadata to the parent level of a query? If the source query does not have `:fields`
(expect
  (data/mbql-query venues
    {:source-query    {:source-table $$venues}
     :source-metadata (venues-source-metadata)})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-table $$venues}})))

;; Can we add source metadata for a source query that has breakouts/aggregations?
(expect
  (data/mbql-query venues
    {:source-query    {:source-table $$venues
                       :aggregation  [[:count]]
                       :breakout     [$price]}
     :source-metadata (concat
                       (venues-source-metadata :price)
                       [{:name         "count"
                         :display_name "Count"
                         :base_type    :type/Integer
                         :special_type :type/Number}])})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-table $$venues
                     :aggregation  [[:count]]
                     :breakout     [$price]}})))

;; Can we add source metadata for a source query that has an aggregation for a specific Field?
(expect
  (data/mbql-query venues
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
                     :breakout     [$price]}})))

;; Can we add source metadata for a source query that has a named aggregation? (w/ `:name` and `:display-name`)
(expect
  (data/mbql-query venues
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
                     :breakout     [$price]}})))

(defn- source-metadata [query]
  (get-in query [:query :source-metadata] query))

;; Can we add source metadata for a source query that has a named aggregation? (w/ `:name` only)
(expect
  [{:name         "some_generated_name"
    :display_name "Average of ID"
    :base_type    :type/BigInteger
    :special_type :type/PK
    :settings     nil}]
  (source-metadata
   (add-source-metadata
    (data/mbql-query venues
      {:source-query {:source-table $$venues
                      :aggregation  [[:aggregation-options [:avg $id] {:name "some_generated_name"}]]}}))))

;; Can we add source metadata for a source query that has a named aggregation? (w/ `:display-name` only)
(expect
  [{:name         "avg"
    :display_name "My Cool Ag"
    :base_type    :type/BigInteger
    :special_type :type/PK
    :settings     nil}]
  (source-metadata
   (add-source-metadata
    (data/mbql-query venues
      {:source-query {:source-table $$venues
                      :aggregation  [[:aggregation-options [:avg $id] {:display-name "My Cool Ag"}]]}}))))

;; Can we automatically add source metadata to the parent level of a query? If the source query has a source query
;; with source metadata
(expect
  (data/mbql-query venues
    {:source-query    {:source-query    {:source-table $$venues
                                         :fields       [$id $name]}
                       :source-metadata (venues-source-metadata :id :name)}
     :source-metadata (metadata-from-source-query (venues-source-metadata :id :name))})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-query    {:source-table $$venues
                                       :fields       [$id $name]}
                     :source-metadata (venues-source-metadata :id :name)}})))

;; Can we automatically add source metadata if a source-query nested 3 levels has `:source-metadata`?
(expect
  (data/mbql-query venues
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
        :source-metadata (venues-source-metadata :id :name)}}})))

;; Ok, how about a source query nested 3 levels with no `source-metadata`?
  (expect
    (data/mbql-query venues
      {:source-query    {:source-query    {:source-query    {:source-table $$venues}
                                           :source-metadata (venues-source-metadata)}
                         :source-metadata (metadata-from-source-query (venues-source-metadata))}
       :source-metadata (metadata-from-source-query (venues-source-metadata))})
    (add-source-metadata
     (data/mbql-query venues
       {:source-query {:source-query {:source-query {:source-table $$venues}}}})))

;; Ok, how about a source query nested 3 levels with no `source-metadata`, but with `fields`
(expect
  (data/mbql-query venues
    {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                           :fields       [$id $name]}
                                         :source-metadata (venues-source-metadata :id :name)}
                       :source-metadata (metadata-from-source-query (venues-source-metadata :id :name))}
     :source-metadata (metadata-from-source-query (venues-source-metadata :id :name))})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-query {:source-query {:source-table $$venues
                                                   :fields       [$id $name]}}}})))

;; Ok, how about a source query nested 3 levels with no `source-metadata`, but with breakouts/aggregations
(expect
  (let [metadata (concat
                  (venues-source-metadata :price)
                  [{:name         "count"
                    :display_name "Count"
                    :base_type    :type/Integer
                    :special_type :type/Number}])]
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
                                                   :breakout     [$price]}}}})))

;; can we add `source-metadata` to the parent level if the source query has a native source query, but itself has
;; `source-metadata`?
(expect
  (data/mbql-query venues
    {:source-query    {:source-query    {:native "SELECT \"ID\", \"NAME\" FROM \"VENUES\";"}
                       :source-metadata (venues-source-metadata :id :name)}
     :source-metadata (metadata-from-source-query (venues-source-metadata :id :name))})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-query    {:native "SELECT \"ID\", \"NAME\" FROM \"VENUES\";"}
                     :source-metadata (venues-source-metadata :id :name)}})))

;; should work inside JOINS as well
(expect
  (data/mbql-query venues
    {:source-table $$venues
     :joins        [{:source-query    {:source-table $$venues
                                       :fields       [$id $name]}
                     :source-metadata (venues-source-metadata :id :name)}]})
  (add-source-metadata
   (data/mbql-query venues
     {:source-table $$venues
      :joins        [{:source-query {:source-table $$venues
                                     :fields       [$id $name]}}]})))

;; source metadata should handle source queries that have binned fields
(expect
  (data/mbql-query venues
    {:source-query    {:source-table $$venues
                       :aggregation  [[:count]]
                       :breakout     [[:binning-strategy $latitude :default]]}
     :source-metadata (concat
                       (venues-source-metadata :latitude)
                       [{:name         "count"
                         :display_name "Count"
                         :base_type    :type/Integer
                         :special_type :type/Number}])})
  (tu/with-temporary-setting-values [breakout-bin-width 5.0]
    (add-source-metadata
     (data/mbql-query venues
       {:source-query
        {:source-table $$venues
         :aggregation  [[:count]]
         :breakout     [[:binning-strategy $latitude :default]]}}))))
