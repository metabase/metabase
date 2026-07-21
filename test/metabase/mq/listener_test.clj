(ns metabase.mq.listener-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.listener :as listener]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.test-util :as mq.tu])
  (:import
   (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

;;; Queues + listeners declared the production way — macros at namespace-load time. This lets
;;; us exercise the full def-queue! → register-queues! and def-listener! → register-listeners!
;;; activation path that mq.init/start! (and therefore with-test-mq) drives. Because the queues
;;; are declared, they coexist harmlessly with every other with-test-mq run in the suite (the
;;; handlers are registered but never invoked unless something publishes to these queues).

(def ^:private macro-received (atom []))

(mq/def-queue! :queue/listener-macro-test {:transactional :try})
(mq/def-listener! :queue/listener-macro-test [messages]
  (swap! macro-received into messages))

(def ^:private multi-count (atom 0))
(def ^:private multi-received (atom []))

(mq/def-queue! :queue/listener-multi-test {:transactional :try})
(mq/def-listener! :queue/listener-multi-test [messages]
  (swap! multi-count inc)
  (swap! multi-received into messages))

(deftest def-listener!-activation-test
  (reset! macro-received [])
  (mq.tu/with-test-mq [ctx]
    (testing "register-listeners! wires the macro-declared handler into *listeners*"
      (is (fn? (:listener (listener/get-listener :queue/listener-macro-test)))))
    (testing "the handler receives published messages as a vec"
      (mq/with-queue :queue/listener-macro-test [q]
        (mq/put q "a")
        (mq/put q "b"))
      (mq.tu/eventually! ctx #(= ["a" "b"] @macro-received) 5000)
      (is (= ["a" "b"] @macro-received)))))

(deftest def-listener!-multi-statement-body-test
  (reset! multi-count 0)
  (reset! multi-received [])
  (mq.tu/with-test-mq [ctx]
    (testing "every expression in a multi-statement body runs, and `messages` is bound"
      (mq/with-queue :queue/listener-multi-test [q]
        (mq/put q "m1"))
      (mq.tu/eventually! ctx #(seq @multi-received) 5000)
      (is (= ["m1"] @multi-received))
      (is (pos? @multi-count) "the side-effecting first statement also ran"))))

(deftest listener-requires-declared-queue-test
  (binding [listener/*listeners* (atom {})
            q.registry/*queues*  (atom {})]
    (testing "registering a listener for an undeclared queue throws"
      (is (thrown-with-msg? ExceptionInfo #"No queue declared"
                            (listener/batch-listen! :queue/never-declared (fn [_])))))
    (testing "succeeds once the queue is declared"
      (q.registry/register-queue! :queue/now-declared {:transactional :try})
      (listener/batch-listen! :queue/now-declared (fn [_]))
      (is (fn? (:listener (listener/get-listener :queue/now-declared)))))))

(deftest duplicate-listener-throws-test
  (binding [listener/*listeners* (atom {})
            q.registry/*queues*  (atom {})]
    (q.registry/register-queue! :queue/dup {:transactional :try})
    (listener/batch-listen! :queue/dup (fn [_]))
    (testing "a second listener on the same queue throws"
      (is (thrown-with-msg? ExceptionInfo #"Listener already registered"
                            (listener/batch-listen! :queue/dup (fn [_])))))))

(deftest register-listeners!-wraps-failures-test
  (let [channel :queue/register-failure-test]
    (try
      ;; Simulate a def-listener! whose queue was never declared.
      (defmethod listener/def-listener* channel [_]
        (listener/batch-listen! channel (fn [_])))
      (binding [listener/*listeners* (atom {})
                q.registry/*queues*  (atom {})]
        ;; Declare every OTHER macro-registered queue so the only failure is ours.
        (doseq [qn (keys (methods listener/def-listener*))
                :when (not= qn channel)]
          (q.registry/register-queue! qn {:transactional :try}))
        (testing "register-listeners! rethrows a registration failure with context"
          (is (thrown-with-msg? ExceptionInfo #"Failed to register listener"
                                (listener/register-listeners!)))))
      (finally
        (remove-method listener/def-listener* channel)))))
