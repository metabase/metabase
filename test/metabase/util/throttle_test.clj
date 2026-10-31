(ns metabase.util.throttle-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.throttle :as u.throttle]
   [throttle.core :as throttle])
  (:import
   (java.time Instant)
   (java.util.concurrent CountDownLatch)))

(set! *warn-on-reflection* true)

(defn- attempt
  "Call `f` under `throttler` for `throttle-key`, returning `:throttled` when the throttle refuses, `:failed` when `f`
  throws an `ExceptionInfo`, and otherwise what `f` returns."
  [throttler throttle-key f]
  (try
    (u.throttle/do-with-failure-throttling throttler throttle-key f)
    (catch clojure.lang.ExceptionInfo e
      (if (u.throttle/throttle-exception? e) :throttled :failed))))

(deftest attempts-count-from-when-they-start-test
  (testing "attempts running at once count before they finish, so only threshold-many of them run"
    (let [throttler (throttle/make-throttler :username :attempts-threshold 3)
          start     (CountDownLatch. 1)
          f         (fn []
                      (Thread/sleep 200)
                      (throw (ex-info "wrong password" {})))
          calls     (doall (for [_ (range 20)]
                             (future
                               (.await start)
                               (attempt throttler "user@example.com" f))))]
      (.countDown start)
      (is (= {:failed 3, :throttled 17}
             (frequencies (map deref calls)))))))

(deftest successful-calls-do-not-count-test
  (testing "successful calls are forgotten, so later failures still get the full threshold"
    (let [throttler (throttle/make-throttler :username :attempts-threshold 3)]
      (dotimes [_ 5]
        (is (= :ok (attempt throttler "user@example.com" (constantly :ok)))))
      (is (= [:failed :failed :failed :throttled]
             (repeatedly 4 #(attempt throttler "user@example.com" (fn [] (throw (ex-info "wrong" {}))))))))))

(deftest success-keeps-attempts-recorded-while-it-runs-test
  (testing "a successful call forgets only its own attempt, not failures recorded while it ran"
    (let [throttler (throttle/make-throttler :username :attempts-threshold 3)
          fail      (fn [] (throw (ex-info "wrong" {})))
          started   (promise)
          release   (promise)
          success   (future (attempt throttler "user@example.com" (fn [] (deliver started true) @release :ok)))]
      @started
      (is (= [:failed :failed] (repeatedly 2 #(attempt throttler "user@example.com" fail))))
      (deliver release true)
      (is (= :ok @success))
      (is (= [:failed :throttled] (repeatedly 2 #(attempt throttler "user@example.com" fail)))))))

(deftest refused-attempts-do-not-count-test
  (testing "refused calls are forgotten, so successful calls running at once do not keep the key refused"
    (let [throttler (throttle/make-throttler :username :attempts-threshold 3)
          start     (CountDownLatch. 1)
          calls     (doall (for [_ (range 10)]
                             (future
                               (.await start)
                               (attempt throttler "user@example.com" (fn [] (Thread/sleep 200) :ok)))))]
      (.countDown start)
      (is (= {:ok 3, :throttled 7} (frequencies (map deref calls))))
      (is (= :ok (attempt throttler "user@example.com" (constantly :ok)))))))

(deftest inner-refusal-is-not-outer-failure-test
  (testing "a refusal by inner throttler is not counted by outer throttler"
    (let [outer (throttle/make-throttler :ip-address :attempts-threshold 2)
          inner (throttle/make-throttler :username :attempts-threshold 1)
          both  (fn [f]
                  (attempt outer "10.0.0.1" #(u.throttle/do-with-failure-throttling inner "user@example.com" f)))]
      (is (= :failed (both (fn [] (throw (ex-info "wrong" {}))))))
      (is (= :throttled (both (constantly :ok))))
      (is (= :failed (attempt outer "10.0.0.1" (fn [] (throw (ex-info "wrong" {})))))))))

(deftest failure-without-message-is-rethrown-test
  (testing "failure whose exception has no message is not taken for a refusal"
    (is (= :failed (attempt (throttle/make-throttler :username) "user@example.com" (fn [] (throw (ex-info nil {}))))))))

(deftest expired-attempts-do-not-count-test
  (testing "expired attempts neither lengthen the wait nor stay in the list"
    (let [throttler (throttle/make-throttler :username :attempts-threshold 3 :attempt-ttl-ms 60000)
          now-ms    (.toEpochMilli (Instant/now))]
      (reset! (:attempts throttler) (concat (repeat 3 ["k" (- now-ms 1000)]) (repeat 20 ["k" (- now-ms 120000)])))
      (is (thrown-with-msg? clojure.lang.ExceptionInfo #"wait 1\d seconds"
                            (u.throttle/do-with-failure-throttling throttler "k" (constantly :ok))))
      (is (= 3 (count @(:attempts throttler)))))))
