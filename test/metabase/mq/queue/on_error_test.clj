(ns metabase.mq.queue.on-error-test
  "Tests for a queue's `:on-error` handler — the hook that fires when a batch has exhausted its
  retries and would otherwise be silently dropped.

  The handler is invoked from the shared retry-vs-drop policy
  ([[metabase.mq.queue.impl/handle-batch-failure-policy!]]), which every backend routes through, so a
  queue gets the same terminal-failure semantics no matter which backend is running. Backend parity
  is asserted here for the poll backend and in `metabase.mq.queue.quartz-test` for the push backend.

  Listeners here are registered with [[metabase.mq.listener/batch-listen!]] rather than `def-listener!`
  (which only registers a `defmethod` that `register-listeners!` realizes at startup — too late inside
  `with-test-mq`) or `mq.tu/listen!` (which isolates per-message errors, swallowing the very failures
  under test)."
  (:require
   [clojure.test :refer :all]
   [metabase.analytics-interface.core :as analytics]
   [metabase.mq.core :as mq]
   [metabase.mq.listener :as listener]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.test-util :as mq.tu]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest on-error-fires-once-with-messages-and-cause-test
  (testing "a batch that exhausts its retries invokes :on-error with the messages and the cause"
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (let [dropped  (atom [])
            attempts (atom 0)
            boom     (ex-info "always boom" {:reason :boom})]
        (mq.tu/with-test-mq [ctx]
          (q.registry/register-queue!
           :queue/on-error-basic
           {:transactional :try
            :on-error      (fn [info] (swap! dropped conj info))})
          (listener/batch-listen!
           :queue/on-error-basic
           (fn [_messages]
             (swap! attempts inc)
             (throw boom)))
          (mq/with-queue :queue/on-error-basic [q]
            (mq/put q {:id 1})
            (mq/put q {:id 2}))
          (is (mq.tu/eventually! ctx #(seq @dropped) 5000)
              ":on-error fires once the batch exhausts its retries")
          (is (= 1 (count @dropped))
              ":on-error fires once *per batch*, on the terminal drop — not on every failed attempt.
               (Once per batch is not once per payload: see
               duplicate-delivery-fires-on-error-for-an-already-succeeded-payload-test.)")
          (let [info (first @dropped)]
            (is (= #{:channel :messages :error :attempts} (set (keys info))))
            (is (= :queue/on-error-basic (:channel info)))
            (is (= [{:id 1} {:id 2}] (:messages info))
                "the handler receives the decoded messages of the dropped batch")
            (is (= boom (:error info))
                "the handler receives the exception that failed the last attempt")
            (is (= 2 (:attempts info))
                "the handler is told how many attempts were made")))))))

(deftest on-error-not-called-while-retries-remain-test
  (testing ":on-error does not fire for a failure that will be retried and then succeeds"
    (mt/with-temporary-setting-values [queue-max-retries 3]
      (let [dropped  (atom [])
            attempts (atom 0)
            handled  (atom nil)]
        (mq.tu/with-test-mq [ctx]
          (q.registry/register-queue!
           :queue/on-error-recovers
           {:transactional :try
            :on-error      (fn [info] (swap! dropped conj info))})
          (listener/batch-listen!
           :queue/on-error-recovers
           (fn [messages]
             ;; fail the first attempt, succeed on the retry
             (when (= 1 (swap! attempts inc))
               (throw (ex-info "transient" {})))
             (reset! handled messages)))
          (mq/with-queue :queue/on-error-recovers [q]
            (mq/put q "eventually-ok"))
          (is (mq.tu/eventually! ctx #(some? @handled) 5000)
              "the batch is retried and succeeds")
          (is (= ["eventually-ok"] @handled))
          (is (= [] @dropped)
              ":on-error must not fire for a transient failure that later succeeds"))))))

(deftest on-error-not-called-on-success-test
  (testing ":on-error is never invoked for a batch that is delivered cleanly"
    (let [dropped (atom [])
          handled (atom nil)]
      (mq.tu/with-test-mq [ctx]
        (q.registry/register-queue!
         :queue/on-error-happy
         {:transactional :try
          :on-error      (fn [info] (swap! dropped conj info))})
        (listener/batch-listen!
         :queue/on-error-happy
         (fn [messages] (reset! handled messages)))
        (mq/with-queue :queue/on-error-happy [q]
          (mq/put q "fine"))
        (mq.tu/flush! ctx)
        (is (= ["fine"] @handled))
        (is (= [] @dropped))))))

(deftest on-error-handler-that-throws-still-drops-the-batch-test
  (testing "a throwing :on-error handler is contained — the batch is still dropped, not retried forever"
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (let [called   (atom 0)
            attempts (atom 0)]
        (mq.tu/with-test-mq [ctx]
          (q.registry/register-queue!
           :queue/on-error-throws
           {:transactional :try
            :on-error      (fn [_info]
                             (swap! called inc)
                             (throw (ex-info "handler itself blew up" {})))})
          (listener/batch-listen!
           :queue/on-error-throws
           (fn [_messages]
             (swap! attempts inc)
             (throw (ex-info "always boom" {}))))
          (mq/with-queue :queue/on-error-throws [q]
            (mq/put q "doomed"))
          (is (mq.tu/eventually! ctx #(pos? @called) 5000)
              ":on-error is invoked")
          ;; If the throwing handler escaped the drop path, the batch would be re-delivered and
          ;; attempts would keep climbing past the retry budget.
          (Thread/sleep 500)
          (is (= 2 @attempts)
              "the batch is still dropped after exactly queue-max-retries attempts")
          (is (= 1 @called)
              ":on-error is not re-invoked"))))))

(deftest listener-error-still-goes-through-the-retry-policy-test
  (testing "a listener that throws an `Error` rather than an `Exception` must still go through the
            retry/drop policy.

            `Error` is not exotic here: a failed `assert` or `{:pre ...}` throws `AssertionError`, and
            a namespace that fails to load lazily on a worker thread throws
            `ExceptionInInitializerError`. If the delivery core only catches `Exception`, an `Error`
            escapes past the retry budget entirely and into the backend's hand-off failure path —
            which is built to *refire the same job with the same attempt number*, on the assumption
            that the message was never delivered. The batch would then re-run forever on one node,
            burning no retry budget and never reaching `:on-error`."
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (let [dropped  (atom [])
            attempts (atom 0)]
        (mq.tu/with-test-mq [ctx]
          (q.registry/register-queue!
           :queue/on-error-throwable
           {:transactional :try
            :on-error      (fn [info] (swap! dropped conj info))})
          (listener/batch-listen!
           :queue/on-error-throwable
           (fn [_messages]
             (swap! attempts inc)
             (throw (AssertionError. "an assert blew up inside the listener"))))
          (mq/with-queue :queue/on-error-throwable [q]
            (mq/put q "doomed"))
          (is (mq.tu/eventually! ctx #(seq @dropped) 5000)
              "an Error exhausts the retry budget and reaches :on-error, like any other failure")
          (Thread/sleep 500)
          (is (= 2 @attempts)
              "and is retried exactly queue-max-retries times — not refired without a budget")
          (is (= 1 (count @dropped))
              ":on-error fires once, on the terminal drop")
          (is (instance? AssertionError (:error (first @dropped)))
              "the handler receives the Error that failed the batch"))))))

(deftest drop-path-bookkeeping-failure-does-not-redeliver-test
  (testing "a failure in the drop path's *bookkeeping* — the log line and the `batches-dropped`
            counter — must not redeliver the batch or re-run its `:on-error`.

            `run-on-error!` is carefully built so it can never throw, precisely so a broken handler
            cannot escape into the backend's retry machinery. But the logging and metrics calls
            sitting next to it were unguarded, and a backend reads any exception out of this policy
            as \"the message was not handed off\" — so it refires the batch with its attempt counter
            untouched. The listener runs again, fails again, is over budget again, and `:on-error`
            fires a second time for a batch that was already dropped."
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (let [dropped  (atom [])
            attempts (atom 0)
            orig     analytics/inc!]
        ;; a metrics backend that is down exactly when we try to record the drop
        (with-redefs [analytics/inc! (fn [metric & args]
                                       (if (= metric :metabase-mq/batches-dropped)
                                         (throw (ex-info "metrics backend is down" {}))
                                         (apply orig metric args)))]
          (mq.tu/with-test-mq [ctx]
            (q.registry/register-queue!
             :queue/on-error-drop-bookkeeping
             {:transactional :try
              :on-error      (fn [info] (swap! dropped conj info))})
            (listener/batch-listen!
             :queue/on-error-drop-bookkeeping
             (fn [_messages]
               (swap! attempts inc)
               (throw (ex-info "always boom" {}))))
            (mq/with-queue :queue/on-error-drop-bookkeeping [q]
              (mq/put q "doomed"))
            (is (mq.tu/eventually! ctx #(seq @dropped) 5000)
                ":on-error still fires when the drop metric blows up")
            (Thread/sleep 500)
            (is (= 1 (count @dropped))
                ":on-error fires once — a failed drop metric must not resurrect the batch")
            (is (= 2 @attempts)
                "and the batch is not redelivered past its retry budget")))))))

(deftest queue-without-on-error-still-drops-test
  (testing "a queue that declares no :on-error keeps the old behavior: exhaust retries, then drop"
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (let [attempts (atom 0)]
        (mq.tu/with-test-mq [ctx]
          (q.registry/register-queue! :queue/on-error-absent {:transactional :try})
          (listener/batch-listen!
           :queue/on-error-absent
           (fn [_messages]
             (swap! attempts inc)
             (throw (ex-info "always boom" {}))))
          (mq/with-queue :queue/on-error-absent [q]
            (mq/put q "doomed"))
          (is (mq.tu/eventually! ctx #(= 2 @attempts) 5000))
          (Thread/sleep 500)
          (is (= 2 @attempts)
              "still dropped after queue-max-retries, with no handler configured"))))))

(deftest duplicate-delivery-fires-on-error-for-an-already-succeeded-payload-test
  (testing "PINS A KNOWN LIMITATION — this is the behavior we have, not the behavior we want.

            A duplicate delivery whose copy *fails* will run out its own retry budget and fire
            `:on-error` for a payload that another copy already handled successfully.

            The reason is that a message has no identity. A retry is a brand-new trigger with a fresh
            id, and the attempt counter rides along inside it, so two deliveries of one payload are
            two independent batches with two independent retry budgets and nothing joining them. A
            success on one node cannot cancel, or even be observed by, a copy failing on another —
            which is precisely what happens when Quartz's cluster failover re-fires a batch onto a
            second node because the first missed a heartbeat while still running it.

            So an `:on-error` handler must be idempotent *and* tolerate firing for work that in fact
            succeeded. This is why the explorations handlers guard their writes on the row still
            being `pending` rather than blindly stamping it `error`.

            Closing this needs message identity plus a record of what has been delivered. When that
            lands, this test should flip to asserting `(= [] @dropped)`."
    (mt/with-temporary-setting-values [queue-max-retries 2]
      (let [dropped   (atom [])
            succeeded (atom 0)
            calls     (atom 0)]
        (mq.tu/with-test-mq [ctx {:duplicate-delivery? true}]
          (q.registry/register-queue!
           :queue/on-error-duplicate
           {:transactional :try
            :on-error      (fn [info] (swap! dropped conj info))})
          (listener/batch-listen!
           :queue/on-error-duplicate
           (fn [_messages]
             ;; the first copy of the payload lands cleanly; the duplicate is the one that fails
             (if (= 1 (swap! calls inc))
               (swap! succeeded inc)
               (throw (ex-info "this delivery failed, but the work is already done" {})))))
          (mq/with-queue :queue/on-error-duplicate [q]
            (mq/put q "already-done"))
          (is (mq.tu/eventually! ctx #(seq @dropped) 5000)
              "the failing duplicate exhausts its retries")
          (is (= 1 @succeeded)
              "the payload was handled successfully — the work is done")
          (is (= 1 (count @dropped))
              ":on-error still fires for it, because the failing copy has its own retry budget and no
               way to learn that the work already succeeded"))))))

(deftest on-error-must-be-a-fn-test
  (testing "the queue config schema accepts an :on-error fn and rejects a non-fn"
    (binding [q.registry/*queues* (atom {})]
      (is (nil? (q.registry/register-queue! :queue/on-error-schema-ok
                                            {:transactional :try :on-error (fn [_] nil)}))
          "a fn is accepted")
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo #"Invalid config for queue"
           (q.registry/register-queue! :queue/on-error-schema-bad
                                       {:transactional :try :on-error "not-a-fn"}))
          "a non-fn :on-error is rejected at declaration time"))))
