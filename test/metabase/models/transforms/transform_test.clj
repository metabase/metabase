(ns metabase.models.transforms.transform-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(deftest source-database-id-set-test
  (testing "inserting a transform correctly sets the source-database-id column"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  "query"
                             :query {:database (mt/id)
                                     :type     "native"
                                     :native   {:query "SELECT 1"}}}}]
      (is (= (mt/id) (:source_database_id transform)))))
  (testing "updating a transform correctly sets the source-database-id column"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source_database_id (mt/id)
                    :source {:type  "query"
                             :query {:database (mt/id)
                                     :type     "native"
                                     :native   {:query "SELECT 1"}}}}]
      (is (= (mt/id) (:source_database_id transform))))))

(deftest no-events-during-deserialization-test
  (testing "Transform lifecycle hooks do not publish events during deserialization"
    (let [events-published (atom [])
          source           {:type  "query"
                            :query {:database (mt/id)
                                    :type     "native"
                                    :native   {:query "SELECT 1"}}}]
      (with-redefs [events/publish-event! (fn [topic event]
                                            (swap! events-published conj [topic event]))]
        (testing "events fire normally for insert/update/delete"
          (mt/with-temp [:model/Transform {transform-id :id} {:name "Test Transform" :source source}]
            (is (some #(= :event/create-transform (first %)) @events-published))
            (reset! events-published [])
            (t2/update! :model/Transform transform-id {:name "Updated Name"})
            (is (some #(= :event/update-transform (first %)) @events-published))
            (reset! events-published [])
            (t2/delete! :model/Transform transform-id)
            (is (some #(= :event/delete-transform (first %)) @events-published))))
        (reset! events-published [])
        (testing "events are suppressed during deserialization"
          (binding [mi/*deserializing?* true]
            (mt/with-temp [:model/Transform {transform-id :id} {:name "Deserialized Transform" :source source}]
              (t2/update! :model/Transform transform-id {:name "Deserialized Update"})
              (t2/delete! :model/Transform transform-id)))
          (is (empty? @events-published)))))))

(deftest write-checks-the-databases-the-instance-will-touch-test
  (testing "can-write? derives the databases from the instance being saved, not from its stored columns"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Database {allowed-db :id}   {}
                     :model/Database {forbidden-db :id} {}
                     :model/Transform transform {:name   "T"
                                                 :source {:type  "query"
                                                          :query {:database allowed-db
                                                                  :type     "native"
                                                                  :native   {:query "SELECT 1"}}}}]
        (let [stored (t2/select-one :model/Transform (:id transform))]
          (is (= allowed-db (:source_database_id stored)))
          (with-redefs [perms/has-db-transforms-permission?
                        (fn [_user-id db-id] (= db-id allowed-db))]
            (mt/with-current-user (mt/user->id :rasta)
              (with-redefs [api/is-data-analyst? (constantly true)]
                (testing "leaving the source alone is writable"
                  (is (mi/can-write? stored)))
                (testing "repointing the source at a database without transforms permission is not"
                  (is (not (mi/can-write?
                            (assoc stored :source {:type  "query"
                                                   :query {:database forbidden-db
                                                           :type     "native"
                                                           :native   {:query "SELECT 1"}}})))))))))))))

(deftest source-references-gate-transform-permissions-test
  (testing "A Card the source query names is required to read, write or create the transform"
    (mt/with-premium-features #{:transforms-basic :hosting}
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}
                     :model/Collection collection {}
                     :model/Card {card-id :id}
                     {:collection_id (:id collection)
                      :database_id   (mt/id)
                      :dataset_query (lib/query (mt/metadata-provider)
                                                (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}
                     :model/Transform transform
                     {:name   "Reads a Card"
                      :source {:type  "query"
                               :query {:database (mt/id)
                                       :type     "native"
                                       :native   {:query         (format "SELECT * FROM {{#%d}} AS c" card-id)
                                                  :template-tags {(str "#" card-id)
                                                                  {:id           (str "#" card-id)
                                                                   :name         (str "#" card-id)
                                                                   :display-name (str "#" card-id)
                                                                   :type         :card
                                                                   :card-id      card-id}}}}}}]
        (mt/with-non-admin-groups-no-collection-perms collection
          (let [stored (t2/select-one :model/Transform (:id transform))
                body   (into {} stored)]
            (mt/with-data-analyst-role! (mt/user->id :rasta)
              (mt/with-restored-data-perms!
                (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
                (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder-and-native)
                (data-perms/set-database-permission! group-id (mt/id) :perms/transforms :yes)
                (testing "while the Card is unreadable"
                  (mt/with-current-user (mt/user->id :rasta)
                    (is (not (mi/can-read? stored)))
                    (is (not (mi/can-write? stored)))
                    (is (not (mi/can-create? :model/Transform body)))))
                (perms/grant-collection-read-permissions! group-id collection)
                (testing "once the Card is readable"
                  (mt/with-current-user (mt/user->id :rasta)
                    (is (mi/can-read? stored))
                    (is (mi/can-write? stored))
                    (is (mi/can-create? :model/Transform body))))))))))))
