(ns metabase.collections.db-test
  "Tests that the values these queries filter on are bound as parameters rather than compiled into the SQL, so a
  value that looks like SQL matches nothing instead of changing the statement."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.db :as collections.db]
   [metabase.collections.schema :as collections.schema]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest collection-of-type-test
  (testing "the type is compared as a value"
    ;; The Trash is a singleton the app DB always holds, so it is what a "trash" lookup finds.
    (is (= collections.schema/trash-collection-type
           (:type (collections.db/collection-of-type collections.schema/trash-collection-type)))))
  (testing "a type that looks like SQL matches nothing rather than being compiled"
    (is (nil? (collections.db/collection-of-type "trash' OR '1'='1")))))

(deftest collections-in-namespace-test
  (mt/with-temp [:model/Collection _ {:name "Snippets" :namespace "snippets"}]
    (testing "the namespace is compared as a value"
      (is (= ["Snippets"] (map :name (collections.db/collections-in-namespace "snippets")))))
    (testing "a namespace that looks like SQL matches nothing"
      (is (empty? (collections.db/collections-in-namespace "snippets' OR '1'='1"))))))

(deftest collection-ids-with-location-like-test
  (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent"}
                 :model/Collection child {:name "Child" :location (format "/%d/" parent-id)}]
    (testing "the LIKE pattern is bound, and still matches as a pattern"
      (is (contains? (collections.db/collection-ids-with-location-like (format "/%d/%%" parent-id))
                     (:id child))))
    (testing "a pattern that looks like SQL matches nothing rather than being compiled"
      (is (empty? (collections.db/collection-ids-with-location-like "/1/%' OR '1'='1"))))))

(deftest collection-ids-of-type-test
  (mt/with-temp [:model/Collection {coll-id :id} {:name "Typed" :type "instance-analytics"}]
    (testing "the type is compared as a value alongside coerced ids"
      (is (contains? (collections.db/collection-ids-of-type [coll-id] "instance-analytics") coll-id)))
    (testing "a type that looks like SQL matches nothing"
      (is (empty? (collections.db/collection-ids-of-type [coll-id] "instance-analytics' OR '1'='1"))))))

(deftest group-ids-with-permission-object-test
  (testing "a permission object that looks like SQL matches nothing rather than being compiled"
    (is (empty? (collections.db/group-ids-with-permission-object "/collection/1/read/' OR '1'='1"))))
  (testing "a real permission object still matches"
    (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                   :model/Collection {collection-id :id} {}]
      (let [object (format "/collection/%d/read/" collection-id)]
        (mt/with-temp [:model/Permissions _ {:group_id group-id :object object}]
          (is (contains? (collections.db/group-ids-with-permission-object object) group-id)))))))

(deftest child-collection-ids-test
  (mt/with-temp [:model/Collection {parent-id :id} {:name "Parent"}
                 :model/Collection child {:name "Child" :location (format "/%d/" parent-id)}]
    (let [location (format "/%d/" parent-id)
          trash    collections.schema/trash-collection-type]
      (testing "the location and trash type are compared as values"
        (is (contains? (collections.db/child-collection-ids location trash false) (:id child))))
      (testing "a location that looks like SQL matches nothing"
        (is (empty? (collections.db/child-collection-ids "/1/' OR '1'='1" trash false)))))))

(deftest update!-conditions-maps-filter-rather-than-naming-a-where-column
  (testing "clear-remote-synced-flags! clears only the remote-synced rows"
    (mt/with-temp [:model/Collection {a :id} {:is_remote_synced true}
                   :model/Collection {b :id} {:is_remote_synced false}]
      (is (pos? (collections.db/clear-remote-synced-flags!)))
      (is (false? (boolean (t2/select-one-fn :is_remote_synced :model/Collection :id a))))
      (is (false? (boolean (t2/select-one-fn :is_remote_synced :model/Collection :id b)))))))
