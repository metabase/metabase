(ns metabase.mq.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.mq.queue.tracking :as q.tracking]
   [metabase.util.queue :as u.queue])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- create-queue-only!
  "Creates a queue in *queues* without starting a listener thread.
  For backend-level tests that need to test publish/queue-length without consumption."
  [queue-name]
  (swap! q.memory/*queues* assoc queue-name (u.queue/delay-queue)))

(deftest listen-and-close-queue-test
  (let [queue-name (keyword "queue" (str "listen-test-" (gensym)))
        recent (q.tracking/recent-callbacks)]
    (q.tracking/reset-tracking!)

    (testing "Listen creates queue and registers handler"
      (q.backend/listen! :queue.backend/tracking queue-name)
      (is (contains? @q.memory/*queues* queue-name)))

    (testing "Queue length starts at 0"
      (is (= 0 (q.backend/queue-length :queue.backend/tracking queue-name))))

    (testing "Stop listening removes queue and tracks closure"
      (q.backend/stop-listening! :queue.backend/tracking queue-name)
      (is (not (contains? @q.memory/*queues* queue-name)))
      (is (= 1 (count @(:close-queue-callbacks recent))))
      (is (= queue-name (first @(:close-queue-callbacks recent)))))))

(deftest ^:parallel publish-test
  (let [queue-name (keyword "queue" (str "publish-test-" (gensym)))]
    (create-queue-only! queue-name)

    (testing "Publish adds message to queue"
      (q.backend/publish! :queue.backend/memory queue-name ["test-message"])
      (is (= 1 (q.backend/queue-length :queue.backend/memory queue-name)))

      (q.backend/publish! :queue.backend/memory queue-name ["test-message2"])
      (is (= 2 (q.backend/queue-length :queue.backend/memory queue-name))))

    (testing "Publish to non-existent queue throws"
      (is (thrown-with-msg? ExceptionInfo #"Queue not defined"
                            (q.backend/publish! :queue.backend/memory :non-existent-queue ["test-message"]))))))

(deftest ^:parallel queue-length-test
  (testing "Queue length on non-existent queue returns 0"
    (is (= 0 (q.backend/queue-length :queue.backend/memory :queue/non-existent-queue))))

  (let [queue-name (keyword "queue" (str "length-test-" (gensym)))]
    (testing "Queue length returns correct count"
      (create-queue-only! queue-name)
      (is (= 0 (q.backend/queue-length :queue.backend/memory queue-name)))

      (q.backend/publish! :queue.backend/memory queue-name ["msg1"])
      (q.backend/publish! :queue.backend/memory queue-name ["msg2"])
      (is (= 2 (q.backend/queue-length :queue.backend/memory queue-name))))))

(deftest message-successful-test
  (let [queue-name :test-queue
        message-id "test-msg-123"
        recent (q.tracking/recent-callbacks)]
    (q.tracking/reset-tracking!)

    (testing "Message successful tracks the message"
      (q.backend/batch-successful! :queue.backend/tracking queue-name message-id)
      (is (= 1 (count @(:successful-callbacks recent))))
      (is (= message-id (first @(:successful-callbacks recent)))))

    (testing "Multiple successful messages are tracked"
      (q.backend/batch-successful! :queue.backend/tracking queue-name "msg-456")
      (q.backend/batch-successful! :queue.backend/tracking queue-name "msg-789")
      (is (= 3 (count @(:successful-callbacks recent))))
      (is (= ["test-msg-123" "msg-456" "msg-789"] @(:successful-callbacks recent))))))

(deftest message-failed-test
  (let [queue-name :test-queue
        message-id "failed-msg-123"
        recent (q.tracking/recent-callbacks)]
    (q.tracking/reset-tracking!)

    (testing "Message failed tracks the message"
      (q.backend/batch-failed! :queue.backend/tracking queue-name message-id)
      (is (= 1 (count @(:failed-callbacks recent))))
      (is (= message-id (first @(:failed-callbacks recent)))))

    (testing "Multiple failed messages are tracked"
      (q.backend/batch-failed! :queue.backend/tracking queue-name "failed-456")
      (q.backend/batch-failed! :queue.backend/tracking queue-name "failed-789")
      (is (= 3 (count @(:failed-callbacks recent))))
      (is (= ["failed-msg-123" "failed-456" "failed-789"] @(:failed-callbacks recent))))))
