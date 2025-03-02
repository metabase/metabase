(ns metabase-enterprise.sso.api.sso-test
  (:require [clojure.test :refer :all]
            [metabase.http-client :as client]
            [metabase.request.core :as request]
            [metabase.test :as mt]))

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
                             :model/Session {session-id :id} {:user_id (:id user) :id (str (random-uuid))}]
                (let [req-options (assoc-in {} [:request-options :cookies request/metabase-session-cookie :value] session-id)]
                  (testing "logout is redirected to idp"
                    (let [response  (client/client :post "/auth/sso/logout" req-options)]
                      (is (= (str
                              "http://idp.example.com/logout?SAMLRequest=nZFBa4Qw"
                              "EIXv%2FRWSezQa165B3RakIOz20G576KVEE7YBk1gnlv35ja6F"
                              "pYceegkE3vfmvZlid9Z98CVHUNaUKA4JCqTprFDmVKKX4wPeol"
                              "11UwDX%2FcD29mQn9yQ%2FJwkuqP2jDHcL%2BeHcwKJIiSGUZ6"
                              "6HXoad1VG%2FECho6hIpkWUiz3ib4nxLU5wS0WJOO4HTpKVZvC"
                              "GUt7nXAkyyMeC4cSVKSEIwyTElx%2FiWbSijSUgIeUPB60%2Fq"
                              "ZE7texhgS84STaNhloMCZriWwFzHnu8Pe%2BaVbBits53tUbW0"
                              "Ysu48Yr%2FG%2BcAcpw7o%2BogHW85yCK6MlpdHz3Y1P9xncXv"
                              "zu%2F2Tq%2F%2B8ybXGRfb6vL7dZDqGw%3D%3D&RelayState="
                              "aHR0cDovL2xvY2FsaG9zdDozMDAwL2F1dGgvc3NvL2hhbmRsZV"
                              "9zbG8%3D&SigAlg=http%3A%2F%2Fwww.w3.org%2F2000%2F0"
                              "9%2Fxmldsig%23rsa-sha1&Signature=mKf%2F6opS%2FFwXv"
                              "%2BBMCYApu1DIJ%2FfEXeF2G%2BV9iuvIDGnSG2gik1fh70a4l"
                              "vzsWVZWLNNJzWtM6v%2BpRSfjXFft2gQtVHMtkKUwxXaBxmEYJ"
                              "jtp4owHhWh9r4mB3fG1Riro%2FNPsmHvxC5ABlptkwqigL4eB0"
                              "IXSVO0Dcpwxg0ER18s%3D")
                             (:saml-logout-url response))))))))))))))
