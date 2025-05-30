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
                              "http://idp.example.com/logout?SAMLRequest=nZExb4Mw"
                              "EIX%2FiuXdYDChwQLSSqgSUtKhTTt0qQxYqSVsU85U%2Bfk1hE"
                              "hRhw4dz3fvvfvO%2Be6se%2FQtR1DWFDgKKEbStLZT5lTg1%2B"
                              "Mj2eJdmYPQfTzwvT3ZyT3Lr0mCQ15pgF9aBZ5Gw60ABdwILYG7"
                              "lr88HPY8DigfRutsa3uMKi9URrgl7dO5gYeh6oZAnoUeehm0Vo"
                              "f9koJRXRVYdWnaZaloEpJtWUIS2jVEsLYjSdywNNpQJprMzwJM"
                              "sjbghHEFjmlMCc0Io8fojm8YZ34LSt8xeruS%2Bge8cvFFPN7y"
                              "%2FI0jAOQ4I%2BDyIJ1oBMg8vLW6Gj95aV39y3ie%2FnD%2BWv"
                              "d6jZhvc425GJdr%2Betjyh8%3D&RelayState=aHR0cDovL2xv"
                              "Y2FsaG9zdDozMDAwL2F1dGgvc3NvL2hhbmRsZV9zbG8%3D&Sig"
                              "Alg=http%3A%2F%2Fwww.w3.org%2F2000%2F09%2Fxmldsig%"
                              "23rsa-sha1&Signature=EP1xtNSpBVo0TfQDx3CLE2Z%2BDJu"
                              "LYcJUWTaEJ5UWAwmKGz5Z7XVvMl2h45EkViC0aDoGFhtoXKCqm"
                              "L0ZmvNLUiXYsxnkt41SwvguzdHH21DqRIYSCy3fRy8U62c%2F%"
                              "2F496QzJgn%2BrbVm2HpCLytemqWsZrtbJxblRQfGnYFydPzv0"
                              "%3D")
                             (:saml-logout-url response))))))))))))))
