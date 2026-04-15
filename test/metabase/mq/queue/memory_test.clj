(ns metabase.mq.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.test-util :as mq.tu]))

(set! *warn-on-reflection* true)

(deftest publish-test
  (mq.tu/with-test-mq [ctx]
    (let [queue-name (keyword "queue" (str "publish-test-" (gensym)))
          received   (atom [])]
      (mq/listen! queue-name {} (fn [msg] (swap! received conj msg)))
      (testing "Publish lazily creates channel and delivers messages"
        (mq/with-queue queue-name [q]
          (mq/put q "test-message")
          (mq/put q "test-message2"))
        (mq.tu/flush! ctx)
        (is (= ["test-message" "test-message2"] @received))))))

(deftest exclusive-memory-test
  (mq.tu/with-test-mq [ctx]
    (let [queue-name :queue/exclusive-test
          received   (atom [])]
      (mq/listen! queue-name
                  {:exclusive true}
                  (fn [msg] (swap! received conj msg)))
      (testing "Exclusive queue processes all messages"
        (mq/with-queue queue-name [q]
          (mq/put q "msg1")
          (mq/put q "msg2")
          (mq/put q "msg3")
          (mq/put q "msg4")
          (mq/put q "msg5"))
        (mq.tu/flush! ctx)
        (is (= ["msg1" "msg2" "msg3" "msg4" "msg5"] @received))))))
