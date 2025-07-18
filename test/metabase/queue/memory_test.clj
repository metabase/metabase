(ns metabase.queue.memory-test
  (:require
   [clojure.test :refer :all]
   [metabase.queue.backend :as q.backend]
   [metabase.queue.memory :as q.memory]
   [toucan2.core :as t2]))

(defn- clear-test-rows [queues]
  (t2/delete! :model/QueueMessage :queue_name [:in (map name queues)]))

(defn- mock-batch-handler [batch _args] (map #(if (= "err" %)
                                                (throw (ex-info "Error in handler" {:message %}))
                                                (str % "-out")) batch))

(deftest create-and-remove-queue
  (let [queue-name (keyword "queue" (str (gensym "test-")))]
    (q.backend/listen! :queue.backend/memory queue-name mock-batch-handler)
    (is (contains? @@#'q.memory/queues queue-name))
    (q.backend/close-queue! :queue.backend/memory queue-name)
    (is (not (contains? @@#'q.memory/queues queue-name)))))
