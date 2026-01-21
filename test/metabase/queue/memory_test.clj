(ns metabase.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.queue.backend :as q.backend]
   [metabase.queue.memory :as q.memory])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(deftest define-queue-test
  (q.memory/reset-tracking!)
  (let [queue-name (keyword "queue" (str "define-test-" (gensym)))
        recent (q.memory/recent-callbacks)]
    (testing "Define queue creates a queue"
      (q.backend/define-queue! :queue.backend/memory queue-name)
      (is (contains? @@#'q.memory/queues queue-name))
      (is (= 0 (q.backend/queue-length :queue.backend/memory queue-name))))

    (testing "Define queue is idempotent"
      (q.backend/define-queue! :queue.backend/memory queue-name)
      (is (contains? @@#'q.memory/queues queue-name)))

    (testing "Close queue"
      (q.backend/close-queue! :queue.backend/memory queue-name)
      (is (not (contains? @@#'q.memory/queues queue-name)))
      (is (= [queue-name] @(:close-queue-callbacks recent))))))

(deftest publish-test
  (let [queue-name (keyword "queue" (str "publish-test-" (gensym)))]
    (q.backend/define-queue! :queue.backend/memory queue-name)

    (testing "Publish adds message to queue"
      (q.backend/publish! :queue.backend/memory queue-name "test-message")
      (is (= 1 (q.backend/queue-length :queue.backend/memory queue-name)))

      (q.backend/publish! :queue.backend/memory queue-name "test-message2")
      (is (= 2 (q.backend/queue-length :queue.backend/memory queue-name))))

    (testing "Publish to non-existent queue throws"
      (is (thrown-with-msg? ExceptionInfo #"Queue not defined"
                            (q.backend/publish! :queue.backend/memory :non-existent-queue "test-message"))))))

(deftest queue-length-test
  (testing "Queue length on non-existent queue throws"
    (is (thrown-with-msg? ExceptionInfo #"Queue not defined"
                          (q.backend/queue-length :queue.backend/memory :queue/non-existent-queue))))

  (let [queue-name (keyword "queue" (str "length-test-" (gensym)))]
    (testing "Queue length returns correct count"
      (q.backend/define-queue! :queue.backend/memory queue-name)
      (is (= 0 (q.backend/queue-length :queue.backend/memory queue-name)))

      (q.backend/publish! :queue.backend/memory queue-name "msg1")
      (q.backend/publish! :queue.backend/memory queue-name "msg2")
      (is (= 2 (q.backend/queue-length :queue.backend/memory queue-name))))))

(deftest listen-and-close-queue-test
  (let [queue-name (keyword "queue" (str "listen-test-" (gensym)))
        recent (q.memory/recent-callbacks)]
    (q.memory/reset-tracking!)

    (q.backend/define-queue! :queue.backend/memory queue-name)
    (testing "Listen creates queue and registers handler"
      (q.backend/listen! :queue.backend/memory queue-name)
      (is (contains? @@#'q.memory/queues queue-name)))

    (testing "Close queue removes queue and tracks closure"
      (q.backend/close-queue! :queue.backend/memory queue-name)
      (is (not (contains? @@#'q.memory/queues queue-name)))
      (is (= 1 (count @(:close-queue-callbacks recent))))
      (is (= queue-name (first @(:close-queue-callbacks recent)))))))

(deftest message-successful-test
  (let [queue-name :test-queue
        message-id "test-msg-123"
        recent (q.memory/recent-callbacks)]
    (q.memory/reset-tracking!)

    (testing "Message successful tracks the message"
      (q.backend/message-successful! :queue.backend/memory queue-name message-id)
      (is (= 1 (count @(:successful-callbacks recent))))
      (is (= message-id (first @(:successful-callbacks recent)))))

    (testing "Multiple successful messages are tracked"
      (q.backend/message-successful! :queue.backend/memory queue-name "msg-456")
      (q.backend/message-successful! :queue.backend/memory queue-name "msg-789")
      (is (= 3 (count @(:successful-callbacks recent))))
      (is (= ["test-msg-123" "msg-456" "msg-789"] @(:successful-callbacks recent))))))

(deftest message-failed-test
  (let [queue-name :test-queue
        message-id "failed-msg-123"
        recent (q.memory/recent-callbacks)]
    (q.memory/reset-tracking!)

    (testing "Message failed tracks the message"
      (q.backend/message-failed! :queue.backend/memory queue-name message-id)
      (is (= 1 (count @(:failed-callbacks recent))))
      (is (= message-id (first @(:failed-callbacks recent)))))

    (testing "Multiple failed messages are tracked"
      (q.backend/message-failed! :queue.backend/memory queue-name "failed-456")
      (q.backend/message-failed! :queue.backend/memory queue-name "failed-789")
      (is (= 3 (count @(:failed-callbacks recent))))
      (is (= ["failed-msg-123" "failed-456" "failed-789"] @(:failed-callbacks recent))))))
