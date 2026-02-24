(ns metabase-enterprise.product-analytics.api.send-test
  (:require
   [clojure.test :refer [deftest is testing use-fixtures]]
   [metabase-enterprise.product-analytics.token :as pa.token]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db :web-server))

(def ^:private chrome-ua
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

(defn- valid-payload [site-uuid]
  {:type    "event"
   :payload {:website  site-uuid
             :url      "https://example.com/page"
             :referrer "https://google.com/search?q=test"
             :title    "Test Page"
             :screen   "1920x1080"
             :language "en-US"}})

(defn- send-request
  "Send a POST to /api/ee/product-analytics/send with the given body and optional request-options.
   Returns the full response map (status, headers, body)."
  ([body]
   (send-request body {}))
  ([body request-options]
   (mt/client-full-response :post "ee/product-analytics/send"
                            {:request-options (merge {:headers {"user-agent" chrome-ua
                                                                "origin"     "https://example.com"}}
                                                     request-options)}
                            body)))

;;; ------------------------------------------- Premium Feature Gating -------------------------------------------

(deftest premium-feature-gating-test
  (testing "POST /send without :product-analytics feature returns 400 (public endpoint masks 402)"
    (mt/with-premium-features #{}
      (let [response (send-request {:type "event" :payload {:website "abc" :url "https://example.com"}})]
        (is (= 400 (:status response)))))))

;;; ------------------------------------------------ Valid Event -------------------------------------------------

(deftest valid-event-payload-test
  (mt/with-premium-features #{:product-analytics}
    (mt/with-model-cleanup [:model/ProductAnalyticsEvent
                            :model/ProductAnalyticsSession
                            :model/ProductAnalyticsSite]
      (let [site-uuid (str (random-uuid))
            _site     (t2/insert-returning-instance! :model/ProductAnalyticsSite
                                                     {:name "Test Site" :uuid site-uuid})
            response  (send-request (valid-payload site-uuid))]
        (testing "returns 200 with {:ok true}"
          (is (= 200 (:status response)))
          (is (= true (get-in response [:body :ok]))))
        (testing "response includes X-Umami-Cache header with a valid JWT"
          (let [token (get-in response [:headers "X-Umami-Cache"])]
            (is (string? token))
            (is (some? (pa.token/verify-session-token token)))))
        (testing "session row exists in DB"
          (is (pos? (t2/count :model/ProductAnalyticsSession :site_id (:id _site)))))
        (testing "event row exists in DB"
          (is (pos? (t2/count :model/ProductAnalyticsEvent :site_id (:id _site)))))))))

;;; ---------------------------------------------- Invalid Payload -----------------------------------------------

(deftest invalid-payload-test
  (mt/with-premium-features #{:product-analytics}
    (testing "missing required fields returns 400"
      (let [response (send-request {:type "event" :payload {}})]
        (is (= 400 (:status response)))
        (is (string? (get-in response [:body :error])))))
    (testing "missing type returns 400"
      (let [response (send-request {:payload {:website "abc" :url "https://x.com"}})]
        (is (= 400 (:status response)))))))

;;; --------------------------------------------- Unknown Site UUID ----------------------------------------------

(deftest unknown-site-uuid-test
  (mt/with-premium-features #{:product-analytics}
    (testing "valid structure but nonexistent site returns 400"
      (let [response (send-request (valid-payload (str (random-uuid))))]
        (is (= 400 (:status response)))
        (is (= "validation/unknown-site" (get-in response [:body :error])))))))

;;; ---------------------------------------------- Bot User-Agent ------------------------------------------------

(deftest bot-user-agent-test
  (mt/with-premium-features #{:product-analytics}
    (mt/with-model-cleanup [:model/ProductAnalyticsSite]
      (let [site-uuid (str (random-uuid))
            _         (t2/insert-returning-instance! :model/ProductAnalyticsSite
                                                     {:name "Bot Test" :uuid site-uuid})
            response  (send-request (valid-payload site-uuid)
                                    {:headers {"user-agent" "Googlebot/2.1"
                                               "origin"     "https://example.com"}})]
        (testing "known bot UA returns 400"
          (is (= 400 (:status response)))
          (is (= "rejected/bot" (get-in response [:body :error]))))))))

;;; ------------------------------------------------ CORS Headers ------------------------------------------------

(deftest cors-headers-test
  (mt/with-premium-features #{:product-analytics}
    (mt/with-model-cleanup [:model/ProductAnalyticsEvent
                            :model/ProductAnalyticsSession
                            :model/ProductAnalyticsSite]
      (let [site-uuid (str (random-uuid))
            _         (t2/insert-returning-instance! :model/ProductAnalyticsSite
                                                     {:name "CORS Test" :uuid site-uuid})
            response  (send-request (valid-payload site-uuid))]
        (testing "success response includes CORS headers"
          (is (= "https://example.com" (get-in response [:headers "Access-Control-Allow-Origin"])))
          (is (= "POST, OPTIONS" (get-in response [:headers "Access-Control-Allow-Methods"])))
          (is (= "Content-Type, X-Umami-Cache" (get-in response [:headers "Access-Control-Allow-Headers"]))))))))

(deftest cors-headers-on-error-test
  (mt/with-premium-features #{:product-analytics}
    (testing "error responses also include CORS headers"
      (let [response (send-request (valid-payload (str (random-uuid))))]
        (is (= 400 (:status response)))
        (is (= "https://example.com" (get-in response [:headers "Access-Control-Allow-Origin"])))))))

;;; ------------------------------------------- Session Cache Token ----------------------------------------------

(deftest session-cache-token-roundtrip-test
  (mt/with-premium-features #{:product-analytics}
    (mt/with-model-cleanup [:model/ProductAnalyticsEvent
                            :model/ProductAnalyticsSession
                            :model/ProductAnalyticsSite]
      (let [site-uuid (str (random-uuid))
            _         (t2/insert-returning-instance! :model/ProductAnalyticsSite
                                                     {:name "Token Test" :uuid site-uuid})
            response  (send-request (valid-payload site-uuid))
            token     (get-in response [:headers "X-Umami-Cache"])
            claims    (pa.token/verify-session-token token)]
        (testing "JWT round-trips and contains expected claims"
          (is (some? claims))
          (is (string? (:session-id claims)))
          (is (string? (:visit-id claims)))
          (is (= site-uuid (:website-id claims))))))))
