(ns metabase.transforms.models.transform-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.permissions.models.data-permissions :as data-perms]
   [metabase.permissions.models.permissions-group :as perms-group]
   [metabase.test :as mt]
   [metabase.transforms.query-test-util :as query-test-util]
   [toucan2.core :as t2]))

(deftest source-database-id-set-test
  (testing "inserting a transform correctly sets the source-database-id column"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  :query
                             :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}]
      (is (= (mt/id) (:source_database_id transform)))))
  (testing "A transform with no source database has a nil source_database_id"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type          :python
                             :source-tables []
                             :body          "print(\"hello\")"}}]
      (is (nil? (:source_database_id transform)))))
  (testing "updating a transform recomputes the source-database-id column from the source"
    (mt/with-temp [:model/Transform transform
                   {:name   "Test Transform"
                    :source {:type          :python
                             :source-tables []
                             :body          "print(\"hello\")"}}]
      (is (nil? (:source_database_id transform)))
      (t2/update! :model/Transform :id (:id transform) {:source {:type  :query
                                                                 :query (lib/native-query (mt/metadata-provider) "SELECT 1")}})
      (is (= (mt/id) (t2/select-one-fn :source_database_id :model/Transform :id (:id transform)))))))

(deftest source-database-deletion-deletes-transform-test
  (testing "deleting database deletes transforms reading from it"
    (mt/with-temp [:model/Database {db-id :id} {}
                   :model/Transform transform
                   {:name   "Test Transform"
                    :source {:type  :query
                             :query (lib/native-query (lib-be/application-database-metadata-provider db-id) "SELECT 1")}}]
      (is (= db-id (:source_database_id transform)))
      (t2/delete! :model/Database :id db-id)
      (is (not (t2/exists? :model/Transform :id (:id transform)))))))

(defn- temp-transform-with-index! [thunk]
  (mt/with-temp [:model/Transform {transform-id :id}
                 {:name   (mt/random-name)
                  :source {:type :query :query (query-test-util/make-query :source-table "venues")}
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
       (t2/update! :model/Transform :id transform-id
                   {:source {:type :query :query (query-test-util/make-query :source-table "checkins")}})
       (is (= :update-pending (t2/select-one-fn :status :model/TableIndex :id index-id))))))
  (testing "retargeting to a different table marks the transform's managed indexes for revalidation"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (t2/update! :model/Transform :id transform-id
                   {:target {:database (mt/id) :type "table" :schema "public" :name (mt/random-name)}})
       (is (= :update-pending (t2/select-one-fn :status :model/TableIndex :id index-id))))))
  (testing "an unrelated edit (renaming the transform) leaves the indexes alone"
    (temp-transform-with-index!
     (fn [transform-id index-id]
       (t2/update! :model/Transform :id transform-id {:name "renamed"})
       (is (= :succeeded (t2/select-one-fn :status :model/TableIndex :id index-id)))))))

(deftest native-transform-requires-query-builder-and-native-test
  (testing "Writing a native-query transform requires \"Query builder and native\" on the source database, even if the
            group was misconfigured with transforms permission but only query-builder access (no native)."
    (mt/with-premium-features #{:transforms-basic :hosting}
      (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                     :model/PermissionsGroupMembership _ {:user_id (mt/user->id :rasta) :group_id group-id}
                     :model/Transform native-transform
                     {:name   "Native Transform"
                      :source {:type  :query
                               :query (lib/native-query (mt/metadata-provider) "SELECT 1")}}
                     :model/Transform mbql-transform
                     {:name   "MBQL Transform"
                      :source {:type  :query
                               :query (lib/query (mt/metadata-provider)
                                                 (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
        (let [native (t2/select-one :model/Transform :id (:id native-transform))
              mbql   (t2/select-one :model/Transform :id (:id mbql-transform))]
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

(deftest no-events-during-deserialization-test
  (testing "Transform lifecycle hooks do not publish events during deserialization"
    (let [events-published (atom [])
          source           {:type  :query
                            :query (lib/native-query (mt/metadata-provider) "SELECT 1")}]
      (with-redefs [events/publish-event! (fn [topic event]
                                            (swap! events-published conj [topic event]))]
        (testing "events fire normally for insert/update/delete"
          (mt/with-temp [:model/Transform {transform-id :id} {:name "Test Transform" :source source}]
            (is (some #(= :event/create-transform (first %)) @events-published))
            (reset! events-published [])
            (t2/update! :model/Transform :id transform-id {:name "Updated Name"})
            (is (some #(= :event/update-transform (first %)) @events-published))
            (reset! events-published [])
            (t2/delete! :model/Transform :id transform-id)
            (is (some #(= :event/delete-transform (first %)) @events-published))))
        (reset! events-published [])
        (testing "events are suppressed during deserialization"
          (binding [mi/*deserializing?* true]
            (mt/with-temp [:model/Transform {transform-id :id} {:name "Deserialized Transform" :source source}]
              (t2/update! :model/Transform :id transform-id {:name "Deserialized Update"})
              (t2/delete! :model/Transform :id transform-id)))
          (is (empty? @events-published)))))))

(defn- stored-deps [transform-id]
  (t2/select-one-fn :table_dependencies :model/Transform :id transform-id))

(deftest table-dependencies-cache-test
  (testing "table_dependencies is not computed on insert — it is filled lazily on the first read"
    (mt/with-temp [:model/Transform {id :id}
                   {:name   "deps insert"
                    :source {:type  :query
                             :query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
      (is (nil? (stored-deps id)))))
  (testing "changing the source invalidates any cached table_dependencies"
    (mt/with-temp [:model/Transform {id :id}
                   {:name   "deps update"
                    :source {:type  :query
                             :query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :orders)))}}]
      ;; seed a cached value (as the lazy read path would)
      (t2/update! :model/Transform :id id {:table_dependencies [{:table (mt/id :orders)}]})
      (is (= [{:table (mt/id :orders)}] (stored-deps id)))
      (t2/update! :model/Transform :id id
                  {:source {:type  :query
                            :query (lib/query (mt/metadata-provider) (lib.metadata/table (mt/metadata-provider) (mt/id :people)))}})
      (is (nil? (stored-deps id))))))

(deftest last-run-hydration-omits-heartbeat-test
  (testing "the `:last_run` hydrated onto a transform leaves out the run's internal `last_heartbeat`"
    (mt/with-temp [:model/Transform    {transform-id :id} {}
                   :model/TransformRun {run-id :id}       {:transform_id        transform-id
                                                           :transform_name      "heartbeat"
                                                           :transform_entity_id "eid"
                                                           :status              "started"
                                                           :is_active           true
                                                           :run_method          "manual"
                                                           :last_heartbeat      (t/offset-date-time)}]
      (let [last-run (:last_run (t2/hydrate (t2/select-one :model/Transform :id transform-id) :last_run))]
        (is (=? {:id run-id, :transform_id transform-id} last-run))
        (is (not (contains? last-run :last_heartbeat)))))))

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
                      :source {:type  :query
                               :query (lib/with-template-tags
                                        (lib/native-query (mt/metadata-provider) (format "SELECT * FROM {{#%d}} AS c" card-id))
                                        {(str "#" card-id)
                                         {:id           (str "#" card-id)
                                          :name         (str "#" card-id)
                                          :display-name (str "#" card-id)
                                          :type         :card
                                          :card-id      card-id}})}}]
        (mt/with-non-admin-groups-no-collection-perms collection
          (let [stored (t2/select-one :model/Transform :id (:id transform))
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
