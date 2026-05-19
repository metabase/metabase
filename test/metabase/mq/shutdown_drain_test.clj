(ns metabase.mq.shutdown-drain-test
  "Tests that `mq.init/stop!` performs a graceful drain of the publish buffer
  before shutting down backends, so buffered messages still land in the appdb
  tables rather than being lost."
  (:require
   [clojure.test :refer :all]
   [metabase.mq.core :as mq]
   [metabase.mq.init :as mq.init]
   [metabase.mq.listener :as listener]
   [metabase.mq.publish-buffer :as publish-buffer]
   [metabase.util.json :as json]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(deftest queue-shutdown-drains-publish-buffer-test
  (testing "stop! drains the publish buffer for queues so buffered messages land in the appdb table"
    (let [queue-name (keyword "queue" (str "shutdown-drain-" (gensym)))]
      (try
        (binding [listener/*listeners*                   (atom {})
                  publish-buffer/*publish-buffer*        (atom {})
                  publish-buffer/*publish-buffer-ms*     60000
                  publish-buffer/*publish-buffer-max-ms* 0]
          (let [handle (mq.init/start! :queue.backend/appdb)]
            (mq/with-queue queue-name [q]
              (mq/put q "drain-me"))
            (is (= ["drain-me"]
                   (get-in @publish-buffer/*publish-buffer* [queue-name :messages]))
                "Message should be sitting in the publish buffer before stop!")
            (is (empty? (t2/select :queue_message_batch :queue_name (name queue-name)))
                "Buffer drain hasn't happened yet — table should be empty")
            (mq.init/stop! handle))
          (let [rows (t2/select :queue_message_batch :queue_name (name queue-name))]
            (is (= 1 (count rows))
                "Exactly one row should exist after the graceful shutdown drain")
            (is (= ["drain-me"] (json/decode (:messages (first rows))))
                "The buffered message should have been persisted on shutdown")))
        (finally
          (t2/delete! :queue_message_batch :queue_name (name queue-name)))))))
