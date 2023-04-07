(ns metabase-enterprise.sso.api.saml-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sso.integrations.saml-test :refer [client-full-response
                                                           with-saml-default-setup]]))

(deftest saml-settings-test
  (testing "PUT /auth/saml/settings"
    (testing "Valid SAML settings can be saved via an API call"
      (with-saml-default-setup
        (client-full-response :put 200 "/auth/saml/settings" {:saml-keystore-path "test_resources/keystore.jks"
                                                              :saml-keystore-password "123456"
                                                              :saml-keystore-alias "sp"}))

      (testing "Invalid SAML settings returns 500"
        (with-saml-default-setup
          (client-full-response :put 500 "/auth/saml/settings" {:saml-keystore-path "/path/to/keystore"
                                                                :saml-keystore-password "password"
                                                                :saml-keystore-alias "alias"}))))))
