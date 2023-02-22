(ns metabase.api.google-test
  (:require
   [clojure.test :refer :all]
   [metabase.integrations.google :as google]
   [metabase.integrations.google.interface :as google.i]
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
        (is (= (google/google-auth-enabled) true))
        (is (= (google/google-auth-client-id) test-client-id))
        (is (= (google.i/google-auth-auto-create-accounts-domain) "foo.com"))))))
