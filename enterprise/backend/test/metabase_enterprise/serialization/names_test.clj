(ns metabase-enterprise.serialization.names-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.serialization.names :as names]
   [metabase-enterprise.serialization.test-util :as ts]
   [metabase.models :refer [Card Collection Dashboard Database Field LegacyMetric NativeQuerySnippet Segment Table]]
   [metabase.test :as mt]
   [metabase.util :as u]
   [toucan2.core :as t2]))

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
    (doseq [object [(t2/select-one Card :id card-id-root)
                    (t2/select-one Card :id card-id)
                    (t2/select-one Card :id card-id-nested)
                    (t2/select-one Table :id table-id)
                    (t2/select-one Field :id category-field-id)
                    (t2/select-one LegacyMetric :id metric-id)
                    (t2/select-one Segment :id segment-id)
                    (t2/select-one Collection :id collection-id)
                    (t2/select-one Collection :id collection-id-nested)
                    (t2/select-one Dashboard :id dashboard-id)
                    (t2/select-one Database :id db-id)
                    (t2/select-one NativeQuerySnippet :id snippet-id)]]
      (testing (class object)
        (let [context (names/fully-qualified-name->context (names/fully-qualified-name object))
              id-fn   (some-fn :snippet :field :metric :segment :card :dashboard :collection :table :database)]
          (is (= (u/the-id object)
                 (id-fn context))))))))

(deftest fully-qualified-name->context-test
  (testing "fully-qualified-name->context works as expected"
    (testing " with cards in root and in a collection"
      (mt/with-temp [Collection {collection-id :id :as coll} {:name "A Collection" :location "/"}
                     Card       root-card {:name "Root Card"}
                     Card       collection-card {:name         "Collection Card"
                                                 :collection_id collection-id}
                     Collection {sub-collection-id :id :as coll2} {:name "Sub Collection"
                                                                   :location (format "/%d/" collection-id)}
                     Collection coll3 {:name "Deep Collection"
                                       :location (format "/%d/%d/"
                                                         collection-id
                                                         sub-collection-id)}]
        (let [card1-name "/collections/root/cards/Root Card"
              card2-name "/collections/root/collections/A Collection/cards/Collection Card"
              coll-name  "/collections/root/collections/A Collection"
              coll2-name "/collections/root/collections/A Collection/collections/Sub Collection"
              coll3-name (str "/collections/root/collections/A Collection/collections/Sub Collection/collections"
                              "/Deep Collection")]
          (is (= card1-name (names/fully-qualified-name root-card)))
          (is (= card2-name (names/fully-qualified-name collection-card)))
          (is (= coll-name (names/fully-qualified-name coll)))
          (is (= coll2-name (names/fully-qualified-name coll2)))
          (is (= coll3-name (names/fully-qualified-name coll3))))))
    (testing " with snippets in a collection"
      (mt/with-temp [Collection {base-collection-id :id} {:name "Base Collection"
                                                          :namespace "snippets"}
                     Collection {collection-id :id}      {:name "Nested Collection"
                                                          :location (format "/%s/" base-collection-id)
                                                          :namespace "snippets"}
                     NativeQuerySnippet snippet {:content "price > 2"
                                                 :name "Price > 2"
                                                 :description "Price more than 2"
                                                 :collection_id collection-id}]
        (let [fully-qualified-name (str "/collections/root/collections/:snippets/Base Collection/collections"
                                        "/:snippets/Nested Collection/snippets/Price %3E 2")]
          (is (= fully-qualified-name
                 (names/fully-qualified-name snippet)))
          (is (= {:collection collection-id
                  :snippet    (u/the-id snippet)}
                 (names/fully-qualified-name->context fully-qualified-name))))))
    (testing " with path elements matching one of our entity names"
      ; these drivers keep table names lowercased, causing "users" table to clash with our entity name "users"
      (mt/test-drivers #{:postgres :mysql}
        (ts/with-world
          (let [users-pk-field (t2/select-one Field :id users-pk-field-id)
                fq-name        (names/fully-qualified-name users-pk-field)
                ctx            (names/fully-qualified-name->context fq-name)]
            ;; MySQL doesn't have schemas, so either one of these could be acceptable
            (is (contains? #{"/databases/Fingerprint test-data copy/tables/users/fields/id"
                             "/databases/Fingerprint test-data copy/schemas/public/tables/users/fields/id"} fq-name))
            (is (map? ctx))
            (is (some? (:table ctx)))))))))

(deftest name-for-logging-test
  (testing "serialization logging name generation from Toucan 2 records (#29322)"
    (mt/with-temp [Collection {collection-id :id} {:name         "A Collection"}
                   Card       {card-id :id}       {:name         "A Card"
                                                   :collection_id collection-id}]
      (are [model s id] (= (format s id) (names/name-for-logging (t2/select-one model :id id)))
        'Collection ":model/Collection \"A Collection\" (ID %d)" collection-id
        'Card       ":model/Card \"A Card\" (ID %d)" card-id))))
