(ns metabase.query-processor.setup-test
  (:require
   [clojure.core.async :as a]
   [clojure.test :refer :all]
   [metabase.driver.settings :as driver.settings]
   [metabase.query-processor.pipeline :as qp.pipeline]
   [metabase.query-processor.setup :as qp.setup]))

(set! *warn-on-reflection* true)

(deftest ^:parallel internal-query-type-test
  (testing "Make sure internal (audit app) queries work, even tho they don't have a :database ID."
    (qp.setup/with-qp-setup [query {:type :internal}]
      (is (= {:type :internal}
             query)))))

(deftest ^:parallel canceled-chan-timer-fires-on-query-timeout-test
  (testing "When a query runs longer than *query-timeout-ms*, *canceled-chan* receives a ::timeout message"
    ;; this is the cross-driver cancel path that backs up Statement.setQueryTimeout — see GHY-3266 (MySQL slow view
    ;; fingerprinting): when setQueryTimeout doesn't reliably KILL QUERY on the server, the timer here puts
    ;; ::timeout on *canceled-chan*, which drives Statement.cancel() and forces the driver to issue a server-side
    ;; cancel anyway.
    (binding [driver.settings/*query-timeout-ms* 100]
      (let [observed-chan (promise)
            observed-val  (promise)
            slow-f        (fn [_query]
                            (let [chan qp.pipeline/*canceled-chan*]
                              (deliver observed-chan chan)
                              (let [[v p] (a/alts!! [chan (a/timeout 2000)])]
                                (deliver observed-val {:val v :from-canceled-chan? (identical? p chan)}))))
            f             (#'qp.setup/do-with-canceled-chan slow-f)]
        (f {:type :internal})
        (is (some? @observed-chan)
            "the QP should bind a *canceled-chan* for the query")
        (is (:from-canceled-chan? @observed-val)
            "the canceled-chan should have been signaled before the 2s fallback timeout")
        (is (= ::qp.setup/timeout (:val @observed-val))
            "the timer should put ::timeout to *canceled-chan* once *query-timeout-ms* elapses")))))

(deftest ^:parallel canceled-chan-timer-does-not-fire-when-query-completes-first-test
  (testing "When a query finishes before *query-timeout-ms*, the timer never puts ::timeout on the chan"
    (binding [driver.settings/*query-timeout-ms* 60000]
      (let [observed-after-close (promise)
            fast-f               (fn [_query]
                                   ;; mimic the pipeline's success path which closes *canceled-chan*
                                   (a/close! qp.pipeline/*canceled-chan*)
                                   ;; give the go-block a moment to see the close
                                   (Thread/sleep 100)
                                   (deliver observed-after-close (a/poll! qp.pipeline/*canceled-chan*)))
            f                    (#'qp.setup/do-with-canceled-chan fast-f)]
        (f {:type :internal})
        (is (nil? @observed-after-close)
            "a closed chan should poll nil — the timer must not have written ::timeout to it")))))

(deftest ^:parallel canceled-chan-timer-does-not-consume-external-cancel-signal-test
  (testing "Timer must not consume the cancel signal when callers bind a regular (a/chan)"
    ;; Regression for mongo `kill-an-in-flight-query-test`: that test binds `*canceled-chan*` to a regular
    ;; `(a/chan)` (not a promise-chan) and puts a cancel sentinel on it; the driver listener takes from the chan
    ;; to abort the in-flight query. If the timer reads from `*canceled-chan*` (via `alts!`/`<!`), it races the
    ;; driver listener for the value and on a regular chan one of them consumes it, breaking the other.
    (binding [driver.settings/*query-timeout-ms* 60000]
      (let [external-chan (a/chan)
            slow-f        (fn [_query]
                            (a/>!! qp.pipeline/*canceled-chan* ::external-cancel)
                            ;; give the timer's go-block a moment to (incorrectly) consume the message
                            (Thread/sleep 300))]
        (binding [qp.pipeline/*canceled-chan* external-chan]
          (let [f (#'qp.setup/do-with-canceled-chan slow-f)
                ;; consume from the external chan on a separate thread, mimicking what a driver's cancel listener
                ;; does. If the timer consumed the message, this take will time out.
                taken (future (a/alts!! [external-chan (a/timeout 1000)]))]
            (f {:type :internal})
            (let [[v p] (deref taken 2000 [::deref-timed-out ::deref-timed-out])]
              (is (identical? external-chan p)
                  "the external listener should win the take, not time out")
              (is (= ::external-cancel v)
                  "the external listener should see the original cancel sentinel"))))))))
