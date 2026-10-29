(ns metabase-enterprise.sso.api.oidc-test
  (:require
   [clojure.test :refer :all]
   [metabase-enterprise.sso.settings :as sso-settings]
   [metabase.sso.oidc.check :as oidc.check]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :test-users))

(def ^:private test-provider
  {:key           "test-okta"
   :login-prompt  "Test Okta"
   :issuer-uri    "https://test.okta.com"
   :client-id     "test-client-id"
   :client-secret "test-client-secret"
   :scopes        ["openid" "email" "profile"]
   :enabled       false})

(def ^:private successful-check-result
  {:ok true
   :discovery   {:step :discovery :success true :token-endpoint "https://test.okta.com/oauth2/token"}
   :credentials {:step :credentials :success true :verified false}})

(deftest crud-requires-superuser-test
  (testing "OIDC provider CRUD endpoints require superuser"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-temporary-setting-values [oidc-providers []]
        (testing "GET / requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :get 403 "ee/sso/oidc"))))
        (testing "POST / requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :post 403 "ee/sso/oidc" test-provider))))
        (testing "PUT /:key requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 "ee/sso/oidc/test-okta"
                                       {:login-prompt "Updated"}))))
        (testing "DELETE /:key requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403 "ee/sso/oidc/test-okta"))))))))

(deftest create-provider-test
  (testing "Creating an OIDC provider"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-dynamic-fn-redefs [oidc.check/check-oidc-configuration (constantly successful-check-result)]
        (mt/with-temporary-setting-values [oidc-providers []]
          (testing "successfully creates provider"
            (let [result (mt/user-http-request :crowberto :post 200 "ee/sso/oidc" test-provider)]
              (is (= "test-okta" (:key result)))
              (is (= "Test Okta" (:login-prompt result)))
              (is (= "**********et" (:client-secret result)))
              (is (= 1 (count (sso-settings/oidc-providers))))))
          (testing "rejects duplicate key"
            (is (= "An OIDC provider with key 'test-okta' already exists"
                   (mt/user-http-request :crowberto :post 400 "ee/sso/oidc" test-provider))))
          (testing "rejects invalid key"
            (is (mt/user-http-request :crowberto :post 400 "ee/sso/oidc"
                                      (assoc test-provider :key "INVALID SLUG!")))))))))

(def ^:private failed-check-result
  {:ok          false
   :discovery   {:step :discovery :success true :token-endpoint "https://test.okta.com/oauth2/token"}
   :credentials {:step :credentials :success false :verified true :error "Invalid client credentials"}})

(deftest create-provider-failed-check-test
  (testing "Creating an OIDC provider fails with a 400 and saves nothing when the connection check fails"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-dynamic-fn-redefs [oidc.check/check-oidc-configuration (constantly failed-check-result)]
        (mt/with-temporary-setting-values [oidc-providers []]
          (is (= "Invalid client credentials"
                 (mt/user-http-request :crowberto :post 400 "ee/sso/oidc" test-provider)))
          (is (= [] (sso-settings/oidc-providers))))))))

(deftest update-provider-failed-check-test
  (testing "Updating an OIDC provider fails with a 400 and leaves the stored provider unchanged when the connection check fails"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-dynamic-fn-redefs [oidc.check/check-oidc-configuration (constantly failed-check-result)]
        (mt/with-temporary-setting-values [oidc-providers [test-provider]]
          (is (= "Invalid client credentials"
                 (mt/user-http-request :crowberto :put 400 "ee/sso/oidc/test-okta"
                                       {:client-id     "new-client-id"
                                        :client-secret "new-client-secret"})))
          (is (= [test-provider] (sso-settings/oidc-providers))))))))

(deftest read-providers-test
  (testing "Reading OIDC providers"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-temporary-setting-values [oidc-providers [test-provider]]
        (testing "lists all providers with masked secrets"
          (let [result (mt/user-http-request :crowberto :get 200 "ee/sso/oidc")]
            (is (= 1 (count result)))
            (is (= "**********et" (:client-secret (first result))))))
        (testing "gets single provider with masked secret"
          (let [result (mt/user-http-request :crowberto :get 200 "ee/sso/oidc/test-okta")]
            (is (= "test-okta" (:key result)))
            (is (= "**********et" (:client-secret result)))))
        (testing "returns 404 for missing provider"
          (is (mt/user-http-request :crowberto :get 404 "ee/sso/oidc/nonexistent")))))))

