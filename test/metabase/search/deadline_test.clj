(ns metabase.search.deadline-test
  (:require
   [clojure.test :refer :all]
   [metabase.search.deadline :as deadline]
   [metabase.search.settings :as search.settings]
   [metabase.test :as mt]
   [metabase.test.util.dynamic-redefs :as dynamic-redefs]
   [toucan2.jdbc.options :as jdbc.options])
  (:import
   (java.util.concurrent CountDownLatch TimeUnit)))

(set! *warn-on-reflection* true)

(defonce ^:private test-app-db-id (atom 0))

(defn- identity-key []
  ;; Production application-db IDs are positive; keep synthetic runs in a disjoint numeric range.
  {:app-db-id (swap! test-app-db-id dec), :engine "appdb"})

(deftest ^:parallel synchronous-run-and-disabled-deadline-test
  (mt/with-dynamic-fn-redefs [search.settings/search-reindex-timeout-minutes (constantly 0)]
    (let [options jdbc.options/*options*
          thread  (Thread/currentThread)]
      (is (= :result
             (deadline/do-with-run (identity-key)
                                   (fn []
                                     (is (identical? thread (Thread/currentThread)))
                                     (is (= options jdbc.options/*options*))
                                     (is (false? (deadline/timed-out?)))
                                     :result)))))))

(deftest ^:parallel statement-budget-follows-run-limit-test
  (doseq [[minutes prior expected] [[30 0 1800] [30 7 7] [0 0 0] [0 7 7]]]
    (mt/with-dynamic-fn-redefs [search.settings/search-reindex-timeout-minutes (constantly minutes)]
      (binding [jdbc.options/*options* {:timeout prior}]
        (is (= expected (deadline/do-with-run (identity-key) #(:timeout jdbc.options/*options*))))))))

(deftest ^:parallel completion-cancels-late-interruption-test
  (let [callbacks (atom [])]
    (mt/with-dynamic-fn-redefs [search.settings/search-reindex-timeout-minutes (constantly 60)
                                deadline/schedule! (fn [_ f] (swap! callbacks conj f) nil)]
      (is (= :finished (deadline/do-with-run (identity-key) (constantly :finished)))))
    (doseq [callback @callbacks] (callback))
    (is (false? (.isInterrupted (Thread/currentThread))))))

(deftest ^:parallel timer-interrupts-worker-and-releases-local-slot-test
  (let [identity (identity-key)
        schedule (dynamic-redefs/original-fn #'deadline/schedule!)]
    (mt/with-dynamic-fn-redefs [search.settings/search-reindex-timeout-minutes (constantly 60)
                                deadline/report! (fn [& _])
                                deadline/schedule! (fn [ms f] (schedule (if (= ms 3600000) 50 1000) f))]
      (is (= ::deadline/exceeded
             (:type
              (ex-data
               (try
                 (deadline/do-with-run identity #(.await (CountDownLatch. 1)))
                 (catch Exception e e))))))
      (is (false? (.isInterrupted (Thread/currentThread))))
      (is (= :next (deadline/do-with-run identity (constantly :next)))))))

(deftest ^:parallel ignored-interrupt-is-reported-without-replacement-test
  (let [identity (identity-key)
        release  (CountDownLatch. 1)
        stuck    (promise)
        started  (promise)
        schedule (dynamic-redefs/original-fn #'deadline/schedule!)]
    (mt/with-dynamic-fn-redefs [search.settings/search-reindex-timeout-minutes (constantly 60)
                                deadline/report! (fn [_ event] (when (= event :worker-stuck) (deliver stuck true)))
                                deadline/schedule! (fn [ms f] (schedule (if (= ms 3600000) 50 100) f))]
      (let [worker (future
                     (try
                       (deadline/do-with-run
                        identity
                        (fn []
                          (deliver started true)
                          (loop []
                            (when-not (try
                                        (.await release 1 TimeUnit/SECONDS)
                                        (catch InterruptedException _ false))
                              (recur)))
                          :ignored-cancellation))
                       (catch Exception e (:type (ex-data e)))))]
        (try
          (is (true? (deref started 5000 false)))
          (is (true? (deref stuck 5000 false)) "stuck reporting does not wait for worker exit")
          (is (= {:acquired? false} (deadline/do-with-run identity #(throw (ex-info "must not start" {})))))
          (finally
            (.countDown release)))
        (is (= ::deadline/exceeded (deref worker 5000 ::timeout)))
        (is (= :next (deadline/do-with-run identity (constantly :next))))))))

(deftest ^:parallel expired-run-rejects-new-work-before-timer-test
  (let [context {:identity   (identity-key)
                 :run-id     "expired-test"
                 :started-ns (- (System/nanoTime) 1000)
                 :state      (atom {:exited? false, :status :running})
                 :timeout-ns 1
                 :worker     (Thread/currentThread)}]
    (mt/with-dynamic-fn-redefs [deadline/report! (fn [& _])]
      (binding [deadline/*run-context* context]
        (try
          (is (thrown-with-msg? clojure.lang.ExceptionInfo #"deadline exceeded" (deadline/check!)))
          (is (deadline/timed-out?))
          (finally
            (Thread/interrupted)))))))
