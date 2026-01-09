(ns metabase-enterprise.sso.api.sso-test
  (:require
   [buddy.sign.jwt :as jwt]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.config.core :as config]
   [metabase.request.core :as request]
   [metabase.session.core :as session]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.test.http-client :as client]
   [metabase.util.random :as u.random]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

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

(def ^:private default-jwt-secret (u.random/secure-hex 32))

(defn- with-jwt-settings! [f]
  (mt/with-additional-premium-features #{:sso-jwt}
    (mt/with-temporary-setting-values
      [jwt-enabled true
       jwt-identity-provider-uri "http://test.idp.metabase.com"
       jwt-shared-secret default-jwt-secret
       site-url (format "http://localhost:%s" (config/config-str :mb-jetty-port))]
      (f))))

(defn- create-valid-jwt-token
  ([]
   (create-valid-jwt-token {}))
  ([claims]
   (let [now (int (/ (System/currentTimeMillis) 1000))
         default-claims {:email "test@example.com"
                         :first_name "Test"
                         :last_name "User"
                         :iat now
                         :exp (+ now 3600)}]
     (jwt/sign (merge default-claims claims) default-jwt-secret))))

(deftest jwt-to-session-test
  (testing "POST /auth/sso/to_session"
    (binding [client/*url-prefix* ""]
      (with-jwt-settings!
        (fn []
          (testing "successful JWT to session conversion"
            (let [jwt-token (create-valid-jwt-token)
                  response (mt/client :post 200 "/auth/sso/to_session" {:jwt jwt-token})]
              (is (string? (:session_token response)))))
          (testing "missing JWT token"
            (is (=? {:errors {:jwt "value must be a non-blank string."}}
                    (mt/client :post 400 "/auth/sso/to_session" {}))))
          (testing "JWT disabled"
            (mt/with-temporary-setting-values [jwt-enabled false]
              (let [jwt-token (create-valid-jwt-token)]
                (is (= "JWT authentication is not enabled"
                       (mt/client :post 400 "/auth/sso/to_session" {:jwt jwt-token}))))))
          (testing "invalid JWT token"
            (is (= "Message seems corrupt or manipulated"
                   (mt/client :post 401 "/auth/sso/to_session" {:jwt "invalid-token"}))))
          (testing "expired JWT token"
            (let [expired-token (create-valid-jwt-token {:exp (- (int (/ (System/currentTimeMillis) 1000)) 3600)})]
              (is (str/starts-with? (mt/client :post 401 "/auth/sso/to_session" {:jwt expired-token})
                                    "Token is expired"))))
          (testing "JWT with different secret"
            (let [wrong-secret-token (jwt/sign {:email "test@example.com"
                                                :first_name "Test"
                                                :last_name "User"
                                                :iat (int (/ (System/currentTimeMillis) 1000))
                                                :exp (+ (int (/ (System/currentTimeMillis) 1000)) 3600)}
                                               "wrong-secret")]
              (is (= "Message seems corrupt or manipulated"
                     (mt/client :post 401 "/auth/sso/to_session" {:jwt wrong-secret-token}))))))))))
