(ns metabase-enterprise.data-studio.permissions.can-read-test
  "Tests for can-read? on Database with published tables.
  Published tables should grant database read access via collection permissions."
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :refer [*current-user-id* *current-user-permissions-set*]]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest database-can-read-with-published-table-test
  (testing "can-read? for Database considers published table access only with data-studio enabled\n"
    (doseq [features             [#{} #{:data-studio}]
            collection-readable? [false true]
            table-is-published?  [false true]
            view-data            [:unrestricted :blocked]]
      (testing (format "with features %s, collection-readable? %s, table-is-published? %s, view-data %s"
                       (pr-str features) collection-readable? table-is-published? view-data)
        (mt/with-premium-features features
          (mt/with-restored-data-perms-for-group! (u/the-id (perms/all-users-group))
            (t2/with-transaction [_conn nil {:rollback-only true}]
              (mt/with-temp [:model/PermissionsGroup {group-id :id} {}
                             :model/User {user-id :id} {}
                             :model/PermissionsGroupMembership _ {:user_id user-id :group_id group-id}
                             :model/Collection {collection-id :id} {}]
                ;; Ensure All Users group has no create-queries permission and set view-data
                ;; (user is automatically in this group)
                (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/view-data      view-data)
                (perms/set-database-permission! (perms/all-users-group) (mt/id) :perms/create-queries :no)
                (perms/set-table-permission!    (perms/all-users-group) (mt/id :venues) :perms/create-queries :no)
                ;; Set up permissions on custom group: user cannot create queries, view-data varies
                (perms/set-database-permission! group-id (mt/id) :perms/view-data      view-data)
                (perms/set-database-permission! group-id (mt/id) :perms/create-queries :no)
                (when table-is-published?
                  (t2/update! :model/Table (mt/id :venues) {:is_published true :collection_id collection-id}))
                (if collection-readable?
                  (perms/grant-collection-read-permissions! group-id collection-id)
                  (do
                    ;; Revoke from both groups since user is in All Users automatically
                    (perms/revoke-collection-permissions! group-id collection-id)
                    (perms/revoke-collection-permissions! (perms/all-users-group) collection-id)))
                (binding [*current-user-id*              user-id
                          *current-user-permissions-set* (delay (if collection-readable?
                                                                  #{(perms/collection-read-path collection-id)}
                                                                  #{}))]
                  (perms/disable-perms-cache
                    ;; Database is readable when: data-studio enabled AND collection readable AND table is published
                    ;; view-data permission should NOT affect can-read? for Database
                    (is (= (and (contains? features :data-studio)
                                collection-readable?
                                table-is-published?)
                           (mi/can-read? :model/Database (mt/id))))))))))))))
