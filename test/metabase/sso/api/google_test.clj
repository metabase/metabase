(ns metabase.sso.api.google-test
  (:require
   [clojure.test :refer :all]
   [metabase.sso.settings :as sso.settings]
   [metabase.test :as mt]))

(def ^:private test-client-id "test-client-id.apps.googleusercontent.com")

(deftest google-settings-test
  (testing "PUT /api/google/settings"
    (testing "Valid Google Sign-In settings can be saved via an API call"
      (mt/with-temporary-setting-values [google-auth-client-id nil
                                         google-auth-auto-create-accounts-domain nil
                                         google-auth-enabled nil]
        (mt/user-http-request :crowberto :put 200 "google/settings" {:google-auth-client-id test-client-id
                                                                     :google-auth-enabled true
                                                                     :google-auth-auto-create-accounts-domain "foo.com"})
        (is (sso.settings/google-auth-enabled))
        (is (= test-client-id
               (sso.settings/google-auth-client-id)))
        (is (= "foo.com"
               (sso.settings/google-auth-auto-create-accounts-domain)))))))
