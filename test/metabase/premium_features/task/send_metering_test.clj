(ns metabase.premium-features.task.send-metering-test
  (:require
   [clj-http.client :as http]
   [clj-http.core :as http.core]
   [clojure.test :refer :all]
   [metabase.premium-features.task.send-metering :as send-metering]
   [metabase.premium-features.token-check :as token-check]
   [metabase.test :as mt]
   [metabase.util.json :as json]))

(set! *warn-on-reflection* true)

(deftest send-metering-events-test
  (testing "send-metering-events! makes a POST request with correct data"
    (let [request-data (atom nil)]
      (mt/with-random-premium-token! [_token]
        (with-redefs [http/post (fn [url opts]
                                  (reset! request-data {:url url :opts opts})
                                  {:status 200 :body "{}"})]
          (send-metering/send-metering-events!)
          (is (some? @request-data) "POST request should have been made")
          (when @request-data
            (is (re-find #"/v2/metering$" (:url @request-data))
                "URL should end with /v2/metering")
            (is (= :json (get-in @request-data [:opts :content-type]))
                "Content-Type should be JSON")
            (is (false? (get-in @request-data [:opts :throw-exceptions]))
                "throw-exceptions should be false")
            (let [body (json/decode (get-in @request-data [:opts :body]))]
              (is (contains? body "site-uuid")
                  "Request body should include site-uuid")
              (is (contains? body "mb-version")
                  "Request body should include mb-version")
              (is (contains? body "users")
                  "Request body should include users count"))))))))

(deftest send-metering-events-error-handling-test
  (testing "send-metering-events! handles errors gracefully"
    (mt/with-random-premium-token! [_token]
      (with-redefs [http.core/request (fn [& _] (throw (Exception. "Network error")))]
        ;; Should not throw, just log the error
        (is (nil? (send-metering/send-metering-events!)))))))

(deftest send-metering-events-no-token-test
  (testing "send-metering-events! does nothing when no token is set"
    (let [request-made (atom false)]
      (mt/with-temporary-setting-values [premium-embedding-token nil]
        (with-redefs [http/post (fn [_url _opts]
                                  (reset! request-made true)
                                  {:status 200 :body "{}"})]
          (send-metering/send-metering-events!)
          (is (false? @request-made) "No request should be made without a token"))))))

(deftest send-metering-events-airgap-token-test
  (testing "send-metering-events! does nothing for airgap tokens"
    (let [;; This is a fake airgap token format (starts with "airgap_")
          airgap-token "airgap_eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ90faketoken"
          request-made (atom false)]
      (with-redefs [token-check/check-token
                    (constantly {:valid    true
                                 :status   "fake"
                                 :features ["test" "fixture"]
                                 :trial    false})]
        (mt/with-temporary-raw-setting-values [premium-embedding-token airgap-token]
          (with-redefs [http/post (fn [_url _opts]
                                    (reset! request-made true)
                                    {:status 200 :body "{}"})]
            (send-metering/send-metering-events!)
            (is (false? @request-made) "No request should be made for airgap tokens")))))))

(deftest metering-stats-test
  (testing "metering-stats returns expected keys"
    (let [stats (token-check/metering-stats)]
      (is (map? stats))
      (is (contains? stats :users))
      (is (contains? stats :external-users))
      (is (contains? stats :internal-users))
      (is (contains? stats :domains))
      (is (contains? stats :embedding-dashboard-count))
      (is (contains? stats :embedding-question-count)))))
