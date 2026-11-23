(ns metabase-enterprise.data-studio.permissions.can-read-test
  "Tests for can-read? on Database with published tables.
  Published tables should grant database read access via collection permissions."
  (:require
   [clojure.test :refer :all]
   [metabase.collections.models.collection :as collection]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.users.models.user :as user]
   [metabase.util :as u]
   [metabase.warehouse-schema.models.table-user-settings :as schema.table-user-settings]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest database-can-read-with-published-table-test
  (testing "can-read? for Database considers published table access only with library enabled\n"
    (doseq [features             [#{} #{:library}]
            collection-readable? [false true]
            table-is-published?  [false true]
            view-data            [:unrestricted :blocked]]
      (testing (format "with features %s, collection-readable? %s, table-is-published? %s, view-data %s"
                       (pr-str features) collection-readable? table-is-published? view-data)
        (mt/with-premium-features features
          (mt/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
            (t2/with-transaction [_conn nil {:rollback-only true}]
              (let [[{user-id :id}]         (user/create-users! [{:email "published-table-reader@example.com"}])
                    [{collection-id :id}] (collection/create-collections! [{:name "Library Data" :type "library-data"}])]
                (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                               :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}]
                  ;; Ensure All Users group has no create-queries permission and set view-data
                  ;; (user is automatically in this group)
                  (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data      view-data)
                  (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
                  (perms/set-table-permission!    (perms/all-users-group) (mt/id :venues) :perms/create-queries :no)
                  ;; Set up permissions on custom group: user cannot create queries, view-data varies
                  (perms/set-database-permission! group-id (mt/id) :perms/view-data      view-data)
                  (perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
                  (when table-is-published?
                    (schema.table-user-settings/upsert-table-user-settings!
                     (t2/select-one :model/Table :id (mt/id :venues))
                     {:is_published true :collection_id collection-id}))
                  (if collection-readable?
                    (perms/grant-collection-read-permissions! group-id collection-id)
                    (do
                      ;; Revoke from both groups since user is in All Users automatically
                      (perms/revoke-collection-permissions! group-id collection-id)
                      (perms/revoke-collection-permissions! (perms/all-users-group) collection-id)))
                  (mt/with-current-user user-id
                    (is (= (and (contains? features :library)
                                collection-readable?
                                table-is-published?)
                           (mi/can-read? (t2/hydrate (t2/select-one :model/Database :id (mt/id)) :can_read))))))))))))))
