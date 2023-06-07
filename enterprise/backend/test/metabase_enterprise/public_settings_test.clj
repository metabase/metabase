(ns metabase-enterprise.public-settings-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.advanced-permissions.common-test :refer [with-all-users-data-perms]]
   [metabase.models.permissions :as perms]
   [metabase.models.permissions-group :as perms-group]
   [metabase.public-settings :as public-settings]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.util :as tu]))

(use-fixtures :once (fixtures/initialize :db))

(deftest can-turn-off-password-login-with-jwt-enabled
  (tu/with-temporary-setting-values [jwt-enabled               true
                                     jwt-identity-provider-uri "example.com"
                                     jwt-shared-secret         "0123456789012345678901234567890123456789012345678901234567890123"
                                     enable-password-login     true]
    (public-settings/enable-password-login! false)
    (is (= false
           (public-settings/enable-password-login)))))

(deftest settings-managers-can-have-uploads-db-access-revoked
  (perms/grant-application-permissions! (perms-group/all-users) :setting)
  (testing "Upload DB can be set with the right permission"
    (with-all-users-data-perms {(mt/id) {:details :yes}}
      (mt/user-http-request :rasta :put 204 "setting/" {:uploads-database-id (mt/id)})))
  (testing "Upload DB cannot be set without the right permission"
    (with-all-users-data-perms {(mt/id) {:details :no}}
      (mt/user-http-request :rasta :put 403 "setting/" {:uploads-database-id (mt/id)})))
  (perms/revoke-application-permissions! (perms-group/all-users) :setting))
