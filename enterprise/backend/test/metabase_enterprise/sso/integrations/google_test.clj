(ns metabase-enterprise.sso.integrations.google-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :test-users))

(deftest google-auth-test
  (mt/with-premium-features #{:sso-google}
    (testing "POST /google_auth"
      (mt/with-model-cleanup [:model/User]
        (mt/with-temporary-setting-values [google-auth-client-id "pretend-client-id.apps.googleusercontent.com"
                                           google-auth-auto-create-accounts-domain "metabase.com,example.com"]
          (testing "Google auth works with an @metabase.com account"
            (with-redefs [http/post (constantly
                                     {:status 200
                                      :body   (str "{\"aud\":\"pretend-client-id.apps.googleusercontent.com\","
                                                   "\"email_verified\":\"true\","
                                                   "\"first_name\":\"Cam\","
                                                   "\"last_name\":\"Era\","
                                                   "\"email\":\"camera@metabase.com\"}")})]
              (mt/client :post 200 "session/google_auth" {:token "foo"})
              (is (some? (t2/select-one :model/User :email "camera@metabase.com")))))
          (testing "Google auth works with an @example.com account"
            (with-redefs [http/post (constantly
                                     {:status 200
                                      :body   (str "{\"aud\":\"pretend-client-id.apps.googleusercontent.com\","
                                                   "\"email_verified\":\"true\","
                                                   "\"first_name\":\"Cam\","
                                                   "\"last_name\":\"Era\","
                                                   "\"email\":\"camera@example.com\"}")})]
              (mt/client :post 200 "session/google_auth" {:token "foo"})
              (is (some? (t2/select-one :model/User :email "camera@example.com"))))))))))
