(ns metabase.mq.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.queue.test-util :as qt]
   [metabase.util.queue :as u.queue])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

#_:clj-kondo/ignore ;; should have a ! but this is a test helper and don't want to block parallel usage
(defn- create-queue-only
  "Creates a queue in *queues* without starting a listener thread.
  For backend-level tests that need to test publish/queue-length without consumption."
  [queue-name]
  (swap! q.memory/*queues* assoc queue-name (u.queue/delay-queue)))

(deftest ^:parallel publish-test
  (qt/with-memory-queue
    (let [queue-name (keyword "queue" (str "publish-test-" (gensym)))]
      (create-queue-only queue-name)

      (testing "Publish adds message to queue"
        (mq/publish! queue-name ["test-message"])
        (is (= 1 (q.backend/queue-length :queue.backend/memory queue-name)))

        (mq/publish! queue-name ["test-message2"])
        (is (= 2 (q.backend/queue-length :queue.backend/memory queue-name))))

      (testing "Publish to non-existent queue throws"
        (is (thrown-with-msg? ExceptionInfo #"Queue not defined"
                              (mq/publish! :non-existent-queue ["test-message"])))))))

(deftest ^:parallel queue-length-test
  (testing "Queue length on non-existent queue returns 0"
    (is (= 0 (q.backend/queue-length :queue.backend/memory :queue/non-existent-queue))))

  (let [queue-name (keyword "queue" (str "length-test-" (gensym)))]
    (testing "Queue length returns correct count"
      (create-queue-only queue-name)
      (is (= 0 (q.backend/queue-length :queue.backend/memory queue-name)))

      (mq/publish! queue-name ["msg1"])
      (mq/publish! queue-name ["msg2"])
      (is (= 2 (q.backend/queue-length :queue.backend/memory queue-name))))))
