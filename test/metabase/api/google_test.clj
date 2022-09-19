(ns metabase.api.google-test
  (:require [clojure.test :refer :all]
            [metabase.test :as mt]))

(def ^:private test-client-id "test-client-id.apps.googleusercontent.com")

(deftest google-settings-test
  (testing "PUT /api/google/settings"
    (testing "Valid Google Sign-In settings can be saved via an API call"
      (mt/user-http-request :crowberto :put 200 "google/settings" {:google-auth-client-id test-client-id
                                                                   :google-auth-enabled true
                                                                   :google-auth-auto-create-accounts-domain "foo.com"}))))
