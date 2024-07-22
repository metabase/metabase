(ns metabase.server.middleware.analytics-test
  (:require
   [clojure.test :refer [are deftest]]
   [metabase.server.middleware.analytics :as mw.analytics]
   [ring.mock.request :as ring.mock]))

(defn- mock-request
  [{:keys [client version]}]
  (cond-> (ring.mock/request :get "api/health")
    client  (ring.mock/header :X-Metabase-Client client)
    version (ring.mock/header :X-Metabase-Client-Version version)))

(deftest bind-client-test
  (are [client]
      (let [request (mock-request {:client client})
            handler (mw.analytics/bind-embedding
                     (fn [_request respond _raise] (respond client)))]
        (handler request
                 (fn [response] (=  mw.analytics/*metabase-client* response))
                 (fn [e] (throw e))))
    nil
    "embedding-iframe"))

(deftest bind-client-version-test
  (are [version]
      (let [request (mock-request {:version version})
            handler (mw.analytics/bind-embedding
                     (fn [_request respond _raise] (respond version)))]
        (handler request
                 (fn [response] (=  mw.analytics/*metabase-client-version* response))
                 (fn [e] (throw e))))
    nil
    "1.1.1"))
