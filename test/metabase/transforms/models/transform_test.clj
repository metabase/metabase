(ns metabase.transforms.models.transform-test
  (:require
   [clojure.test :refer :all]
   [metabase.events.core :as events]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.transforms-base.query :as transforms-base.query]
   [metabase.transforms.query-test-util :as query-test-util]
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
  (testing "A transform with no source database has a nil source_database_id"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type "python"
                             :body "print(\"hello\")"}}]
      (is (nil? (:source_database_id transform)))))
  (testing "updating a transform recomputes the source-database-id column from the source"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type "python"
                             :body "print(\"hello\")"}}]
      (is (nil? (:source_database_id transform)))
      (t2/update! :model/Transform (:id transform) {:source {:type  "query"
                                                             :query {:database (mt/id)
                                                                     :type     "native"
                                                                     :native   {:query "SELECT 1"}}}})
      (is (= (mt/id) (t2/select-one-fn :source_database_id :model/Transform (:id transform)))))))

(deftest source-database-deletion-sets-null-test
  (testing "deleting a database referenced by a transform nulls the transform's source_database_id (ON DELETE SET NULL)"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  "query"
                             :query {:database db-id
                                     :type     "native"
                                     :native   {:query "SELECT 1"}}}}]
      (is (= db-id (:source_database_id transform)))
      (t2/delete! :model/Database db-id)
      (is (nil? (t2/select-one-fn :source_database_id :model/Transform (:id transform))))
      ;; transform itself still exists
      (is (some? (t2/select-one :model/Transform (:id transform)))))))

(defn- temp-transform-with-index! [thunk]
  (mt/with-temp [:model/Transform {transform-id :id}
                 {:name   (mt/random-name)
                  :source {:type "query" :query (query-test-util/make-query :source-table "venues")}
                  :target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}}
                 :model/TableIndex {index-id :id}
                 {:transform_id transform-id
                  :index_name   "by_cat"
                  :status       :succeeded
                  :structured   {:kind :btree :name "by_cat" :columns [{:name "category"}]}}]
    (thunk transform-id index-id)))

(deftest revalidate-indexes-on-schema-change-test
  (testing "editing the source query (output schema may change) marks the transform's managed indexes for revalidation"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (t2/update! :model/Transform transform-id
                   {:source {:type "query" :query (query-test-util/make-query :source-table "checkins")}})
       (is (= :update-pending (t2/select-one-fn :status :model/TableIndex index-id))))))
  (testing "retargeting to a different table marks the transform's managed indexes for revalidation"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (t2/update! :model/Transform transform-id
                   {:target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})
       (is (= :update-pending (t2/select-one-fn :status :model/TableIndex index-id))))))
  (testing "an unrelated edit (renaming the transform) leaves the indexes alone"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (t2/update! :model/Transform transform-id {:name "renamed"})
       (is (= :succeeded (t2/select-one-fn :status :model/TableIndex index-id)))))))

(deftest can-read-write-on-orphaned-transform-test
  (testing "superusers can read/write a transform whose source database has been deleted, data analysts cannot"
    (mt/with-premium-features #{:transforms-basic :hosting}
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Transform transform
                     {:name   "Orphan Transform"
                      :source {:type  "query"
                               :query {:database db-id
                                       :type     "native"
                                       :native   {:query "SELECT 1"}}}}]
        (t2/delete! :model/Database db-id)
        (let [reloaded (t2/select-one :model/Transform (:id transform))]
          (is (nil? (:source_database_id reloaded)))
          (mt/with-current-user (mt/user->id :crowberto)
            (is (mi/can-read? reloaded))
            (is (mi/can-write? reloaded)))
          (mt/with-current-user (mt/user->id :rasta)
            (is (not (mi/can-read? reloaded)))
            (is (not (mi/can-write? reloaded)))))))))

(deftest native-transform-requires-query-builder-and-native-test
  (testing "Writing a native-query transform requires \"Query builder and native\" on the source database, even if the
            group was misconfigured with transforms permission but only query-builder access (no native)."
    (mt/with-premium-features #{:transforms-basic :hosting}
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}
                     :model/Transform native-transform
                     {:name   "Native Transform"
                      :source {:type  "query"
                               :query {:database (mt/id)
                                       :type     "native"
                                       :native   {:query "SELECT 1"}}}}
                     :model/Transform mbql-transform
                     {:name   "MBQL Transform"
                      :source {:type  "query"
                               :query (lib/query (mt/metadata-provider)
                                                 (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
        (let [native (t2/select-one :model/Transform (:id native-transform))
              mbql   (t2/select-one :model/Transform (:id mbql-transform))]
          (mt/with-data-analyst-role! (mt/user->id :rasta)
            (mt/with-restored-data-perms!
              ;; Remove native access granted to All Users by default so the user's only path to native would be
              ;; the (mis)configured transforms group.
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/view-data :unrestricted)
              (data-perms/set-database-permission! (perms-group/all-users) (mt/id) :perms/create-queries :query-builder)
              (testing "transforms granted, but create-queries only query-builder (no native) — preexisting misconfiguration"
                (data-perms/set-database-permission! group-id (mt/id) :perms/view-data :unrestricted)
                (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder)
                (data-perms/set-database-permission! group-id (mt/id) :perms/transforms :yes)
                (mt/with-current-user (mt/user->id :rasta)
                  (testing "native transform cannot be written"
                    (is (not (mi/can-write? native))))
                  (testing "non-native (MBQL) transform is unaffected"
                    (is (mi/can-write? mbql)))))
              (testing "with query-builder-and-native, native transform can be written"
                (data-perms/set-database-permission! group-id (mt/id) :perms/create-queries :query-builder-and-native)
                (data-perms/set-database-permission! group-id (mt/id) :perms/transforms :yes)
                (mt/with-current-user (mt/user->id :rasta)
                  (is (mi/can-write? native)))))))))))

(deftest execute-fails-clearly-when-source-db-deleted-test
  (testing "running a query transform whose source database has been deleted fails with a clear error"
    (mt/with-premium-features #{:transforms-basic}
      (mt/with-temp [:model/Database {db-id :id} {}
                     :model/Transform transform
                     {:name "Will be orphaned"
                      :source {:type  :query
                               :query {:database db-id
                                       :type     :native
                                       :native   {:query "SELECT 1"}}}}]
        (t2/delete! :model/Database db-id)
        (let [reloaded (t2/select-one :model/Transform (:id transform))
              {:keys [status error]} (transforms-base.query/run-query-transform! reloaded nil)]
          (is (= :failed status))
          (is (re-find #"Source database for this transform has been deleted"
                       (ex-message error))))))))

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
