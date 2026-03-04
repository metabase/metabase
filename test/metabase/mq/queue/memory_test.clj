(ns metabase.mq.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.mq.queue.memory :as q.memory]))

(set! *warn-on-reflection* true)

(defmacro ^:private with-memory-queue
  [& body]
  `(binding [q.backend/*backend*        :queue.backend/memory
             q.impl/*listeners*          (atom {})
             q.impl/*accumulators*      (atom {})
             q.memory/*queues*          (atom {})
             q.memory/*bundle-registry* (atom {})
             q.memory/*watcher*         (atom nil)]
     (try
       ~@body
       (finally
         (q.backend/shutdown! :queue.backend/memory)))))

(deftest publish-test
  (with-memory-queue
    (let [queue-name (keyword "queue" (str "publish-test-" (gensym)))]
      (testing "Publish lazily creates queue and adds messages"
        (q.backend/publish! :queue.backend/memory queue-name ["test-message"])
        (is (= 1 (q.backend/queue-length :queue.backend/memory queue-name)))

        (q.backend/publish! :queue.backend/memory queue-name ["test-message2"])
        (is (= 2 (q.backend/queue-length :queue.backend/memory queue-name))))

      (testing "Publish to new queue lazily creates it"
        (q.backend/publish! :queue.backend/memory :queue/new-queue ["test-message"])
        (is (= 1 (q.backend/queue-length :queue.backend/memory :queue/new-queue)))))))

(deftest queue-length-test
  (with-memory-queue
    (testing "Queue length on non-existent queue returns 0"
      (is (= 0 (q.backend/queue-length :queue.backend/memory :queue/non-existent-queue))))

    (let [queue-name (keyword "queue" (str "length-test-" (gensym)))]
      (testing "Queue length returns correct count"
        (is (= 0 (q.backend/queue-length :queue.backend/memory queue-name)))

        (q.backend/publish! :queue.backend/memory queue-name ["msg1"])
        (q.backend/publish! :queue.backend/memory queue-name ["msg2"])
        (is (= 2 (q.backend/queue-length :queue.backend/memory queue-name)))))))
