(ns metabase.util.log-test
  (:require
   [clojure.test :refer :all]
   [metabase.util.log :as log]
   [metabase.util.log.capture :as log.capture]
   [metabase.util.log.throttle :as log.throttle])
  (:import
   (org.apache.logging.log4j ThreadContext)))

(set! *warn-on-reflection* true)

(defn- to-map [immutable-context]
  (into {} immutable-context))

(defn- get-context-fn
  []
  (let [original-context (to-map (ThreadContext/getImmutableContext))]
    (fn []
      (let [new-context (to-map (ThreadContext/getImmutableContext))]
        (apply dissoc new-context (keys original-context))))))

(deftest with-context-test
  (let [get-context (get-context-fn)
        original-context (get-context)]
    (testing "with-context should set and reset context correctly"
      (log/with-context {:user-id 123 :action "test"}
        (is (= {"mb-user-id" "123" "mb-action" "test"}
               (get-context))
            "Context should be set inside macro"))
      (is (= original-context (get-context))
          "Context should be reset after macro"))
    (testing "with-context should handle nested contexts"
      (log/with-context {:outer "value" :empty "" :false false}
        (is (= {"mb-outer" "value" "mb-empty" "" "mb-false" "false"}
               (get-context))
            "Outer context should be set")
        (log/with-context {:inner "nested"}
          (is (= {"mb-outer" "value" "mb-inner" "nested" "mb-empty" "" "mb-false" "false"}
                 (get-context))
              "Inner context should replace outer context"))
        (is (= {"mb-outer" "value" "mb-empty" "" "mb-false" "false"}
               (get-context))
            "Outer context should be restored after nested macro")))
    (try
      (log/with-context {:error "test"}
        (throw (Exception. "Test exception")))
      (catch Exception _))
    (is (empty? (get-context))
        "Context should be reset after exception")))

(deftest ^:parallel with-error-context-works
  (testing "has correct data for a basic example"
    (is (= {:foo "bar"}
           (log/get-exception-data
            (try (log/with-context {:foo "bar"}
                   (/ 1 0))
                 (catch Exception e
                   e))))))
  (testing "nested: inner overrides outer"
    (is (= {:data "inner"}
           (log/get-exception-data
            (try (log/with-context {:data "outer"}
                   (log/with-context {:data "inner"}
                     (/ 1 0)))
                 (catch Exception e e))))))
  (testing "a caught exception => context disappears"
    (is (= {:data "outer"}
           (log/get-exception-data
            (try (log/with-context {:data "outer"}
                   (try (log/with-context {:data "inner"}
                          (/ 1 0))
                        (catch Exception _ nil))
                   (/ 1 0))
                 (catch Exception e e)))))))

(deftest throttle-test
  (testing "log/throttle evaluates body at most once per interval, per call site"
    (testing "repeated calls at one call site within the window log only once"
      (reset! log.throttle/state {})
      (log.capture/with-log-messages-for-level [messages [metabase.util.log-test :error]]
        (dotimes [_ 5]
          (log/throttle 60000
                        (log/error "boom")))
        (is (= 1 (count (messages))))))
    (testing "after the window has elapsed (state cleared), the same site logs again"
      (reset! log.throttle/state {})
      (log.capture/with-log-messages-for-level [messages [metabase.util.log-test :error]]
        (log/throttle 60000
                      (log/error "boom"))
        (is (= 1 (count (messages))))))
    (testing "the throttled body is skipped entirely — side effects don't run when suppressed"
      (reset! log.throttle/state {})
      (let [calls (atom 0)]
        (dotimes [_ 5]
          (log/throttle 60000
                        (swap! calls inc)))
        (is (= 1 @calls))))
    (testing "returns the body value when allowed, nil when throttled"
      (reset! log.throttle/state {})
      (is (= [:ok nil]
             (vec (for [_ (range 2)]
                    (log/throttle 60000 :ok))))))))
