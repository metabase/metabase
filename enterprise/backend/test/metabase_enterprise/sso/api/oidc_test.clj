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
  {:name          "test-okta"
   :display-name  "Test Okta"
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
        (testing "PUT /:slug requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :put 403 "ee/sso/oidc/test-okta"
                                       {:display-name "Updated"}))))
        (testing "DELETE /:slug requires superuser"
          (is (= "You don't have permissions to do that."
                 (mt/user-http-request :rasta :delete 403 "ee/sso/oidc/test-okta"))))))))

(deftest create-provider-test
  (testing "Creating an OIDC provider"
    (mt/with-additional-premium-features #{:sso-oidc}
      (with-redefs [oidc.check/check-oidc-configuration (constantly successful-check-result)]
        (mt/with-temporary-setting-values [oidc-providers []]
          (testing "successfully creates provider"
            (let [result (mt/user-http-request :crowberto :post 200 "ee/sso/oidc" test-provider)]
              (is (= "test-okta" (:name result)))
              (is (= "Test Okta" (:display-name result)))
              (is (= "**********et" (:client-secret result)))
              (is (= 1 (count (sso-settings/oidc-providers))))))

          (testing "rejects duplicate slug"
            (is (= "An OIDC provider with name 'test-okta' already exists"
                   (mt/user-http-request :crowberto :post 400 "ee/sso/oidc" test-provider))))

          (testing "rejects invalid slug"
            (is (mt/user-http-request :crowberto :post 400 "ee/sso/oidc"
                                      (assoc test-provider :name "INVALID SLUG!")))))))))

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
            (is (= "test-okta" (:name result)))
            (is (= "**********et" (:client-secret result)))))

        (testing "returns 404 for missing provider"
          (is (mt/user-http-request :crowberto :get 404 "ee/sso/oidc/nonexistent")))))))

(deftest update-provider-test
  (testing "Updating an OIDC provider"
    (mt/with-additional-premium-features #{:sso-oidc}
      (with-redefs [oidc.check/check-oidc-configuration (constantly successful-check-result)]
        (mt/with-temporary-setting-values [oidc-providers [test-provider]]
          (testing "successfully updates display name"
            (let [result (mt/user-http-request :crowberto :put 200 "ee/sso/oidc/test-okta"
                                               {:display-name "Updated Okta"})]
              (is (= "Updated Okta" (:display-name result)))))

          (testing "preserves client secret when masked value is sent"
            (let [result (mt/user-http-request :crowberto :put 200 "ee/sso/oidc/test-okta"
                                               {:client-secret "**********et"})
                  stored (sso-settings/get-oidc-provider "test-okta")]
              (is (= "**********et" (:client-secret result)))
              (is (= "test-client-secret" (:client-secret stored)))))

          (testing "returns 404 for missing provider"
            (is (mt/user-http-request :crowberto :put 404 "ee/sso/oidc/nonexistent"
                                      {:display-name "Updated"}))))))))

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
          (is (false? (sso-settings/oidc-enabled?)))))

      (mt/with-temporary-setting-values [oidc-providers [(assoc test-provider :enabled true)]]
        (testing "oidc-configured is true when provider has required fields"
          (is (true? (sso-settings/oidc-enabled?)))))

      (mt/with-temporary-setting-values [oidc-providers [(assoc test-provider :enabled false)]]
        (testing "oidc-enabled is false when no provider is enabled"
          (is (false? (sso-settings/oidc-enabled?))))))))
