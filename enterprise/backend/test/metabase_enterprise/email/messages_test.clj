(ns metabase-enterprise.email.messages-test
  (:require
   [clojure.test :refer :all]
   [metabase.email.messages :as messages]
   [metabase.models.data-permissions :as data-perms]
   [metabase.models.permissions :as perms]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest admin-or-ee-monitoring-details-emails-test
  (let [db-id (:id (mt/db))]
    (mt/with-user-in-groups [group {:name "New Group"}
                             user [group]]
      (perms/grant-application-permissions! group :monitoring)
      (testing "Users with monitoring but no `manage-database` permission do not recieve"
        (mt/with-premium-features #{:advanced-permissions}
          (is (= (set (#'messages/all-admin-recipients))
                 (set (#'messages/admin-or-ee-monitoring-details-emails db-id))))))
      (testing "Users with both `monitoring` and `manage-database` permission DO receive"
        (data-perms/set-database-permission! group db-id :perms/manage-database :yes)
        (mt/with-premium-features #{:advanced-permissions}
          (is (= (conj (set (#'messages/all-admin-recipients))
                       (:email user))
                 (set (#'messages/admin-or-ee-monitoring-details-emails db-id))))))
      (testing "Only send to admin users if advanced-permissions is disabled"
        (mt/with-premium-features #{}
          (is (= (set (#'messages/all-admin-recipients))
                 (set (#'messages/admin-or-ee-monitoring-details-emails db-id)))))))))
