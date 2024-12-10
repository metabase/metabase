(ns metabase.request.session-test
  (:require
   [clojure.test :refer :all]
   [metabase.api.common :as api :refer [*current-user* *current-user-id*]]
   [metabase.models.setting :as setting]
   [metabase.models.setting-test :as setting-test]
   [metabase.models.user :as user]
   [metabase.request.core :as request]
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
      (is (= (user/permissions-set (mt/user->id :rasta)) @api/*current-user-permissions-set*))
      (is (partial= {:test-user-local-only-setting "XYZ"} @@setting/*user-local-values*)))))

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
