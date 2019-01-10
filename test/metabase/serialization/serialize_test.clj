(ns metabase.serialization.serialize-test
  (:require [clojure.string :as str]
            [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [database :refer [Database]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.serialization.serialize :refer :all :as serialize]
            [metabase.test
             [data :as data]
             [serialization :as ts]]))

(defn- all-ids-are-fully-qualified-names?
  [m]
  (every? string? (for [[k v] m
                        :when (and v (-> k name (str/ends-with? "_id")))]
                    v)))

(defn- all-mbql-ids-are-fully-qualified-names?
  [[_ & ids]]
  (every? string? ids))

(defn- valid-serialization?
  [s]
  (->> s
       (tree-seq coll? identity)
       (filter (some-fn map? #'serialize/mbql-entity-reference?))
       (every? (fn [x]
                 (if (map? x)
                   (all-ids-are-fully-qualified-names? x)
                   (all-mbql-ids-are-fully-qualified-names? x))))))

(def ^:private test-serialization (comp valid-serialization? serialize))

(expect
  (ts/with-world
    (test-serialization (Card card-id))))
(expect
  (ts/with-world
    (test-serialization (Metric metric-id))))
(expect
  (ts/with-world
    (test-serialization (Segment segment-id))))
(expect
  (ts/with-world
    (test-serialization (Collection collection-id))))
(expect
  (test-serialization (Table (data/id :venues))))
(expect
  (test-serialization (Field (data/id :venues :category_id))))
(expect
  (test-serialization (Database (data/id))))
