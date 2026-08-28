(ns metabase-enterprise.data-apps.resources-test
  (:require
   [clojure.test :refer :all]
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

(deftest ensure-resources-restores-a-collection-trashed-through-an-ancestor-test
  (testing "an app collection filed under another collection is archived indirectly when that
            ancestor is trashed, and the ancestor stays there — so it is restored to the root
            rather than to a parent that would reject it"
    (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
      (mt/with-test-user :crowberto
        (mt/with-temp [:model/Collection {ancestor-id :id} {:name "Filed under" :location "/"}]
          (let [app (create-data-app! "wrens")
                {:keys [resource_collection_id]} (data-app.resources/ensure-resources! app)]
            (collection/move-collection!
             (t2/select-one :model/Collection :id resource_collection_id)
             (collection/children-location (t2/select-one :model/Collection :id ancestor-id)))
            (collection/archive-or-unarchive-collection!
             (t2/select-one :model/Collection :id ancestor-id)
             {:archived true})
            (is (true? (t2/select-one-fn :archived :model/Collection :id resource_collection_id))
                "precondition: the ancestor took the app collection with it")
            (data-app.resources/ensure-resources! (t2/select-one :model/DataApp :id (:id app)))
            (is (false? (t2/select-one-fn :archived :model/Collection :id resource_collection_id))
                "the app collection is usable again")
            (is (= "/" (t2/select-one-fn :location :model/Collection :id resource_collection_id))
                "and sits at the root, not under the ancestor still in the trash")
            (is (true? (t2/select-one-fn :archived :model/Collection :id ancestor-id))
                "the ancestor is left where the admin put it")))))))

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
            (collection/archive-or-unarchive-collection!
             (t2/select-one :model/Collection :id resource_collection_id)
             {:archived true})
            (is (true? (t2/select-one-fn :archived :model/Collection :id resource_collection_id))
                "precondition: the collection is in the trash")
            (is (true? (t2/select-one-fn :archived :model/Card :id card-id))
                "precondition: trashing the collection archived the copy")
            (data-app.resources/ensure-resources! (t2/select-one :model/DataApp :id (:id app)))
            (is (false? (t2/select-one-fn :archived :model/Collection :id resource_collection_id))
                "the app collection is out of the trash")
            (is (false? (t2/select-one-fn :archived :model/Card :id card-id))
                "the copy the app serves is readable again")))))))

(deftest ensure-resources-reasserts-the-query-creation-restriction-test
  (mt/with-model-cleanup [:model/DataApp :model/Collection :model/PermissionsGroup]
    (let [app (create-data-app! "birds")
          {:keys [permission_group_id]} (data-app.resources/ensure-resources! app)]
      (perms/set-table-permissions! permission_group_id :perms/create-queries
                                    {(mt/id :venues) :query-builder})
      (data-app.resources/ensure-resources! app)
      (is (=? [{:table_id nil, :perm_value :no}]
              (t2/select [:model/DataPermissions :table_id :perm_value]
                         :group_id permission_group_id
                         :db_id (mt/id)
                         :perm_type :perms/create-queries))
          "a manual table-level grant is swept back to the database-wide restriction"))))