(deftest update-provider-test
  (testing "Updating an OIDC provider"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-dynamic-fn-redefs [oidc.check/check-oidc-configuration (constantly successful-check-result)]
        (mt/with-temporary-setting-values [oidc-providers [test-provider]]
          (testing "successfully updates login prompt"
            (let [result (mt/user-http-request :crowberto :put 200 "ee/sso/oidc/test-okta"
                                               {:login-prompt "Updated Okta"})]
              (is (= "Updated Okta" (:login-prompt result)))))
          (testing "preserves client secret when masked value is sent"
            (let [result (mt/user-http-request :crowberto :put 200 "ee/sso/oidc/test-okta"
                                               {:client-secret "**********et"})
                  stored (sso-settings/get-oidc-provider "test-okta")]
              (is (= "**********et" (:client-secret result)))
              (is (= "test-client-secret" (:client-secret stored)))))
          (testing "returns 404 for missing provider"
            (is (mt/user-http-request :crowberto :put 404 "ee/sso/oidc/nonexistent"
                                      {:login-prompt "Updated"}))))))))

(deftest delete-provider-test
  (testing "Deleting an OIDC provider"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-temporary-setting-values [oidc-providers [test-provider]]
        (testing "successfully deletes provider"
          (mt/user-http-request :crowberto :delete 204 "ee/sso/oidc/test-okta")
          (is (= 0 (count (sso-settings/oidc-providers)))))))))

(deftest settings-test
  (testing "OIDC computed settings"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-temporary-setting-values [oidc-providers []]
        (testing "oidc-enabled is false with no providers"
          (is (false? (sso-settings/oidc-enabled)))))
      (mt/with-temporary-setting-values [oidc-providers [(assoc test-provider :enabled true)]]
        (testing "oidc-configured is true when provider has required fields"
          (is (true? (sso-settings/oidc-enabled)))))
      (mt/with-temporary-setting-values [oidc-providers [(assoc test-provider :enabled false)]]
        (testing "oidc-enabled is false when no provider is enabled"
          (is (false? (sso-settings/oidc-enabled))))))))

(defn- check-scopes
  "POST to the OIDC check endpoint with `body` and return the scopes it passed to the configuration check."
  [body]
  (let [scopes (atom nil)]
    (mt/with-dynamic-fn-redefs [oidc.check/check-oidc-configuration (fn [_issuer-uri _client-id _client-secret s]
                                                                      (reset! scopes s)
                                                                      successful-check-result)]
      (mt/user-http-request :crowberto :post 200 "ee/sso/oidc/check" body))
    @scopes))

(deftest check-uses-request-scopes-test
  (testing "OIDC check uses the scopes sent in the request over the stored provider's scopes"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-temporary-setting-values [oidc-providers [test-provider]]
        (is (= ["openid" "groups"]
               (check-scopes {:issuer-uri "https://test.okta.com"
                              :client-id  "test-client-id"
                              :key        "test-okta"
                              :scopes     ["openid" "groups"]})))))))

(deftest check-falls-back-to-stored-scopes-test
  (testing "OIDC check uses the stored provider's scopes when the request has none"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-temporary-setting-values [oidc-providers [test-provider]]
        (is (= ["openid" "email" "profile"]
               (check-scopes {:issuer-uri "https://test.okta.com"
                              :client-id  "test-client-id"
                              :key        "test-okta"})))))))

(deftest check-falls-back-to-openid-scope-test
  (testing "OIDC check uses the openid scope when neither the request nor a stored provider has scopes"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-temporary-setting-values [oidc-providers []]
        (is (= ["openid"]
               (check-scopes {:issuer-uri    "https://test.okta.com"
                              :client-id     "test-client-id"
                              :client-secret "test-client-secret"})))))))

(deftest check-requires-superuser-test
  (testing "OIDC check endpoint requires superuser and does not probe the provider"
    (mt/with-additional-premium-features #{:sso-oidc}
      (mt/with-temporary-setting-values [oidc-providers [test-provider]]
        (let [called? (atom false)]
          (mt/with-dynamic-fn-redefs [oidc.check/check-oidc-configuration (fn [& _]
                                                                            (reset! called? true)
                                                                            successful-check-result)]
            (is (= "You don't have permissions to do that."
                   (mt/user-http-request :rasta :post 403 "ee/sso/oidc/check"
                                         {:issuer-uri "https://test.okta.com"
                                          :client-id  "test-client-id"
                                          :key        "test-okta"
                                          :scopes     ["openid"]})))
            (is (false? @called?))))))))
