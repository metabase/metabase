(ns metabase.query-processor.middleware.add-source-metadata-test
  (:require [clojure.string :as str]
            [expectations :refer [expect]]
            [metabase.driver :as driver]
            [metabase.models.field :refer [Field]]
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
                         :display_name "average of ID"
                         :base_type    :type/BigInteger
                         :special_type :type/PK
                         :settings     nil}])})
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
                         :special_type :type/PK
                         :settings     nil}])})
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
     :source-metadata (venues-source-metadata :id :name)})
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
                       :source-metadata (venues-source-metadata :id :name)}
     :source-metadata (venues-source-metadata :id :name)})
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
                         :source-metadata (venues-source-metadata)}
       :source-metadata (venues-source-metadata)})
    (add-source-metadata
     (data/mbql-query venues
       {:source-query {:source-query {:source-query {:source-table $$venues}}}})))

;; Ok, how about a source query nested 3 levels with no `source-metadata`, but with `fields`
(expect
  (data/mbql-query venues
    {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                           :fields       [$id $name]}
                                         :source-metadata (venues-source-metadata :id :name)}
                       :source-metadata (venues-source-metadata :id :name)}
     :source-metadata (venues-source-metadata :id :name)})
  (add-source-metadata
   (data/mbql-query venues
     {:source-query {:source-query {:source-query {:source-table $$venues
                                                   :fields       [$id $name]}}}})))

;; Ok, how about a source query nested 3 levels with no `source-metadata`, but with breakouts/aggregations
(expect
  (let [metadata (concat
                  (venues-source-metadata :price)
                  [{:name         "count"
                    :display_name "count"
                    :base_type    :type/Integer
                    :special_type :type/Number}])]
    (data/mbql-query venues
      {:source-query    {:source-query    {:source-query    {:source-table $$venues
                                                             :aggregation  [[:count]]
                                                             :breakout     [$price]}
                                           :source-metadata metadata}
                         :source-metadata metadata}
       :source-metadata metadata}))
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
     :source-metadata (venues-source-metadata :id :name)})
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
