(ns metabase-enterprise.serialization.names-test
  (:require [expectations :refer :all]
            [metabase
             [models :refer [Card Collection Dashboard Database Field Metric Segment Table]]
             [util :as u]]
            [metabase-enterprise.serialization
             [names :as names :refer :all]
             [test-util :as ts]]))

(expect
  (= (safe-name {:name "foo"}) "foo"))
(expect
  (= (safe-name {:name "foo/bar baz"}) "foo%2Fbar baz"))

(expect
  (= (unescape-name "foo") "foo"))
(expect
  (= (unescape-name "foo%2Fbar baz") "foo/bar baz"))

(expect
  (let [n "foo/bar baz"]
    (= (-> {:name n} safe-name unescape-name (= n)))))

(defn- test-fully-qualified-name-roundtrip
  [entity]
  (let [context (fully-qualified-name->context (fully-qualified-name entity))]
    (= (u/get-id entity) ((some-fn :field :metric :segment :card :dashboard :collection :table :database) context))))

(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Card card-id-root))))
(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Card card-id))))
(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Card card-id-nested))))

(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Table table-id))))

(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Field category-field-id))))

(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Metric metric-id))))

(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Segment segment-id))))

(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Collection collection-id))))
(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Collection collection-id-nested))))

(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Dashboard dashboard-id))))

(expect
  (ts/with-world
    (test-fully-qualified-name-roundtrip (Database db-id))))
