(ns metabase.query-processor.middleware.add-source-metadata-test
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [medley.core :as m]
            [metabase.driver :as driver]
            [metabase.query-processor
             [store :as qp.store]
             [test-util :as qp.test-util]]
            [metabase.query-processor.middleware.add-source-metadata :as add-source-metadata]
            [metabase.test.data :as data]))

(defn- add-source-metadata [query]
  (driver/with-driver :h2
    (qp.store/with-store
      (qp.test-util/store-referenced-database! query)
      (qp.test-util/store-referenced-tables! query)
      ((add-source-metadata/add-source-metadata-for-source-queries identity) query))))

(def ^:private venues-metadata
  (m/map-vals
   (partial zipmap [:name :display_name :base_type :special_type])
   {:id          ["ID"          "ID"          :type/BigInteger :type/PK]
    :name        ["NAME"        "Name"        :type/Text       :type/Name]
    :category_id ["CATEGORY_ID" "Category ID" :type/Integer    :type/FK]
    :latitude    ["LATITUDE"    "Latitude"    :type/Float      :type/Latitude]
    :longitude   ["LONGITUDE"   "Longitude"   :type/Float      :type/Longitude]
    :price       ["PRICE"       "Price"       :type/Integer    :type/Category]}))

(defn- venues-source-metadata
  ([]
   (venues-source-metadata :id :name :category_id :latitude :longitude :price))

  ([& field-names]
   (for [field-name field-names]
     (venues-metadata (keyword (str/lower-case (name field-name)))))))

(def ^:private ^{:arglists (:arglists (meta #'venues-source-metadata))} venues-source-metadata-for-field-literals
  ;; field literals don't include special-type info
  (comp (partial map #(dissoc % :special_type)) venues-source-metadata))

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
    {:source-query {:source-table $$venues}
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
                         :display_name "count"
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
                         :display_name "avg"
                         :base_type    :type/BigInteger
                         :special_type :type/PK}])})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-table $$venues
                     :aggregation  [[:avg $id]]
                     :breakout     [$price]}})))

;; Can we add source metadata for a source query that has a named aggregation?
(expect
  (data/mbql-query venues
    {:source-query    {:source-table $$venues
                       :aggregation  [[:named [:avg $id] "my_cool_aggregation"]]
                       :breakout     [$price]}
     :source-metadata (concat
                       (venues-source-metadata :price)
                       [{:name         "my_cool_aggregation"
                         :display_name "my_cool_aggregation"
                         :base_type    :type/BigInteger
                         :special_type :type/PK}])})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-table $$venues
                     :aggregation  [[:named [:avg $id] "my_cool_aggregation"]]
                     :breakout     [$price]}})))

;; Can we automatically add source metadata to the parent level of a query? If the source query has a source query
;; with source metadata
(expect
  (data/mbql-query venues
    {:source-query    {:source-query    {:source-table $$venues
                                         :fields       [$id $name]}
                       :source-metadata (venues-source-metadata :id :name)}
     :source-metadata (venues-source-metadata-for-field-literals :id :name)})
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
                       :source-metadata (venues-source-metadata-for-field-literals :id :name)}
     :source-metadata (venues-source-metadata-for-field-literals :id :name)})
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
                         :source-metadata (venues-source-metadata-for-field-literals)}
       :source-metadata (venues-source-metadata-for-field-literals)})
    (add-source-metadata
     (data/mbql-query venues
       {:source-query {:source-query {:source-query {:source-table $$venues}}}})))

;; Ok, how about a source query nested 3 levels with no `source-metadata`, but with `fields`
(expect
  (data/mbql-query venues
    {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                           :fields       [$id $name]}
                                         :source-metadata (venues-source-metadata :id :name)}
                       :source-metadata (venues-source-metadata-for-field-literals :id :name)}
     :source-metadata (venues-source-metadata-for-field-literals :id :name)})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-query {:source-query {:source-table $$venues
                                                   :fields       [$id $name]}}}})))

;; Ok, how about a source query nested 3 levels with no `source-metadata`, but with breakouts/aggregations
(expect
  (data/mbql-query venues
    {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                           :aggregation  [[:count]]
                                                           :breakout     [$price]}
                                         :source-metadata (concat
                                                           (venues-source-metadata :price)
                                                           [{:name         "count"
                                                             :display_name "count"
                                                             :base_type    :type/Integer
                                                             :special_type :type/Number}])}
                       :source-metadata (concat
                                         (venues-source-metadata-for-field-literals :price)
                                         [{:name "count", :display_name "Count", :base_type :type/Integer}])}
     :source-metadata (concat
                       (venues-source-metadata-for-field-literals :price)
                       [{:name "count", :display_name "Count", :base_type :type/Integer}])})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-query {:source-query {:source-table $$venues
                                                   :aggregation  [[:count]]
                                                   :breakout     [$price]}}}})))

;; can we add source-metadata to the parent level if the source query has a native source query, but has
;; `source-metadata`?
(expect
  (data/mbql-query venues
    {:source-query    {:source-query    {:native "SELECT \"ID\", \"NAME\" FROM \"VENUES\";"}
                       :source-metadata (venues-source-metadata :id :name)}
     :source-metadata (venues-source-metadata-for-field-literals :id :name)})
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
