(ns metabase-enterprise.advanced-permissions.models.group-manager-test
  (:require [clojure.test :refer :all]
            [metabase-enterprise.advanced-permissions.models.permissions :as ee-perms]
            [metabase-enterprise.advanced-permissions.models.permissions.group-manager :as gm]
            [metabase.driver :as driver]
            [metabase.models :refer [Database Permissions PermissionsGroup]]
            [metabase.models.database :as database]
            [metabase.models.permissions :as perms]
            [metabase.models.permissions-group :as group]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.sync.sync-metadata.tables :as sync-tables]
            [metabase.test :as mt]
            [metabase.util :as u]
            [toucan.db :as db]))

#_(deftest set-user-group-permissions-test
  (testing "set-user-group-memberships!"
    (testing "should be able to add a User to a new groups"
      (mt/with-user-in-groups
        [group-1 {:name "Group 1"}
         group-2 {:name "Group 2"}
         user    [group-1]]
        (gm/set-user-group-memberships! user [{:id (:id group-1)
                                               :is_group_manager false}])

        (gm/set-user-group-memberships! user [{:id (:id group-2)
                                               :is_group_manager false}])))))
