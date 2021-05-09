(ns metabase-enterprise.serialization.names-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.serialization.names :as names]
            [metabase-enterprise.serialization.test-util :as ts]
            [metabase.models :refer [Card Collection Dashboard Database Field Metric Segment Table]]
            [metabase.util :as u]))

(deftest safe-name-test
  (are [s expected] (= (names/safe-name {:name s}) expected)
    "foo"         "foo"
    "foo/bar baz" "foo%2Fbar baz"))

(deftest unescape-name-test
  (are [s expected] (= expected
                       (names/unescape-name s))
    "foo"           "foo"
    "foo%2Fbar baz" "foo/bar baz"))

(deftest safe-name-unescape-name-test
 (is (= "foo/bar baz"
        (-> {:name "foo/bar baz"} names/safe-name names/unescape-name))))

(deftest roundtrip-test
  (ts/with-world
    (doseq [object [(Card card-id-root)
                    (Card card-id)
                    (Card card-id-nested)
                    (Table table-id)
                    (Field category-field-id)
                    (Metric metric-id)
                    (Segment segment-id)
                    (Collection collection-id)
                    (Collection collection-id-nested)
                    (Dashboard dashboard-id)
                    (Database db-id)]]
      (testing (class object)
        (let [context (names/fully-qualified-name->context (names/fully-qualified-name object))]
          (is (= (u/the-id object)
                 ((some-fn :field :metric :segment :card :dashboard :collection :table :database) context))))))))
