(ns metabase-enterprise.sso.api.oidc-identities-test
  (:require
   [clojure.test :refer :all]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(defn- provider [provider-key enabled?]
  {:key           provider-key
   :login-prompt  (str "Sign in with " provider-key)
   :issuer-uri    (str "https://" provider-key ".example.com")
   :client-id     "client-id"
   :client-secret "client-secret"
   :enabled       enabled?})

(deftest list-oidc-identities-test
  (mt/with-additional-premium-features #{:sso-oidc}
    (mt/with-temporary-setting-values [oidc-providers [(provider "okta" true)
                                                       (provider "auth0" true)
                                                       (provider "disabled" false)]]
      (mt/with-temp [:model/AuthIdentity _ {:user_id     (mt/user->id :rasta)
                                            :provider    "oidc-okta"
                                            :provider_id "rasta-sub"
                                            :metadata    {:iss "https://okta.example.com"}}]
        (testing "lists the enabled providers and whether the current user is linked at each"
          (is (=? [{:key "okta"  :login-prompt "Sign in with okta"  :sso-url #"/auth/sso/okta$"  :linked true}
                   {:key "auth0" :login-prompt "Sign in with auth0" :sso-url #"/auth/sso/auth0$" :linked false}]
                  (mt/user-http-request :rasta :get 200 "ee/sso/oidc-identities")))
          (is (= 2 (count (mt/user-http-request :rasta :get 200 "ee/sso/oidc-identities")))))
        (testing "another user's links are not reported"
          (is (= [false false]
                 (map :linked (mt/user-http-request :lucky :get 200 "ee/sso/oidc-identities")))))
        (testing "requires authentication"
          (is (= "Unauthenticated" (mt/client :get 401 "ee/sso/oidc-identities"))))))))
