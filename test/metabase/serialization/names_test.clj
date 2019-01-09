(ns metabase.serialization.names-test
  (:require [expectations :refer :all]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [field :refer [Field]]
             [metric :refer [Metric]]
             [segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.serialization.names :refer :all :as names]
            [metabase.test
             [data :as data]
             [serialization :as ts]]
            [metabase.util :as u]))

(expect
  (= (safe-name {:name "foo"}) "foo"))
(expect
  (= (safe-name {:name "foo/bar"}) "foo⁄bar"))

(expect
  (= (unescape-name "foo") "foo"))
(expect
  (= (unescape-name "foo⁄bar") "foo/bar"))

(expect
  (let [n "foo/bar"]
    (= (-> {:name n} safe-name unescape-name (= n)))))


(defn- test-fully-qualified-name-roundtrip
  [entity]
  (let [context (fully-qualified-name->context (fully-qualified-name entity))]
    (= (u/get-id entity) ((some-fn :field :metric :segment :card :collection :table) context))))

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
  (test-fully-qualified-name-roundtrip (Table (data/id :venues))))

(expect
  (test-fully-qualified-name-roundtrip (Field (data/id :venues :category_id))))

(expect
  (test-fully-qualified-name-roundtrip (Table (data/id :venues))))

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
