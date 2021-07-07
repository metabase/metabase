(ns metabase-enterprise.serialization.serialize-test
  (:require [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase-enterprise.serialization.serialize :as serialize]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase.models :refer [Card Collection Dashboard Database Field Metric NativeQuerySnippet Segment
                                     Table]]))

(defn- all-ids-are-fully-qualified-names?
  [m]
  (testing (format "\nm = %s" (pr-str m))
    (doseq [[k v] m
            :when (and v (-> k name (str/ends-with? "_id")))]
      (testing (format "\nk = %s" (pr-str k))
        (is (string? v))))))

(defn- all-mbql-ids-are-fully-qualified-names?
  [[_ & ids]]
  (testing (format "\nids = %s" (pr-str ids))
    (doseq [id ids]
      (cond (map? id) (all-ids-are-fully-qualified-names? id)
            (some? id) (is (string? id))))))

(deftest serialization-test
  (ts/with-world
    (doseq [[model id] [[Card card-id]
                        [Metric metric-id]
                        [Segment segment-id]
                        [Collection collection-id]
                        [Dashboard dashboard-id]
                        [Table table-id]
                        [Field numeric-field-id]
                        [Database db-id]
                        [NativeQuerySnippet snippet-id]]]
      (testing (name model)
        (let [serialization (serialize/serialize (model id))]
          (testing (format "\nserialization = %s" (pr-str serialization))
            (doseq [x (->> serialization
                           (tree-seq coll? identity)
                           (filter (some-fn map? #'serialize/mbql-entity-reference?)))]
              (if (map? x)
                (all-ids-are-fully-qualified-names? x)
                (all-mbql-ids-are-fully-qualified-names? x)))))))))
