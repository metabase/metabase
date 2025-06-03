(ns metabase.server.middleware.sdk-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest is testing]]
   [metabase.analytics.core :as analytics]
   [metabase.analytics.sdk :as sdk]
   [metabase.test :as mt]
   [metabase.util :as u]
   [ring.mock.request :as ring.mock]))

(defn- wonk-case [s]
  (str/join (for [char s]
              (let [f (if (rand-nth [true false]) u/upper-case-en u/lower-case-en)]
                (f char)))))

(defn- mock-request
  [{:keys [client version]}]
  (cond-> (ring.mock/request :get "api/health")
    client  (ring.mock/header (keyword (wonk-case "x-metabase-client")) client)
    version (ring.mock/header (keyword (wonk-case "x-metabase-client-version")) version)))

(deftest bind-client-test
  (are [client]
       (let [request (mock-request {:client client})
             handler (analytics/embedding-mw
                      (fn [_ respond _] (respond {:status 200 :body client})))
             response (handler request identity identity)]
         (is (= client
                (:body response "no-body"))))
    nil
    "embedding-iframe"))

(deftest bind-client-version-test
  (are [version]
       (let [request (mock-request {:version version})
             handler (analytics/embedding-mw
                      (fn [_ respond _] (respond {:status 200 :body version})))
             response (handler request identity identity)]
         (is (= version
                (:body response "no-body"))))
    nil
    "1.1.1"))

(deftest embeding-mw-bumps-metrics-with-react-sdk-client-header
  (mt/with-prometheus-system! [_ system]
    ;; X-Metabase-Client header == "embedding-sdk-react" => SDK context
    (let [request (mock-request {:client @#'sdk/embedding-sdk-client})
          good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
          bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
          exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
      (good request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "200"})))
      (bad request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "400"})))
      (exception request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "400"})))
      (is (= 1.0 (mt/metric-value system :metabase-sdk/response {:status "500"}))))))

(deftest embeding-mw-bumps-metrics-with-iframe-client-header
  (mt/with-prometheus-system! [_ system]
    ;; X-Metabase-Client header == "embedding-iframe" => iframe context
    (let [request (mock-request {:client @#'sdk/embedding-iframe-client})
          good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
          bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
          exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
      (good request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "200"})))
      (bad request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "400"})))
      (exception request identity identity)
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "200"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "400"})))
      (is (= 1.0 (mt/metric-value system :metabase-embedding-iframe/response {:status "500"}))))))

(deftest embeding-mw-does-not-bump-metrics-with-random-sdk-header
  (let [prometheus-standin (atom {})]
    (with-redefs [analytics/inc! (fn [k _] (swap! prometheus-standin update k (fnil inc 0)))]
       ;; has X-Metabase-Client header, but it's not the SDK, so we don't track it
      (let [request (mock-request {:client "my-client"})
            good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
            bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
            exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
        (good request identity identity)
        (is (= {} @prometheus-standin))
        (bad request identity identity)
        (is (= {} @prometheus-standin))
        (exception request identity identity)
        (is (= {} @prometheus-standin))))))

(deftest embeding-mw-does-not-bump-sdk-metrics-without-sdk-header
  (let [prometheus-standin (atom {})]
    (with-redefs [analytics/inc! (fn [k _] (swap! prometheus-standin update k (fnil inc 0)))]
      (let [request (mock-request {}) ;; <= no X-Metabase-Client header => no SDK context
            good (analytics/embedding-mw (fn [_ respond _] (respond {:status 200})))
            bad (analytics/embedding-mw (fn [_ respond _] (respond {:status 400})))
            exception (analytics/embedding-mw (fn [_ _respond raise] (raise {})))]
        (good request identity identity)
        (is (= {} @prometheus-standin))
        (bad request identity identity)
        (is (= {} @prometheus-standin))
        (exception request identity identity)
        (is (= {} @prometheus-standin))))))

(deftest include-analytics-is-idempotent
  (let [m (atom {})]
    (analytics/with-client! ["client-C"]
      (analytics/with-version! ["1.33.7"]
        (is (= {:embedding_client "client-C"
                :embedding_version "1.33.7"}
               (analytics/include-sdk-info @m)))
        (swap! m analytics/include-sdk-info)))
    ;; unset the vars:
    (analytics/with-client! [nil]
      (analytics/with-version! [nil]
        (is (= {:embedding_client "client-C"
                :embedding_version "1.33.7"} @m))
        (testing "the values in m are used when the vars are not set"
          (is (= {:embedding_client "client-C"
                  :embedding_version "1.33.7"}
                 (analytics/include-sdk-info @m))))))))
