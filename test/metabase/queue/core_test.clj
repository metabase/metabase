(ns metabase.queue.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.queue.backend :as q.backend]
   [metabase.queue.core :as m.queue]
   [metabase.queue.memory :as q.memory]))

(set! *warn-on-reflection* true)

(deftest e2e-test
  (binding [q.backend/*backend* :queue.backend/memory] ;; uses the memory backend for testing
    (q.memory/reset-tracking!)
    (let [heard-messages (atom [])
          queue-name (keyword (gensym "queue/core-e2e-test-"))]
      (m.queue/define-queue! queue-name)
      (m.queue/listen! queue-name (fn [& {:keys [payload]}]
                                    (swap! heard-messages conj payload)
                                    (when (= "error!" payload)
                                      (throw (ex-info "Message Error" {:payload payload})))))

      (testing "The messages are heard and processed"
        (m.queue/publish! queue-name "test message 1")
        (m.queue/publish! queue-name "test message 2")
        (Thread/sleep 200)                                  ; Wait for listener

        (is (= ["test message 1" "test message 2"] @heard-messages))
        (is (= 2 (count @(:successful-callbacks metabase.queue.memory/recent))))
        (is (= 0 (count @(:failed-callbacks metabase.queue.memory/recent)))))

      (testing "The error messages are heard and rejected"
        (m.queue/publish! queue-name "error!")
        (Thread/sleep 200)                                  ; Wait for listener

        (is (= ["test message 1" "test message 2"  "error!"] @heard-messages))
        (is (= 2 (count @(:successful-callbacks metabase.queue.memory/recent))))
        (is (= 1 (count @(:failed-callbacks metabase.queue.memory/recent)))))

      (m.queue/stop-listening! queue-name)
      (is (= 1 (count @(:close-queue-callbacks metabase.queue.memory/recent)))))))
