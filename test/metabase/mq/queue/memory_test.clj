(ns metabase.mq.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.memory :as q.memory]
   [metabase.util.queue :as u.queue])
  (:import (clojure.lang ExceptionInfo)))

(set! *warn-on-reflection* true)

(defn- create-queue-only!
  "Creates a queue in *queues* without starting a listener thread.
  For backend-level tests that need to test publish/queue-length without consumption."
  [queue-name]
  (swap! q.memory/*queues* assoc queue-name (u.queue/delay-queue)))

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
