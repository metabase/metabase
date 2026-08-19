(ns metabase.models.transforms.transform-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.transforms-base.query :as transforms-base.query]
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

(deftest can-read-write-on-orphaned-transform-test
  (testing "superusers can read/write a transform whose source database has been deleted, data analysts cannot"
    (mt/with-premium-features #{:transforms-basic}
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
