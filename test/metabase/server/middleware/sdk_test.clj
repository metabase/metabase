(ns metabase.server.middleware.sdk-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer [are deftest is]]
   [metabase.analytics.sdk :as sdk]
   [metabase.util :as u]
   [ring.mock.request :as ring.mock]))

(defn wonk-case [s]
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
             handler (sdk/bind-embedding-mw
                      (fn [_request respond _raise] (respond client)))]
         (handler request
                  (fn [response] (= sdk/*client* response))
                  (fn [e] (throw e))))
    nil
    "embedding-iframe"))

(deftest bind-client-version-test
  (are [version]
       (let [request (mock-request {:version version})
             handler (sdk/bind-embedding-mw
                      (fn [_request respond _raise] (respond version)))]
         (handler request
                  (fn [response] (=  sdk/*version* response))
                  (fn [e] (throw e))))
    nil
    "1.1.1"))

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
