(ns metabase.queue.core-test
  (:require
   [clojure.test :refer :all]
   [metabase.queue.backend :as q.backend]
   [metabase.queue.core :as m.queue]
   [metabase.queue.memory :as q.memory]))

(set! *warn-on-reflection* true)

(deftest e2e-test
  (binding [q.backend/*backend* :queue.backend/memory]
    (q.memory/reset-tracking!)
    (let [heard-messages (atom [])
          queue-name (keyword "queue" (str "core-e2e-test-" (gensym)))
          recent (q.memory/recent-callbacks)]
      (m.queue/define-queue! queue-name)
      (m.queue/listen! queue-name (fn [{:keys [payload]}]
                                    (swap! heard-messages conj payload)
                                    (when (= "error!" payload)
                                      (throw (ex-info "Message Error" {:payload payload})))))

      (testing "The messages are heard and processed"
        (m.queue/publish! queue-name "test message 1")
        (m.queue/publish! queue-name "test message 2")
        (Thread/sleep 200)

        (is (= ["test message 1" "test message 2"] @heard-messages))
        (is (= 2 (count @(:successful-callbacks recent))))
        (is (= 0 (count @(:failed-callbacks recent)))))

      (testing "The error messages are heard and rejected"
        (m.queue/publish! queue-name "error!")
        (Thread/sleep 200)

        (is (= ["test message 1" "test message 2" "error!"] @heard-messages))
        (is (= 2 (count @(:successful-callbacks recent))))
        (is (= 1 (count @(:failed-callbacks recent)))))

      (m.queue/stop-listening! queue-name)
      (is (= 1 (count @(:close-queue-callbacks recent)))))))
