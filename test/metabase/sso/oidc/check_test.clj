(ns metabase.sso.oidc.check-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.sso.oidc.check :as check]
   [metabase.sso.oidc.http :as oidc.http]
   [metabase.test :as mt]))

(def ^:private token-endpoint "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token")

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
    (let [captured (atom nil)]
      (mt/with-dynamic-fn-redefs [oidc.http/oidc-post (fn [_url opts]
                                                        (reset! captured (:form-params opts))
                                                        {:status 200 :body {:access_token "tok"}})]
        (check/check-credentials token-endpoint "client-id" "client-secret"
                                 ["openid" "email" "profile"])
        (is (= "openid email profile" (:scope @captured)))))))

(deftest ^:parallel check-credentials-entra-missing-scope-error-test
  (testing "Entra AADSTS90014 error is surfaced correctly when scope list is empty"
    (mt/with-dynamic-fn-redefs [oidc.http/oidc-post
                                (fn [_url _opts]
                                  {:status 400
                                   :body   {:error             "invalid_request"
                                            :error_description "AADSTS90014: The required field 'scope' is missing from the credential."}})]
      (let [result (check/check-credentials token-endpoint "client-id" "client-secret" [])]
        (is (false? (:success result)))
        (is (str/includes? (:error result) "AADSTS90014"))))))

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
