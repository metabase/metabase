(ns metabase.driver.druid.client-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase.driver.druid.client :as druid.client]
            [metabase.driver.util :as driver.u]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.test.util.log :as tu.log]
            [metabase.timeseries-query-processor-test.util :as tqpt]))

(deftest query-cancelation-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (let [query (mt/mbql-query checkins)]
        (mt/with-open-channels [running-chan (a/promise-chan)
                                cancel-chan  (a/promise-chan)]
          (with-redefs [druid.client/DELETE   (fn [& _]
                                                (a/>!! cancel-chan ::cancel))
                        druid.client/do-query (fn [& _]
                                                (a/>!! running-chan ::running)
                                                (Thread/sleep 5000)
                                                (throw (Exception. "Don't actually run!")))]

            (let [out-chan (qp/process-query-async query)]
              ;; wait for query to start running, then close `out-chan`
              (a/go
                (a/<! running-chan)
                (a/close! out-chan)))
            (is (= ::cancel
                   (mt/wait-for-result cancel-chan 2000)))))))))

(deftest ssh-tunnel-test
  (mt/test-driver
   :druid
   (is (thrown?
        java.net.ConnectException
        (try
          (let [engine  :druid
                details {:ssl            false
                         :password       "changeme"
                         :tunnel-host    "localhost"
                         :tunnel-pass    "BOGUS-BOGUS"
                         :port           5432
                         :dbname         "test"
                         :host           "http://localhost"
                         :tunnel-enabled true
                         ;; we want to use a bogus port here on purpose -
                         ;; so that locally, it gets a ConnectionRefused,
                         ;; and in CI it does too. Apache's SSHD library
                         ;; doesn't wrap every exception in an SshdException
                         :tunnel-port    21212
                         :tunnel-user    "bogus"}]
            (tu.log/suppress-output
             (driver.u/can-connect-with-details? engine details :throw-exceptions)))
          (catch Throwable e
            (loop [^Throwable e e]
              (or (when (instance? java.net.ConnectException e)
                    (throw e))
                  (some-> (.getCause e) recur)))))))))

(defn- test-request [request-fn]
  (try
    (request-fn "http://localhost:8082/druid/v2"
      :auth-enabled true
      :auth-username "nbotelho"
      :auth-token    "12345678910")
    (catch Exception e
      (ex-data e))))

(defn- get-auth-header [m]
  (select-keys (:request-options m) [:basic-auth]))

(deftest auth-token-methods
  (let [get-request    (test-request druid.client/GET)
        post-request   (test-request druid.client/POST)
        delete-request (test-request druid.client/DELETE)]
    (is (= {:basic-auth "nbotelho:12345678910"}
          (get-auth-header get-request)
          (get-auth-header post-request)
          (get-auth-header delete-request)))))
