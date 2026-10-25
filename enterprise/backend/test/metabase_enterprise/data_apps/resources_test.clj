(ns metabase-enterprise.data-apps.resources-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.data-apps.group-access :as group-access]
   [metabase-enterprise.data-apps.test-util :as data-apps.tu]
   [metabase.collections.models.collection :as collection]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- create-data-app!
  [name]
  (t2/insert-returning-instance! :model/DataApp
                                 {:name                   name
                                  :display_name           name
                                  :bundle_path            (format "data_apps/%s/index.js" name)
                                  :resource_collection_id (data-apps.tu/app-collection-id!)}))

(deftest the-resource-collection-stays-at-the-root-of-its-namespace-test
  (testing "an app collection lives in the data-apps namespace, so it can't be filed under a regular collection,
            where trashing the ancestor would take the app's copies with it"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-test-user :crowberto
        (mt/with-temp [:model/Collection {ancestor-id :id} {:name "Filed under" :location "/"}]
          (let [{:keys [resource_collection_id]} (create-data-app! "wrens")]
            (is (thrown-with-msg? clojure.lang.ExceptionInfo #"cannot move a data app's collection"
                                  (collection/move-collection!
                                   (t2/select-one :model/Collection :id resource_collection_id)
                                   (collection/children-location (t2/select-one :model/Collection :id ancestor-id)))))
            (is (= "/" (t2/select-one-fn :location :model/Collection :id resource_collection_id)))))))))

(deftest renaming-an-app-leaves-collection-grants-alone-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (mt/with-temp [:model/PermissionsGroup {other-group-id :id} {}]
      (let [app (create-data-app! "birds")
            collection-id (:resource_collection_id app)
            group-id (:id (t2/insert-returning-instance! :model/PermissionsGroup {:name "Finches"}))
            _ (group-access/add-groups! app [group-id])
            grants (fn [] (t2/select-fn-set (juxt :group_id :object) :model/Permissions
                                            :object [:in [(perms/collection-read-path collection-id)
                                                          (perms/collection-readwrite-path collection-id)]]))]
        (perms/revoke-collection-permissions! group-id collection-id)
        (perms/grant-collection-read-permissions! other-group-id collection-id)
        (let [before (grants)]
          (t2/update! :model/DataApp (:id app) {:name "renamed-birds"})
          (is (= #{[other-group-id (perms/collection-read-path collection-id)]} before))
          (is (= before (grants))))))))
