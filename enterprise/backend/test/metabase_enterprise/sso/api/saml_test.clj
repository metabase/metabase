(ns metabase-enterprise.sso.api.saml-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]))

(deftest saml-settings-test
  (testing "PUT /api/saml/settings"
    (mt/with-premium-features #{}
      (testing "SAML settings cannot be saved without SAML feature flag enabled"
        (is (= "SAML-based authentication is a paid feature not currently available to your instance. Please upgrade to use it. Learn more at metabase.com/upgrade/"
               (mt/user-http-request :crowberto :put 402 "saml/settings" {:saml-keystore-path "test_resources/keystore.jks"
                                                                          :saml-keystore-password "123456"
                                                                          :saml-keystore-alias "sp"})))))
    (mt/with-premium-features #{:sso-saml}
      (testing "Valid SAML settings can be saved via an API call"
        (mt/user-http-request :crowberto :put 200 "saml/settings" {:saml-keystore-path "test_resources/keystore.jks"
                                                                   :saml-keystore-password "123456"
                                                                   :saml-keystore-alias "sp"}))
      (testing "Blank SAML settings returns 200"
        (mt/user-http-request :crowberto :put 200 "saml/settings" {:saml-keystore-path nil
                                                                   :saml-keystore-password nil
                                                                   :saml-keystore-alias nil}))

      (testing "Invalid SAML settings returns 400"
        (mt/user-http-request :crowberto :put 400 "saml/settings" {:saml-keystore-path "/path/to/keystore"
                                                                   :saml-keystore-password "password"
                                                                   :saml-keystore-alias "alias"})))))
