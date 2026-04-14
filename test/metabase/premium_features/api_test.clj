(ns metabase.premium-features.api-test
  (:require
   [clj-http.client :as http]
   [clj-http.cookies :as cookies]
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(def fake-token-status
  {:valid    true
   :status   "fake"
   :features ["test" "fixture"]
   :trial    false})

(deftest get-token-status-test
  (testing "GET /api/premium-features/token/status"
    (testing "returns correctly"
      (with-redefs [premium-features/token-status (constantly fake-token-status)]
        (is (= fake-token-status
               (mt/user-http-request :crowberto :get 200 "premium-features/token/status")))))

    (testing "requires superusers"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :get 403 "premium-features/token/status"))))

    (testing "returns 404 if no token is set"
      (with-redefs [premium-features/token-status (constantly nil)]
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 "premium-features/token/status")))))))

(deftest post-token-refresh-test
  (testing "POST /api/premium-features/token/refresh"
    (testing "clears cache and returns fresh token status"
      (let [cleared? (atom false)]
        (mt/with-temporary-setting-values [llm-proxy-base-url nil]
          (with-redefs [premium-features/token-status           (constantly fake-token-status)
                        premium-features/premium-embedding-token (constantly nil)
                        token-check/clear-cache!                (fn [] (reset! cleared? true))]
            (is (=? (dissoc fake-token-status :trial)
                    (mt/user-http-request :crowberto :post 200 "premium-features/token/refresh")))
            (is (true? @cleared?))))))

    (testing "requires superusers"
      (is (= "You don't have permissions to do that."
             (mt/user-http-request :rasta :post 403 "premium-features/token/refresh"))))

    (testing "returns 404 if no token is set"
      (with-redefs [premium-features/token-status (constantly nil)
                    premium-features/premium-embedding-token (constantly nil)]
        (is (= "Not found."
               (mt/user-http-request :crowberto :post 404 "premium-features/token/refresh")))))))

(deftest post-token-refresh-invalidates-llm-proxy-cache-test
  (testing "POST /api/premium-features/token/refresh invalidates the AI service token cache when explicitly configured"
    (let [token "SOME_RANDOM_TOKEN"]
      (mt/with-premium-features #{:metabase-ai-managed}
        (mt/with-temp-env-var-value! [mb-premium-embedding-token nil]
          (mt/with-temporary-raw-setting-values [premium-embedding-token token]
            (mt/with-temporary-setting-values [llm-proxy-base-url  "https://proxy.example.com/llm/"
                                               ai-service-base-url "https://ai-service.example.com/"]
              (let [request* (atom nil)]
                (with-redefs [premium-features/token-status (constantly fake-token-status)
                              http/post                     (fn [url request-options]
                                                              (reset! request* [url request-options])
                                                              {:status 200})]
                  (mt/user-http-request :crowberto :post 200 "premium-features/token/refresh")
                  (is (= [(str "https://ai-service.example.com/v1/invalidate-token-cache/" token)
                          {:throw-exceptions false}]
                         @request*))))))))))

  (testing "POST /api/premium-features/token/refresh does not invalidate the AI service cache when it is not configured"
    (mt/with-temporary-setting-values [llm-proxy-base-url nil]
      (with-redefs [premium-features/token-status            (constantly fake-token-status)
                    premium-features/premium-embedding-token (constantly "proxy-token")
                    http/post                                (fn [& _]
                                                               (throw (ex-info "should not be called" {})))]
        (is (=? (dissoc fake-token-status :trial)
                (mt/user-http-request :crowberto :post 200 "premium-features/token/refresh")))))))

(deftest token-refresh-sets-premium-features-cookie-test
  (testing "POST /api/premium-features/token/refresh sets the premium-features-last-updated cookie"
    (mt/with-temporary-setting-values [llm-proxy-base-url nil]
      (with-redefs [premium-features/token-status            (constantly fake-token-status)
                    premium-features/premium-embedding-token (constantly nil)]
        (let [cs (cookies/cookie-store)]
          (mt/user-real-request :crowberto :post 200 "premium-features/token/refresh"
                                {:request-options {:cookie-store cs}})
          (let [pf-cookie (get (cookies/get-cookies cs) "metabase.PREMIUM_FEATURES_LAST_UPDATED")]
            (is (some? pf-cookie) "No premium-features-last-updated cookie set")))))))
