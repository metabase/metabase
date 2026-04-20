(ns metabase-enterprise.metabot.api-test
  (:require
   [clj-http.client :as http]
   [clojure.test :refer :all]
   [metabase.premium-features.core :as premium-features]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest feedback-endpoint-test
  (let [store-url  "http://hm.example"
        fake-token "test-fake-token-for-feedback"]
    (testing "Submits feedback to Harbormaster with token and base URL"
      (mt/with-temporary-setting-values [store-api-url store-url]
        (let [captured     (atom nil)
              feedback     {:metabot_id        1
                            :feedback          {:positive          true
                                                :message_id        "m-1"
                                                :freeform_feedback "ok"}
                            :conversation_data {}
                            :version           "v0.0.0"
                            :submission_time   "2025-01-01T00:00:00Z"
                            :is_admin          false}
              expected-url (str store-url "/api/v2/metabot/feedback/" fake-token)]
          (mt/with-dynamic-fn-redefs
            [premium-features/premium-embedding-token (constantly fake-token)
             http/post (fn [url opts]
                         (reset! captured {:url  url
                                           :body (json/decode+kw (:body opts))}))]
            (let [_resp (mt/user-http-request :rasta :post 204 "metabot/feedback" feedback)]
              (is (= {:url expected-url :body feedback}
                     @captured)))))))

    (testing "Returns 500 when http post fails"
      (mt/with-temporary-setting-values [store-api-url store-url]
        (mt/with-dynamic-fn-redefs
          [premium-features/premium-embedding-token (constantly fake-token)
           http/post (fn [_url _opts]
                       (throw (ex-info "boom" {:status 404})))]
          (mt/user-http-request :rasta :post 500 "metabot/feedback" {:any "payload"}))))

    (testing "Throws when premium token is missing"
      (mt/with-dynamic-fn-redefs
        [premium-features/premium-embedding-token (constantly nil)]
        (mt/user-http-request :rasta :post 400 "metabot/feedback" {:foo "bar"})))))

(deftest usage-get-returns-token-status-usage-test
  (mt/with-premium-features #{:metabot-v3}
    (with-redefs [premium-features/token-status (constantly {:meters {:anthropic:claude-sonnet-4-6:tokens {:meter-value      12345
                                                                                                           :meter-updated-at "2026-04-02T19:29:12Z"}}})]
      (is (= {:tokens 12345
              :updated-at "2026-04-02T19:29:12Z"
              :is-locked nil}
             (mt/user-http-request :crowberto :get 200 "ee/metabot/usage"))))))

(deftest usage-permissions-test
  (mt/with-premium-features #{:metabot-v3}
    (mt/user-http-request :rasta :get 403 "ee/metabot/usage")))
