(ns metabase.queue-listener.core-test
  (:require
   [clojure.test :refer [deftest is testing]]
   [metabase.global-system.system :as system]
   [metabase.global-system.test-util :as global-system.tu]
   [metabase.queue-listener.core :as queue-listener]
   [metabase.test :as mt]
   [metabase.util.queue :as queue])
  (:import
   (java.util.concurrent LinkedBlockingQueue)))

(set! *warn-on-reflection* true)

(defn- thread-name-running? [name]
  (some #(= name (.getName ^Thread %)) (keys (Thread/getAllStackTraces))))

(defmacro ^:private await-test-while
  "Wait 100 times 10 milliseconds or until `delay-condition` becomes false and evaluate `body`.
  Reaching 100 tries results in the test failing."
  {:style/indent 1}
  [delay-condition & body]
  ;; make tries and the sleep time macro parameters if needed
  `(loop [tries# 100]
     (Thread/sleep 10)
     (cond
       (zero? tries#)   (is false "Max waiting time exceeded")
       ~delay-condition (recur (dec tries#))
       :else            (do ~@body))))

(deftest listener-handler-test
  (testing "Standard behavior with a handler"
    (let [listener-name "test-listener"
          items-handled (atom 0)
          last-batch (atom nil)
          queue (queue/delay-queue)
          thread-name "queue-test-listener-0"]
      (is (not (thread-name-running? thread-name)))
      (is (not (queue-listener/listener-exists? listener-name)))
      (queue-listener/listen! listener-name queue
                              (fn [batch] (swap! items-handled + (count batch)) (reset! last-batch batch))
                              {:max-next-ms 5})
      (is (thread-name-running? thread-name))
      (is (queue-listener/listener-exists? listener-name))
      (is (nil? (queue-listener/listen! listener-name queue
                                        (fn [batch] (throw (ex-info "Second listener with the same name cannot be created" {:batch batch})))
                                        {:max-next-ms 5})))
      (try
        (queue/put-with-delay! queue 0 "a")
        (await-test-while (zero? @items-handled)
                          (is (= 1 @items-handled))
                          (is (= ["a"] @last-batch)))
        (queue/put-with-delay! queue 0 "b")
        (queue/put-with-delay! queue 0 "c")
        (queue/put-with-delay! queue 0 "d")
        (await-test-while (< @items-handled 4)
                          (is (= 4 @items-handled))
                          (is (some #{"d"} @last-batch)))
        (finally
          (queue-listener/stop-listening! listener-name)))
      (await-test-while (thread-name-running? thread-name))
      (is (not (queue-listener/listener-exists? listener-name)))
      ; additional calls to stop are no-ops
      (is (nil? (queue-listener/stop-listening! listener-name))))))

(deftest result-listener-test
  (testing "When result and error handlers are defined, they are called correctly"
    (let [listener-name "test-result-listener"
          queue (queue/delay-queue)
          result-count (atom 0)
          error-count (atom 0)
          last-error (atom nil)]
      (queue-listener/listen! listener-name queue
                              (fn [batch]
                                (if (some #{"err"} batch)
                                  (throw (ex-info "Test Error" {:batch batch}))
                                  (count batch)))
                              {:success-handler (fn [result duration name]
                                                  (is (= listener-name name))
                                                  (is (< 0 duration))
                                                  (swap! result-count + result))
                               :err-handler     (fn [e _] (swap! error-count inc) (reset! last-error e))
                               :max-next-ms    5})
      (try
        (queue/put-with-delay! queue 0 "a")
        (await-test-while (zero? @result-count)
                          (is (= 0 @error-count))
                          (is (= 1 @result-count)))
        (queue/put-with-delay! queue 0 "err")
        (await-test-while (zero? @error-count)
                          (is (= 1 @error-count))
                          (is (= 1 @result-count))
                          (is (= "Test Error" (.getMessage ^Exception @last-error))))
        (finally
          (queue-listener/stop-listening! listener-name))))))

(deftest multithreaded-listener-test
  (testing "Test behavior with a multithreaded listener"
    (let [listener-name "test-multithreaded-listener"
          thread-name-0 (str "queue-" listener-name "-0")
          thread-name-1 (str "queue-" listener-name "-1")
          thread-name-2 (str "queue-" listener-name "-2")
          batches-handled (atom 0)
          handlers-used (atom #{})
          queue (queue/delay-queue)]
      (is (not (thread-name-running? thread-name-0)))
      (is (not (thread-name-running? thread-name-1)))
      (is (not (thread-name-running? thread-name-2)))
      (queue-listener/listen! listener-name
                              queue
                              (fn [batch] (is (<= (count batch) 10)) (count batch))
                              {:success-handler    (fn [result _ name] (swap! batches-handled + result) (swap! handlers-used conj name))
                               :pool-size          3
                               :max-batch-messages 10
                               :max-next-ms        5})
      (try
        (is (thread-name-running? thread-name-0))
        (is (thread-name-running? thread-name-1))
        (is (thread-name-running? thread-name-2))
        (dotimes [i 100]
          (queue/put-with-delay! queue 0 i))
        (await-test-while (< @batches-handled 100)
                          (is (= 100 @batches-handled))
                          (is (contains? @handlers-used listener-name)))
        (finally
          (queue-listener/stop-listening! listener-name)))
      (await-test-while (or (thread-name-running? thread-name-0)
                            (thread-name-running? thread-name-1)
                            (thread-name-running? thread-name-2))))))

(deftest error-resilience-test
  (testing "An AssertionError thrown by the handler does not kill the listener thread"
    (let [listener-name "test-error-resilience"
          thread-name   "queue-test-error-resilience-0"
          call-count    (atom 0)
          queue         (queue/delay-queue)]
      (queue-listener/listen! listener-name queue
                              (fn [batch]
                                (swap! call-count inc)
                                (when (some #{"boom"} batch)
                                  (throw (AssertionError. "simulated assertion error")))
                                (count batch))
                              {:max-next-ms 5})
      (try
        ;; First message triggers AssertionError
        (queue/put-with-delay! queue 0 "boom")
        (await-test-while (zero? @call-count)
                          (is (= 1 @call-count)))
        ;; Thread should still be alive
        (is (thread-name-running? thread-name)
            "Listener thread should survive an AssertionError")
        ;; Second message should still be processed
        (queue/put-with-delay! queue 0 "ok")
        (await-test-while (< @call-count 2)
                          (is (= 2 @call-count)))
        (finally
          (queue-listener/stop-listening! listener-name))))))

(deftest restart-after-err-handler-failure-test
  (testing "Listener restarts when err-handler itself throws an Error"
    (let [listener-name   "test-restart-on-err-handler"
          thread-name     "queue-test-restart-on-err-handler-0"
          call-count      (atom 0)
          err-handler-ran (atom false)
          queue           (queue/delay-queue)]
      (queue-listener/listen! listener-name queue
                              (fn [batch]
                                (swap! call-count inc)
                                (when (some #{"fail"} batch)
                                  (throw (Exception. "handler exception")))
                                (count batch))
                              {:err-handler  (fn [_e _name]
                                               (reset! err-handler-ran true)
                                               ;; err-handler itself throws an Error, escaping the inner catch
                                               (throw (AssertionError. "err-handler assertion error")))
                               :max-next-ms 5})
      (try
        ;; First message triggers the handler exception -> err-handler -> AssertionError
        ;; This escapes listener-thread's inner catch, but listener-thread-with-restart should restart it
        (queue/put-with-delay! queue 0 "fail")
        (await-test-while (not @err-handler-ran)
                          (is @err-handler-ran))
        ;; Wait for restart backoff (initial-restart-backoff-ms = 500ms) plus margin
        (Thread/sleep 1000)
        ;; Thread should be alive again after restart
        (is (thread-name-running? thread-name)
            "Listener thread should restart after err-handler throws an Error")
        ;; Verify second message is processed normally
        (queue/put-with-delay! queue 0 "ok")
        (await-test-while (< @call-count 2)
                          (is (= 2 @call-count)))
        (finally
          (queue-listener/stop-listening! listener-name))))))

(deftest start-listeners-registers-with-the-global-system-test
  (testing "the listeners start through the global system, so a halt stops them, and stopping them unregisters them"
    (let [listener-name "global-system-test-listener"
          handle        @#'queue-listener/listeners-component
          halts?        #(boolean (some #{handle} (#'system/halt-order (#'system/dependency-graph {}))))]
      (global-system.tu/with-root handle nil
        (mt/with-dynamic-fn-redefs [queue-listener/init-listeners!
                                    #(queue-listener/listen! listener-name (LinkedBlockingQueue.) identity {})]
          (try
            (queue-listener/start-listeners!)
            (let [after-start {:halts? (halts?), :running? (queue-listener/listener-exists? listener-name)}]
              (queue-listener/stop-listeners!)
              (is (= {:after-start {:halts? true, :running? true}
                      :after-stop  {:halts? false, :running? false}}
                     {:after-start after-start
                      :after-stop  {:halts? (halts?), :running? (boolean (queue-listener/listener-exists? listener-name))}})))
            (finally
              (queue-listener/stop-listening! listener-name))))))))
