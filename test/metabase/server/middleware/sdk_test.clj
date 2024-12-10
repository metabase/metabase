(ns metabase.server.middleware.sdk-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest is]]
   [metabase.analytics.prometheus :as prometheus]
   [metabase.analytics.sdk :as sdk]
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
             handler (sdk/embedding-mw
                      (fn [_ respond _] (respond {:status 200 :body client})))
             response (handler request identity identity)]
         (is (= client
                (:body response "no-body"))))
    nil
    "embedding-iframe"))

(deftest bind-client-version-test
  (are [version]
       (let [request (mock-request {:version version})
             handler (sdk/embedding-mw
                      (fn [_ respond _] (respond {:status 200 :body version})))
             response (handler request identity identity)]
         (is (= version
                (:body response "no-body"))))
    nil
    "1.1.1"))

(deftest embeding-mw-bumps-metrics-with-sdk-header
  (let [prometheus-standin (atom {})]
    (with-redefs [prometheus/inc! (fn [k] (swap! prometheus-standin update k (fnil inc 0)))]
      (let [request (mock-request {:client "my-client"}) ;; <-- has X-Metabase-Client header => SDK context
            good (sdk/embedding-mw (fn [_ respond _] (respond {:status 200})))
            bad (sdk/embedding-mw (fn [_ respond _] (respond {:status 400})))
            exception (sdk/embedding-mw (fn [_ _respond raise] (raise {})))]
        (good request identity identity)
        (is (= {:metabase-sdk/response-ok 1} @prometheus-standin))
        (bad request identity identity)
        (is (= {:metabase-sdk/response-ok 1
                :metabase-sdk/response-error 1} @prometheus-standin))
        (exception request identity identity)
        (is (= {:metabase-sdk/response-ok 1
                :metabase-sdk/response-error 2} @prometheus-standin))))))

(deftest embeding-mw-does-not-bump-sdk-metrics-without-sdk-header
  (let [prometheus-standin (atom {})]
    (with-redefs [prometheus/inc! (fn [k] (swap! prometheus-standin update k (fnil inc 0)))]
      (let [request (mock-request {}) ;; <= no X-Metabase-Client header => no SDK context
            good (sdk/embedding-mw (fn [_ respond _] (respond {:status 200})))
            bad (sdk/embedding-mw (fn [_ respond _] (respond {:status 400})))
            exception (sdk/embedding-mw (fn [_ _respond raise] (raise {})))]
        (good request identity identity)
        (is (= {} @prometheus-standin))
        (bad request identity identity)
        (is (= {} @prometheus-standin))
        (exception request identity identity)
        (is (= {} @prometheus-standin))))))

(deftest include-analytics-is-idempotent
  (let [m (atom {})]
    (binding [sdk/*client* "client-C"
              sdk/*version* "1.33.7"]
      (is (= {:embedding_client "client-C"
              :embedding_version "1.33.7"} (sdk/include-analytics @m)))
      (swap! m sdk/include-analytics)
      ;; unset the vars:
      (binding [sdk/*client* nil sdk/*version* nil]
        (is (= {:embedding_client "client-C"
                :embedding_version "1.33.7"}
               @m))
        (is (= {:embedding_client "client-C"
                :embedding_version "1.33.7"}
               (sdk/include-analytics @m)))))))
