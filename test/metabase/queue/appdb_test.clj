(ns metabase.queue.appdb-test
  (:require
   [clojure.test :refer :all]
   [metabase.queue.appdb :as q.appdb]
   [metabase.queue.backend :as q.backend]
   [toucan2.core :as t2]))

(defn- clear-test-rows [queues]
  (t2/delete! :model/QueuePayload :queue_name [:in (map name queues)]))

(defn- mock-batch-handler [batch _args] (map #(if (= "err" %)
                                                (throw (ex-info "Error in handler" {:message %}))
                                                (str % "-out")) batch))

(defn- mock-response-handler [status queue-name response] [status queue-name response])

(deftest create-and-remove-queue
  (let [queue-name (keyword "queue" (str (gensym "test-")))]
    (q.backend/listen! :queue.backend/appdb queue-name mock-batch-handler)
    (is (contains? @@#'q.appdb/queues queue-name))
    (q.backend/close-queue! :queue.backend/appdb queue-name)
    (is (not (contains? @@#'q.appdb/queues queue-name)))))

(deftest get-next-batch
  (let [queue1 (keyword (gensym "queue/queue1"))
        queue2 (keyword (gensym "queue/queue2"))
        invalid-queue (keyword (gensym "queue/queue-invalid"))]
    (with-redefs [q.appdb/queues (atom {queue1 identity queue2 identity})]
      (t2/with-connection [conn]
        (testing "Returns nil if no queues are defined"
          (with-redefs [q.appdb/queues (atom {})]
            (is (nil? (#'q.appdb/get-next-batch conn)))))

        (testing "Returns nil if no rows are found"
          (is (nil? (#'q.appdb/get-next-batch conn))))

        (testing "Returns finds a row for a valid queue"
          (t2/insert! :model/QueuePayload
                      {:queue_name   (name invalid-queue)
                       :num_messages 1
                       :payload      [{:test "invalid"}]})
          (t2/insert! :model/QueuePayload
                      {:queue_name   (name queue1)
                       :num_messages 1
                       :payload      [{:test "data1"}]})
          (t2/insert! :model/QueuePayload
                      {:queue_name   (name queue2)
                       :num_messages 1
                       :payload      [{:test "data2"}]})
          (let [[id queue-name data] (#'q.appdb/get-next-batch conn)]
            (is (pos-int? id))
            (is (= queue1 queue-name))
            (is (= [{:test "data1"}] data))))))))

(deftest process-batch
  (let [queue-name :queue/queue1]
    (t2/with-connection [conn]
      (testing "Processes a batch of messages"
        (clear-test-rows [queue-name])
        (let [batch ["data1" "data2"]
              message-id (t2/insert-returning-pk! :model/QueuePayload
                                                  {:queue_name   (name queue-name)
                                                   :num_messages 1
                                                   :payload      batch})]
          (is (= ["data1-out" "data2-out"] (#'q.appdb/process-batch message-id queue-name mock-batch-handler batch {:conn conn})))
          (is (= 0 (t2/count :model/QueuePayload :queue_name (name queue-name))))

          (testing "if the row is already deleted, it doesn't throw an error"
            (= ["data1-out" "data2-out"] (#'q.appdb/process-batch -1 queue-name mock-batch-handler batch {:conn conn}))
            (is (= 0 (t2/count :model/QueuePayload :queue_name (name queue-name)))))))
      (testing "If the handler throws an exception, the message should not be deleted from the queue"
        (clear-test-rows [queue-name])
        (let [batch ["data1" "err" "data3"]
              message-id (t2/insert-returning-pk! :model/QueuePayload
                                                  {:queue_name   (name queue-name)
                                                   :num_messages 1
                                                   :payload      batch})]
          (is (thrown? Exception (#'q.appdb/process-batch message-id queue-name mock-batch-handler batch {:conn conn})))
          (is (= 1 (t2/count :model/QueuePayload :queue_name (name queue-name)))))))))

(deftest poll
  (let [queue-name :queue/test-queue]
    (clear-test-rows [queue-name])
    (with-redefs [q.appdb/queues (atom {queue-name {:batch-handler mock-batch-handler :response-handler mock-response-handler}})]
      (testing "When nothing is in the queue, the handler should not be called"
        (is (= [:empty nil] (#'q.appdb/poll!))))

      (testing "When there are batches the queue, the handler should be called and the batch deleted from the queue"
        (q.backend/flush! :queue.backend/appdb queue-name ["test1" "test2" "test3"])
        (q.backend/flush! :queue.backend/appdb queue-name ["test4" "test5"])
        (is (= 5 (q.backend/queue-length :queue.backend/appdb queue-name)))
        (let [[result promise] (#'q.appdb/poll!)]
          (is (= result :success))
          (is (= [:success queue-name ["test1-out" "test2-out" "test3-out"]] @promise)))
        (is (= 2 (q.backend/queue-length :queue.backend/appdb queue-name)))
        (clear-test-rows [queue-name]))

      (testing "Handler throws an exception"
        (q.backend/flush! :queue.backend/appdb queue-name ["test1" "err" "test3"])
        (is (= 3 (q.backend/queue-length :queue.backend/appdb queue-name)))
        (let [[status promise] (#'q.appdb/poll!)
              [response-status response-name response] @promise]
          (is (= :error status))
          (is (= queue-name response-name))
          (is (= :error response-status))
          (is (= "Error in handler" (.getMessage ^Throwable response))))
        (testing "The message should not be deleted from the queue"
          (is (= 3 (q.backend/queue-length :queue.backend/appdb queue-name))))))))

;(deftest poll
;  (let [queue-name :queue/test-queue
;        listener (m.queue/->BatchedPersistentQueue queue-name)]
;    (m.queue/clear-queue! queue-name)
;    (m.queue/with-queue queue-name [queue]
;      (m.queue/put queue "test1")
;      (m.queue/put queue "test2")
;      (m.queue/put queue "test3")
;
;      (testing "When nothing has been flushed the to queue, the handler should not be called"
;        (is (= [nil 0] (u.queue/process-batch! listener identity)))))
;
;    (testing "After queue flushes, the handler should be called with the messages"
;      (is (= 3 (m.queue/queue-length queue-name)))
;      (is (= [["test1" "test2" "test3"] 3] (u.queue/process-batch! listener identity))))
;
;    (testing "After polling the queue should be empty"
;      (is (= 0 (m.queue/queue-length queue-name)))
;      (is (= [nil 0] (u.queue/process-batch! listener identity))))
;
;    (testing "If the handler throws an exception, the message should not be deleted from the queue"
;      (m.queue/with-queue queue-name [queue]
;        (m.queue/put queue "test4"))
;
;      (try
;        (do
;          (u.queue/process-batch! listener (fn [_] (throw (Exception. "Test exception"))))
;          (is (not "Exception should have been thrown")))
;        (catch Exception _
;          (is (= 1 (m.queue/queue-length queue-name)))))
;      (u.queue/process-batch! listener (fn [messages] (is (= ["test4"] messages)))))))
