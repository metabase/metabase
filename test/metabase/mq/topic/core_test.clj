(ns metabase.mq.topic.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.app-db.connection :as app-db.conn]
   [metabase.mq.core :as mq]
   [metabase.mq.listener :as listener]
   [metabase.mq.publish :as mq.publish]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.mq.test-util :as mq.tu])
  (:import (clojure.lang ExceptionInfo)
           (java.util.concurrent CyclicBarrier)))

(set! *warn-on-reflection* true)

(deftest e2e-publish-subscribe-test
  (mq.tu/with-test-mq [ctx]
    (let [received (atom [])]
      (mq/listen! :topic/e2e {}
                  (fn [message]
                    (swap! received conj message)))

      (testing "Messages are received by subscriber"
        (mq/with-topic :topic/e2e [t]
          (mq/put t "message-1"))
        (mq/with-topic :topic/e2e [t]
          (mq/put t "message-2"))
        (mq.tu/flush! ctx)
        (is (= ["message-1" "message-2"] @received)))

      (testing "Unsubscribe stops delivery"
        (mq/unlisten! :topic/e2e)
        (mq/with-topic :topic/e2e [t]
          (mq/put t "message-3"))
        (mq.tu/flush! ctx)
        (is (= ["message-1" "message-2"] @received))))))

(deftest batch-publish-e2e-test
  (mq.tu/with-test-mq [ctx]
    (let [received (atom [])]
      (mq/listen! :topic/batch {}
                  (fn [message]
                    (swap! received conj message)))

      (mq/with-topic :topic/batch [t]
        (mq/put t "a")
        (mq/put t "b")
        (mq/put t "c"))
      (mq.tu/flush! ctx)

      (testing "Batch of messages delivered together"
        (is (= ["a" "b" "c"] @received)))

      (mq/unlisten! :topic/batch))))

(deftest error-handling-e2e-test
  (mq.tu/with-test-mq [ctx]
    (let [received (atom [])]
      (mq/listen! :topic/errors {}
                  (fn [message]
                    (when (= "fail" message)
                      (throw (ex-info "Handler error" {})))
                    (swap! received conj message)))

      (mq/with-topic :topic/errors [t]
        (mq/put t "ok-1"))
      (mq/with-topic :topic/errors [t]
        (mq/put t "fail"))
      (mq/with-topic :topic/errors [t]
        (mq/put t "ok-2"))
      (mq.tu/flush! ctx)

      (testing "Non-error messages are delivered"
        (is (= ["ok-1" "ok-2"] @received)))

      (mq/unlisten! :topic/errors))))

(deftest batch-partial-failure-test
  (testing "When listener throws on one message in a batch, remaining messages are still delivered"
    (mq.tu/with-test-mq [ctx]
      (let [received (atom [])]
        (mq/listen! :topic/batch-fail {}
                    (fn [message]
                      (when (= "boom" message)
                        (throw (ex-info "Handler error" {})))
                      (swap! received conj message)))

        (mq/with-topic :topic/batch-fail [t]
          (mq/put t "msg-1")
          (mq/put t "boom")
          (mq/put t "msg-3")
          (mq/put t "msg-4"))
        (mq.tu/flush! ctx)

        (is (= ["msg-1" "msg-3" "msg-4"] @received))

        (mq/unlisten! :topic/batch-fail)))))

