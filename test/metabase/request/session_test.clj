(ns metabase.request.session-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api :refer [*current-user* *current-user-id*]]
   [metabase.permissions.core :as perms]
   [metabase.request.core :as request]
   [metabase.settings.core :as setting]
   [metabase.settings.models.setting-test :as setting-test]
   [metabase.test :as mt]
   [metabase.util.i18n :as i18n]))

(set! *warn-on-reflection* true)

(deftest with-current-user-test
  (testing "with-current-user correctly binds the appropriate vars for the provided user ID"
    (request/with-current-user (mt/user->id :rasta)
      ;; Set a user-local value for rasta so that we can make sure that the user-local settings map is correctly bound
      (setting-test/test-user-local-only-setting! "XYZ")
      (is (= (mt/user->id :rasta) *current-user-id*))
      (is (= "rasta@metabase.com" (:email @*current-user*)))
      (is (false? api/*is-superuser?*))
      (is (= nil i18n/*user-locale*))
      (is (false? api/*is-group-manager?*))
      (is (= (perms/user-permissions-set (mt/user->id :rasta)) @api/*current-user-permissions-set*))
      (is (=? {:test-user-local-only-setting "XYZ"} (setting/user-local-values))))))

(deftest ^:parallel as-admin-test
  (testing "as-admin overrides *is-superuser?* and *current-user-permissions-set*"
    (request/with-current-user (mt/user->id :rasta)
      (request/as-admin
        ;; Current user ID remains the same
        (is (= (mt/user->id :rasta) *current-user-id*))
        ;; *is-superuser?* and permissions set are overrided
        (is (true? api/*is-superuser?*))
        (is (= #{"/"} @api/*current-user-permissions-set*)))))
  (testing "as-admin preserves any locale settings"
    (let [original "fr"]
      (binding [i18n/*user-locale* original]
        (request/as-admin
          (is (= original i18n/*user-locale*))
          (is (= "French"
                 (.getDisplayLanguage (i18n/user-locale)))))))))

(deftest ^:parallel current-user-attributes-test
  (testing "with-current-user resolves attributes for personal users"
    (mt/with-temp [:model/User {user-id :id} {:login_attributes {"cat" "50"}}]
      (request/with-current-user user-id
        (is (= {"cat" "50"}
               (:attributes @*current-user*))))))
  (testing "API-key pseudo-users get NO attributes, even if login_attributes are stored on their row (UXW-4240)"
    (mt/with-temp [:model/User {user-id :id} {:type             :api-key
                                              :login_attributes {"cat" "50"}}]
      (request/with-current-user user-id
        (is (= {} (:attributes @*current-user*)))))))
