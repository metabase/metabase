(ns metabase-enterprise.sso.api.sso-test
  (:require
   [clojure.test :refer :all]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.http-client :as client]))

(deftest saml-logout
  (testing "with slo enabled and configured"
    (mt/with-premium-features #{:sso-saml}
      (mt/with-clock #t "2020-09-30T17:53:32Z"
        (mt/with-temporary-setting-values [saml-enabled                       true
                                           saml-identity-provider-uri         "http://idp.example.com/login"
                                           saml-identity-provider-certificate (slurp "test_resources/sso/auth0-public-idp.cert")
                                           saml-keystore-path                 "test_resources/keystore.jks"
                                           saml-keystore-password             "123456"
                                           saml-keystore-alias                "sp"
                                           site-url                           "http://localhost:3000"
                                           saml-slo-enabled                   true
                                           saml-identity-provider-slo-uri     "http://idp.example.com/logout"]
          (with-redefs [random-uuid (constantly "66d96ab4-9834-40db-a3cd-42b361503ab9")]
            (binding [client/*url-prefix* ""]
              (mt/with-temp [:model/User user {:email "saml_test@metabase.com" :sso_source "saml"}
                             :model/Session {session-id :id} {:user_id (:id user) :id (session/generate-session-id) :key_hashed (session/hash-session-key (session/generate-session-key))}]
                (let [req-options (assoc-in {} [:request-options :cookies request/metabase-session-cookie :value] session-id)]
                  (testing "logout is redirected to idp"
                    (let [response  (client/client :post "/auth/sso/logout" req-options)]
                      (is (= (str
                              "http://idp.example.com/logout?SAMLRequest=nZFBa4Qw"
                              "EIXv%2FRWSezQa165B3RakIOz20G576KVEDduASawTy%2F78Rl"
                              "1h2UMPvQQC87733ky2O6vO%2BxEDSKNzFPoEeUI3ppX6lKO34x"
                              "Peol1xlwFXXdSzvTmZ0b6I71GA9Ur3SM3tLP2ytmdBINveF2eu"
                              "%2Bk74jVFBNyuQV5U5km2StGnC6xinWxrjmLQ15rRpcRzVNAk3"
                              "hPI6dbMAo6g0WK5tjiISEUxSTMkxvGcbymjkE0I%2BkPe%2Bxo"
                              "6m2K6IBrYEzdE4aGY4SGCaKwHMNuz18bBnbpT1g7GmMR0qll5s"
                              "NhyuCX8DOIAYptqoOAjLaw4iC65RK%2FjZSavyX%2BBp%2BtO6"
                              "DT%2Boi8W0z9VmAReX781hil8%3D&RelayState=aHR0cDovL2"
                              "xvY2FsaG9zdDozMDAwL2F1dGgvc3NvL2hhbmRsZV9zbG8%3D&S"
                              "igAlg=http%3A%2F%2Fwww.w3.org%2F2000%2F09%2Fxmldsi"
                              "g%23rsa-sha1&Signature=sZakr0C7r%2F%2FGnN7NmdmnnKj"
                              "kKR1pLB1aC%2Bj0dyQwtbr9C%2FE2VMeBCV%2FQDNoTGP7UMVI"
                              "g%2BIRZXaZ4h0mLwG7MQwyv9KCL9tH0GZ%2F3K3mqYhg3d8zDO"
                              "W6HSXlA%2FP2W1xFSMV7isYbynM%2BTPZ1vp88zQCpb0xVzDWt"
                              "%2FYw11yAqadb8%3D")
                             (:saml-logout-url response))))))))))))))