(deftest concurrent-subscribe-throws-test
  (mq.tu/with-test-mq [_ctx]
    (let [topic-name :topic/concurrent-sub-test
          n          10
          barrier    (CyclicBarrier. n)
          results    (atom [])]
      (testing "Concurrent listen! calls: exactly one succeeds, rest throw"
        (let [threads (mapv (fn [_]
                              (let [f (bound-fn []
                                        (.await barrier)
                                        (try
                                          (listener/listen! topic-name {} (fn [_] nil))
                                          (swap! results conj :ok)
                                          (catch ExceptionInfo _
                                            (swap! results conj :error))))]
                                (Thread. ^Runnable f)))
                            (range n))]
          (run! (fn [^Thread t] (.start t)) threads)
          (run! (fn [^Thread t] (.join t 5000)) threads)
          (is (= 1 (count (filter #{:ok} @results))))
          (is (= (dec n) (count (filter #{:error} @results))))))
      (mq/unlisten! topic-name))))

(deftest late-subscriber-test
  (mq.tu/with-test-mq [ctx]
    (mq/with-topic :topic/late [t]
      (mq/put t "old-message"))
    (mq.tu/flush! ctx)

    (let [received (atom [])]
      (mq/listen! :topic/late {}
                  (fn [message]
                    (swap! received conj message)))

      (mq/with-topic :topic/late [t]
        (mq/put t "new-message"))
      (mq.tu/flush! ctx)

      (testing "Late subscriber only sees new messages"
        (is (= ["new-message"] @received)))

      (mq/unlisten! :topic/late))))

(deftest transaction-defers-topic-publish-test
  (mq.tu/with-test-mq [ctx]
    (let [received (atom [])]
      (mq/listen! :topic/txn-test {}
                  (fn [message]
                    (swap! received conj message)))
      (binding [app-db.conn/*after-commit*      (atom [])
                app-db.conn/*transaction-state* (atom {})]
        (testing "Inside a transaction, messages are accumulated, not published immediately"
          (mq/with-topic :topic/txn-test [t]
            (mq/put t "msg1")
            (mq/put t "msg2"))
          (mq/with-topic :topic/txn-test [t]
            (mq/put t "msg3"))
          (testing "Messages are deferred in transaction state"
            (is (= ["msg1" "msg2" "msg3"]
                   (get-in @app-db.conn/*transaction-state*
                           [::mq.publish/deferred-messages :topic/txn-test]))))
          (testing "Listener has not been called yet"
            (is (= [] @received))))
        (testing "After flush (simulating commit), all messages are delivered"
          (mq.publish/flush-deferred-messages!)
          (mq.tu/flush! ctx)
          (is (= ["msg1" "msg2" "msg3"] @received))))
      (mq/unlisten! :topic/txn-test))))

(deftest transaction-rollback-discards-topic-messages-test
  (mq.tu/with-test-mq [ctx]
    (let [received (atom [])]
      (mq/listen! :topic/txn-rollback {}
                  (fn [message]
                    (swap! received conj message)))
      (binding [app-db.conn/*after-commit*      (atom [])
                app-db.conn/*transaction-state* (atom {})]
        (testing "Messages accumulated during a failed transaction are discarded"
          (is (thrown? Exception
                       (mq/with-topic :topic/txn-rollback [t]
                         (mq/put t "should-be-discarded")
                         (throw (ex-info "boom" {})))))
          (is (nil? (get-in @app-db.conn/*transaction-state*
                            [::mq.publish/deferred-messages :topic/txn-rollback]))
              "No messages should be in transaction state after exception")
          (mq.tu/flush! ctx)))
      (mq/unlisten! :topic/txn-rollback))))

(deftest outside-transaction-publishes-topic-immediately-test
  (mq.tu/with-test-mq [ctx]
    (let [received (atom [])]
      (mq/listen! :topic/txn-immediate {}
                  (fn [message]
                    (swap! received conj message)))
      (testing "Outside a transaction, messages are published"
        (is (nil? app-db.conn/*transaction-state*))
        (mq/with-topic :topic/txn-immediate [t]
          (mq/put t "msg1"))
        (mq.tu/flush! ctx)
        (is (= ["msg1"] @received)))
      (mq/unlisten! :topic/txn-immediate))))

(deftest multiple-topics-in-transaction-test
  (mq.tu/with-test-mq [ctx]
    (let [received-a (atom [])
          received-b (atom [])]
      (mq/listen! :topic/txn-multi-a {}
                  (fn [message] (swap! received-a conj message)))
      (mq/listen! :topic/txn-multi-b {}
                  (fn [message] (swap! received-b conj message)))
      (binding [app-db.conn/*after-commit*      (atom [])
                app-db.conn/*transaction-state* (atom {})]
        (mq/with-topic :topic/txn-multi-a [t]
          (mq/put t "a1")
          (mq/put t "a2"))
        (mq/with-topic :topic/txn-multi-b [t]
          (mq/put t "b1"))
        (testing "Both topics have deferred messages"
          (is (= ["a1" "a2"]
                 (get-in @app-db.conn/*transaction-state*
                         [::mq.publish/deferred-messages :topic/txn-multi-a])))
          (is (= ["b1"]
                 (get-in @app-db.conn/*transaction-state*
                         [::mq.publish/deferred-messages :topic/txn-multi-b]))))
        (testing "After flush, both topics receive their messages"
          (mq.publish/flush-deferred-messages!)
          (mq.tu/flush! ctx)
          (is (= ["a1" "a2"] @received-a))
          (is (= ["b1"] @received-b))))
      (mq/unlisten! :topic/txn-multi-a)
      (mq/unlisten! :topic/txn-multi-b))))

(deftest buffering-combines-topic-messages-test
  (mq.tu/with-test-mq [ctx]
    (let [received (atom [])]
      (mq/listen! :topic/buffer-test {}
                  (fn [message] (swap! received conj message)))
      (binding [publish-buffer/*publish-buffer-ms* 100
                publish-buffer/*publish-buffer*    (atom {})]
        (testing "buffered-publish! buffers topic messages when *publish-buffer-ms* > 0"
          (mq/with-topic :topic/buffer-test [t]
            (mq/put t "msg1"))
          (mq/with-topic :topic/buffer-test [t]
            (mq/put t "msg2"))
          (is (empty? @received)
              "Nothing delivered yet because buffer window hasn't elapsed")
          (is (= ["msg1" "msg2"]
                 (:messages (get @publish-buffer/*publish-buffer* :topic/buffer-test)))
              "Messages are buffered"))
        (testing "After flush, all messages are delivered"
          (swap! publish-buffer/*publish-buffer*
                 update :topic/buffer-test assoc :deadline-ms 1)
          (publish-buffer/flush-publish-buffer!)
          (mq.tu/flush! ctx)
          (is (= ["msg1" "msg2"] @received)
              "Both messages delivered after flush")))
      (mq/unlisten! :topic/buffer-test))))

(deftest buffering-immediate-when-zero-test
  (mq.tu/with-test-mq [ctx]
    (let [received (atom [])]
      (mq/listen! :topic/buffer-zero {}
                  (fn [message] (swap! received conj message)))
      (binding [publish-buffer/*publish-buffer-ms* 0
                publish-buffer/*publish-buffer*    (atom {})]
        (testing "With *publish-buffer-ms* 0, topic messages publish without buffering"
          (mq/with-topic :topic/buffer-zero [t]
            (mq/put t "msg1"))
          (mq.tu/flush! ctx)
          (is (= ["msg1"] @received))
          (mq/with-topic :topic/buffer-zero [t]
            (mq/put t "msg2"))
          (mq.tu/flush! ctx)
          (is (= ["msg1" "msg2"] @received))))
      (mq/unlisten! :topic/buffer-zero))))
