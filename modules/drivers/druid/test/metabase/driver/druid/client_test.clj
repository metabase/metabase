(ns metabase.driver.druid.client-test
  (:require [clojure.core.async :as a]
            [clojure.test :refer :all]
            [metabase.driver.druid.client :as druid.client]
            [metabase.driver.util :as driver.u]
            [metabase.query-processor :as qp]
            [metabase.query-processor.context.default :as default]
            [metabase.test :as mt]
            [metabase.timeseries-query-processor-test.util :as tqpt]))

(set! *warn-on-reflection* true)

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

(deftest query-timeout-test
  (mt/test-driver :druid
    (tqpt/with-flattened-dbdef
      (let [query (mt/mbql-query checkins)
            executed-query (atom nil)]
        (with-redefs [druid.client/do-query-with-cancellation (fn [_chan _details query]
                                                                (reset! executed-query query)
                                                                [])]
          (qp/process-query-sync query)
          (is (partial= {:context {:timeout default/query-timeout-ms}}
                        @executed-query)))))))

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
            (driver.u/can-connect-with-details? engine details :throw-exceptions))
          (catch Throwable e
            (loop [^Throwable e e]
              (or (when (instance? java.net.ConnectException e)
                    (throw e))
                  (some-> (.getCause e) recur)))))))))
