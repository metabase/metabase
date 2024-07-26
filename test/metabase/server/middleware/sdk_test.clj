(ns metabase.server.middleware.sdk-test
  (:require
   [clojure.test :refer [are deftest]]
   [metabase.analytics.sdk :as sdk]
   [ring.mock.request :as ring.mock]))

(defn- mock-request
  [{:keys [client version]}]
  (cond-> (ring.mock/request :get "api/health")
    client  (ring.mock/header :X-Metabase-Client client)
    version (ring.mock/header :X-Metabase-Client-Version version)))

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
