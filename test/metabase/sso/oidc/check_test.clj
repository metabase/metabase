(ns metabase.sso.oidc.check-test
  (:require
   [clojure.test :refer :all]
   [metabase.sso.oidc.check :as check]
   [metabase.sso.oidc.http :as oidc.http]
   [metabase.test :as mt]))

(def ^:private token-endpoint "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token")

(def ^:private non-entra-token-endpoint "https://test.okta.com/oauth2/default/v1/token")

(defn- sent-scope
  "Call `check-credentials` against `endpoint` with `scopes` and return the `scope` form param it POSTed."
  [endpoint scopes]
  (let [captured (atom nil)]
    (mt/with-dynamic-fn-redefs [oidc.http/oidc-post (fn [_url opts]
                                                      (reset! captured (:form-params opts))
                                                      {:status 200 :body {:access_token "tok"}})]
      (check/check-credentials endpoint "client-id" "client-secret" scopes))
    (:scope @captured)))

(deftest ^:parallel check-credentials-includes-scope-test
  (testing "scope param is always included in the token endpoint request"
    (let [captured (atom nil)]
      (mt/with-dynamic-fn-redefs [oidc.http/oidc-post (fn [_url opts]
                                                        (reset! captured (:form-params opts))
                                                        {:status 200 :body {:access_token "tok"}})]
        (check/check-credentials token-endpoint "client-id" "client-secret" ["openid"])
        (is (contains? @captured :scope)
            "form-params must include :scope — Entra ID rejects requests without it (AADSTS90014)")))))

(deftest ^:parallel check-credentials-uses-provided-scopes-test
  (testing "configured scopes are sent space-joined"
    (is (= "openid email profile"
           (sent-scope non-entra-token-endpoint ["openid" "email" "profile"])))))

(deftest ^:parallel check-credentials-entra-adds-default-scope-test
  (testing "OIDC credential check adds the app's own .default scope for Entra ID token endpoints (AADSTS1002012)"
    (doseq [endpoint ["https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token"
                      "https://login.windows.net/tenant-id/oauth2/v2.0/token"
                      "https://login.microsoft.com/tenant-id/oauth2/v2.0/token"
                      "https://login-us.microsoftonline.com/tenant-id/oauth2/v2.0/token"
                      "https://login.microsoftonline.us/tenant-id/oauth2/v2.0/token"
                      "https://login.partner.microsoftonline.cn/tenant-id/oauth2/v2.0/token"
                      "https://login.chinacloudapi.cn/tenant-id/oauth2/v2.0/token"
                      "https://LOGIN.MicrosoftOnline.com/tenant-id/oauth2/v2.0/token"]]
      (testing endpoint
        (is (= "openid email profile client-id/.default"
               (sent-scope endpoint ["openid" "email" "profile"])))))))

(deftest ^:parallel check-credentials-entra-keeps-configured-default-scope-test
  (testing "OIDC credential check leaves Entra ID scopes alone when a .default scope is already configured"
    (is (= "openid https://graph.microsoft.com/.default"
           (sent-scope token-endpoint ["openid" "https://graph.microsoft.com/.default"])))))

(deftest ^:parallel check-credentials-non-entra-default-scope-test
  (testing "OIDC credential check never adds a .default scope for non-Entra token endpoints"
    (is (= "openid"
           (sent-scope non-entra-token-endpoint ["openid"])))))

(deftest ^:parallel check-credentials-entra-empty-scopes-test
  (testing "OIDC credential check sends only the app's own .default scope for Entra ID when no scopes are configured"
    (is (= "client-id/.default"
           (sent-scope token-endpoint [])))))

(deftest ^:parallel check-credentials-entra-invalid-scope-error-test
  (testing "OIDC credential check surfaces the full Entra ID invalid_scope error description"
    (mt/with-dynamic-fn-redefs [oidc.http/oidc-post
                                (fn [_url _opts]
                                  {:status 400
                                   :body   {:error             "invalid_scope"
                                            :error_description "AADSTS1002012: The provided value for scope openid is not valid."}})]
      (is (= {:step     :credentials
              :success  false
              :verified true
              :error    "Unexpected response from token endpoint (HTTP 400): AADSTS1002012: The provided value for scope openid is not valid."}
             (check/check-credentials token-endpoint "client-id" "client-secret" ["openid"]))))))

(deftest ^:parallel check-credentials-success-test
  (testing "HTTP 200 → success"
    (mt/with-dynamic-fn-redefs [oidc.http/oidc-post (fn [_url _opts]
                                                      {:status 200 :body {:access_token "tok"}})]
      (is (= {:step :credentials :success true :verified true}
             (check/check-credentials token-endpoint "client-id" "client-secret" ["openid"])))))
  (testing "unsupported_grant_type → inconclusive success"
    (mt/with-dynamic-fn-redefs [oidc.http/oidc-post (fn [_url _opts]
                                                      {:status 400 :body {:error "unsupported_grant_type"}})]
      (let [result (check/check-credentials token-endpoint "client-id" "client-secret" ["openid"])]
        (is (true? (:success result)))
        (is (false? (:verified result))))))
  (testing "invalid_client → failure"
    (mt/with-dynamic-fn-redefs [oidc.http/oidc-post (fn [_url _opts]
                                                      {:status 401 :body {:error "invalid_client"}})]
      (let [result (check/check-credentials token-endpoint "client-id" "wrong-secret" ["openid"])]
        (is (false? (:success result)))
        (is (= "Invalid client ID or client secret" (:error result)))))))
