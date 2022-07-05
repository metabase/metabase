(ns metabase-enterprise.email.messages-test
  (:require [clojure.test :refer :all]
            [metabase.email.messages :as messages]
            [metabase.models.permissions :as perms]
            [metabase.public-settings.premium-features-test :as premium-features-test]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest admin-or-ee-monitoring-details-emails-test
  (let [db-id (:id (mt/db))]
    (mt/with-user-in-groups [group {:name "New Group"}
                             user [group]]
      (perms/grant-application-permissions! group :monitoring)
      (perms/grant-permissions! group (perms/feature-perms-path :details :yes db-id))
      (testing "Include monitoring and details user when advanced-permissions are enabled"
        (premium-features-test/with-premium-features #{:advanced-permissions}
          (is (= (conj (set (#'messages/all-admin-recipients))
                       (:email user))
                 (set (#'messages/admin-or-ee-monitoring-details-emails db-id))))))
      (testing "Only send to admin users if advanced-permissions is disabled"
        (is (= (set (#'messages/all-admin-recipients))
               (set (#'messages/admin-or-ee-monitoring-details-emails db-id))))))))
