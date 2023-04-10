(ns metabase-enterprise.sso.api.saml-test
  (:require
   [clojure.test :refer :all]
   [metabase.config :as config]
   [metabase.http-client :as client]
   [metabase-enterprise.sso.integrations.saml-test :refer [with-saml-default-setup]]
   [metabase.test :as mt]))

(defn user-http-request
  "Same as `mt/user-http-request` but doesn't include the `/api` in the URL prefix"
  [& args]
  (binding [client/*url-prefix* (str "http://localhost:" (config/config-str :mb-jetty-port))]
    (apply mt/user-http-request args)))

(deftest saml-settings-test
  (testing "PUT /auth/saml/settings"
    (testing "Valid SAML settings can be saved via an API call"
      (with-saml-default-setup
        (user-http-request :crowberto :put 200 "/auth/saml/settings" {:saml-keystore-path "test_resources/keystore.jks"
                                                                         :saml-keystore-password "123456"
                                                                         :saml-keystore-alias "sp"}))

      (testing "Invalid SAML settings returns 500"
        (with-saml-default-setup
          (user-http-request :crowberto :put 500 "/auth/saml/settings" {:saml-keystore-path "/path/to/keystore"
                                                                           :saml-keystore-password "password"
                                                                           :saml-keystore-alias "alias"}))))))
