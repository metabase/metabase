(ns metabase.premium-features.api-test
  (:require
   [clj-http.client :as http]
   [clj-http.cookies :as cookies]
   [clojure.test :refer :all]
   [metabase.llm.settings :as llm.settings]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest get-token-status-test
  (testing "GET /api/premium-features/token/status"
    (mt/with-random-premium-token! [_token]
      (testing "returns correctly"
        (is (= {:valid    true
                :status   "fake"
                :features ["test" "fixture"]
                :trial    false}
               (mt/user-http-request :crowberto :get 200 "premium-features/token/status"))))

      (testing "requires superusers"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :get 403 "premium-features/token/status")))))

    (mt/with-temporary-setting-values [:premium-embedding-token nil]
      (testing "returns 404 if no token is set"
        (is (= "Not found."
               (mt/user-http-request :crowberto :get 404 "premium-features/token/status")))))))

(deftest post-token-refresh-test
  (testing "POST /api/premium-features/token/refresh"
    (mt/with-random-premium-token! [_token]
      (testing "clears cache and returns fresh token status"
        (let [cleared? (atom false)]
          (with-redefs [llm.settings/llm-proxy-base-url (constantly nil)
                        token-check/clear-cache! (fn [] (reset! cleared? true))]
            (is (=? {:valid    true
                     :status   "fake"
                     :features ["test" "fixture"]}
                    (mt/user-http-request :crowberto :post 200 "premium-features/token/refresh")))
            (is (true? @cleared?)))))

      (testing "requires superusers"
        (is (= "You don't have permissions to do that."
               (mt/user-http-request :rasta :post 403 "premium-features/token/refresh")))))

    (mt/with-temporary-setting-values [:premium-embedding-token nil]
      (testing "returns 404 if no token is set"
        (is (= "Not found."
               (mt/user-http-request :crowberto :post 404 "premium-features/token/refresh")))))))

(deftest post-token-refresh-invalidates-llm-proxy-cache-test
  (testing "POST /api/premium-features/token/refresh invalidates the LLM proxy token cache when configured"
    (mt/with-random-premium-token! [token]
      (let [request* (atom nil)]
        (with-redefs [llm.settings/llm-proxy-base-url (constantly "https://proxy.example.com/")
                      http/post (fn [url request-options]
                                  (reset! request* [url request-options])
                                  {:status 200})]
          (mt/user-http-request :crowberto :post 200 "premium-features/token/refresh")
          (is (= [(str "https://proxy.example.com/v1/invalidate-token-cache/" token)
                  {:throw-exceptions false}]
                 @request*))))))

  (testing "POST /api/premium-features/token/refresh does not call the LLM proxy when it is not configured"
    (mt/with-random-premium-token! [_token]
      (with-redefs [llm.settings/llm-proxy-base-url (constantly nil)
                    http/post (fn [& _]
                                (throw (ex-info "should not be called" {})))]
        (is (=? {:valid    true
                 :status   "fake"
                 :features ["test" "fixture"]}
                (mt/user-http-request :crowberto :post 200 "premium-features/token/refresh")))))))

(deftest token-refresh-sets-premium-features-cookie-test
  (testing "POST /api/premium-features/token/refresh sets the premium-features-last-updated cookie"
    (mt/with-random-premium-token! [_token]
      (with-redefs [llm.settings/llm-proxy-base-url (constantly nil)]
        (let [cs (cookies/cookie-store)]
          (mt/user-real-request :crowberto :post 200 "premium-features/token/refresh"
                                {:request-options {:cookie-store cs}})
          (let [pf-cookie (get (cookies/get-cookies cs) "metabase.PREMIUM_FEATURES_LAST_UPDATED")]
            (is (some? pf-cookie) "No premium-features-last-updated cookie set")))))))
