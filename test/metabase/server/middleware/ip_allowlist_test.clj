(ns metabase.server.middleware.ip-allowlist-test
  (:require
   [clojure.test :refer :all]
   [metabase.server.middleware.ip-allowlist :as mw.ip-allowlist]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [ring.mock.request :as ring.mock]
   [ring.util.response :as response]))

(use-fixtures :once (fixtures/initialize :db))

(defn- handler [request]
  ((mw.ip-allowlist/wrap-ip-allowlist
    (fn [_request respond _raise] (respond (response/response "ok"))))
   request
   identity
   (fn [e] (throw e))))

(deftest wrap-ip-allowlist-test
  (testing "When allowlist is empty, all requests are allowed"
    (mt/with-temporary-setting-values [allowed-ip-addresses nil]
      (let [response (handler (ring.mock/request :get "/api/health"))]
        (is (= 200 (:status response))))))
  (testing "When allowlist is configured, allowed IPs pass through"
    (mt/with-temporary-setting-values [allowed-ip-addresses "127.0.0.1,192.168.1.0/24"]
      (let [response (handler (-> (ring.mock/request :get "/api/health")
                                  (assoc :remote-addr "127.0.0.1")))]
        (is (= 200 (:status response))))
      (let [response (handler (-> (ring.mock/request :get "/api/health")
                                  (ring.mock/header "X-Forwarded-For" "192.168.1.50")
                                  (assoc :remote-addr "10.0.0.1")))]
        (is (= 200 (:status response))))))
  (testing "When allowlist is configured, disallowed IPs are blocked"
    (mt/with-temporary-setting-values [allowed-ip-addresses "127.0.0.1"]
      (let [response (handler (-> (ring.mock/request :get "/api/health")
                                  (assoc :remote-addr "203.0.113.5")))]
        (is (= 403 (:status response)))
        (is (= "Forbidden" (:body response))))))
  (testing "When allowlist is configured and client IP cannot be determined, request is blocked"
    (mt/with-temporary-setting-values [allowed-ip-addresses "127.0.0.1"
                                       not-behind-proxy true]
      (let [response (handler (-> (ring.mock/request :get "/api/health")
                                  (dissoc :remote-addr)))]
        (is (= 403 (:status response)))))))
