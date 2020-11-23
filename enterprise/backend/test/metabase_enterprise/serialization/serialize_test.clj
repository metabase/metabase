(ns metabase-enterprise.serialization.serialize-test
  (:require [clojure
             [string :as str]
             [test :refer :all]]
            [metabase-enterprise.serialization
             [serialize :as serialize]
             [test-util :as ts]]
            [metabase.models :refer [Card Collection Dashboard Database Field Metric Segment Table]]))

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

(deftest serialization-test
  (ts/with-world
    (letfn [(test-serialization [model id]
              (testing (name model)
                (is (valid-serialization? (serialize/serialize (model id))))))]
      (doseq [[model id] [[Card card-id]
                          [Metric metric-id]
                          [Segment segment-id]
                          [Collection collection-id]
                          [Dashboard dashboard-id]
                          [Table table-id]
                          [Field numeric-field-id]
                          [Database db-id]]]
        (test-serialization model id)))))
