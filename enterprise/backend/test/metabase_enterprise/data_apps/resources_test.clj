(ns metabase-enterprise.data-apps.resources-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase-enterprise.data-apps.resources :as data-app.resources]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- create-data-app!
  [name]
  (t2/insert-returning-instance! :model/DataApp
                                 {:name name
                                  :display_name name
                                  :bundle_path (format "data_apps/%s/index.js" name)}))

(deftest the-resource-collection-stays-at-the-root-of-its-namespace-test
  (testing "an app collection lives in the data-apps namespace, so it can't be filed under a regular collection,
            where trashing the ancestor would take the app's copies with it"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-test-user :crowberto
        (mt/with-temp [:model/Collection {ancestor-id :id} {:name "Filed under" :location "/"}]
          (let [app (create-data-app! "wrens")
                {:keys [resource_collection_id]} (data-app.resources/ensure-resources! app)]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot move a data app's collection"
                                  (collection/move-collection!
                                   (t2/select-one :model/Collection :id resource_collection_id)
                                   (collection/children-location (t2/select-one :model/Collection :id ancestor-id)))))
            (is (= "/" (t2/select-one-fn :location :model/Collection :id resource_collection_id)))))))))

(deftest ensure-resources-restores-a-trashed-collection-test
  (testing "trashing the resource collection archives the copies the app is served from,
            so ensure-resources! has to bring both back or a successful sync leaves the app blank"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [app (create-data-app! "sparrows")
            {:keys [resource_collection_id]} (data-app.resources/ensure-resources! app)]
        ;; The app collection is readable by its own group alone, so only an admin
        ;; can put the copy there.
        (mt/with-test-user :crowberto
          (mt/with-temp [:model/Card {card-id :id} {:collection_id resource_collection_id}]
            ;; a data app's collection can no longer be trashed, so trash it as an instance from before that rule did
            (mt/with-dynamic-fn-redefs [perms/data-app-collection? (constantly false)]
              (collection/archive-or-unarchive-collection!
               (t2/select-one :model/Collection :id resource_collection_id)
               {:archived true}))
            (is (true? (t2/select-one-fn :archived :model/Collection :id resource_collection_id))
                "precondition: the collection is in the trash")
            (is (true? (t2/select-one-fn :archived :model/Card :id card-id))
                "precondition: trashing the collection archived the copy")
            (data-app.resources/ensure-resources! (t2/select-one :model/DataApp :id (:id app)))
            (is (false? (t2/select-one-fn :archived :model/Collection :id resource_collection_id))
                "the app collection is out of the trash")
            (is (false? (t2/select-one-fn :archived :model/Card :id card-id))
                "the copy the app serves is readable again")))))))

(deftest ensure-resources-recreates-a-deleted-collection-test
  (testing "the reference is nullable so the collection can be deleted on its own; the next import gives the app
            a collection again rather than leaving it broken"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (let [app (create-data-app! "finches")]
        (t2/delete! :model/Collection :id (:resource_collection_id app))
        (let [{:keys [resource_collection_id]} (data-app.resources/ensure-resources! app)]
          (is (pos-int? resource_collection_id))
          (is (not= (:resource_collection_id app) resource_collection_id))
          (is (=? {:name "Data App: finches" :namespace :data-apps :location "/"}
                  (t2/select-one :model/Collection :id resource_collection_id)))
          (is (= resource_collection_id (t2/select-one-fn :resource_collection_id :model/DataApp :id (:id app)))))))))

(deftest ensure-resources-preserves-collection-grants-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app (create-data-app! "birds")
          {collection-id :resource_collection_id} (data-app.resources/ensure-resources! app)
          group-id (:id (t2/insert-returning-instance! :model/PermissionsGroup {:name "Finches"}))
          _ (group-access/add-groups! app [group-id])
          read-path (perms/collection-read-path collection-id)
          grant (t2/select-one :model/Permissions :group_id group-id :object read-path)]
      (is (some? grant))
      (data-app.resources/ensure-resources! app)
      ; correct grants should not be changed after sync
      (is (= grant (t2/select-one :model/Permissions :group_id group-id :object read-path))))))

(deftest ensure-resources-repairs-collection-grants-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (mt/with-temp [:model/PermissionsGroup {other-group-id :id} {}]
      (let [app (create-data-app! "birds")
            {collection-id :resource_collection_id} (data-app.resources/ensure-resources! app)
            group-id (:id (t2/insert-returning-instance! :model/PermissionsGroup {:name "Finches"}))
            _ (group-access/add-groups! app [group-id])
            read-path (perms/collection-read-path collection-id)
            write-path (perms/collection-readwrite-path collection-id)]
        ; grant incorrect permission: write access to the data app collection
        (perms/grant-collection-readwrite-permissions! group-id collection-id)
        ; grant incorrect permission: let other groups read the data app collection
        (perms/grant-collection-read-permissions! other-group-id collection-id)
        (data-app.resources/ensure-resources! app)
        ; the two bad grants should be removed after sync.
        ; only the correct grants should remain.
        (is (= [{:group_id group-id :object read-path}]
               (t2/select [:model/Permissions :group_id :object]
                          :object [:in [read-path write-path]])))))))

(deftest ensure-resources-restores-missing-collection-grant-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app (create-data-app! "birds")
          {collection-id :resource_collection_id} (data-app.resources/ensure-resources! app)
          group-id (:id (t2/insert-returning-instance! :model/PermissionsGroup {:name "Finches"}))
          _ (group-access/add-groups! app [group-id])]
      (perms/revoke-collection-permissions! group-id collection-id)
      (data-app.resources/ensure-resources! app)
      ; read access should be restored after sync
      (is (t2/exists? :model/Permissions :group_id group-id :object (perms/collection-read-path collection-id))))))
