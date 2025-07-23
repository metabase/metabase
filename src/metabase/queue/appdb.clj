(ns metabase.queue.appdb
  (:require [metabase.models.interface :as mi]
            [metabase.queue.backend :as q.backend]
            [metabase.queue.listener :as q.listener]
            [metabase.util :as u]
            [metabase.util.log :as log]
            [toucan2.core :as t2]))

(def ^:private owner-id (str (random-uuid)))
(def ^:private background-process (atom nil))
(def ^:private listening-queues (atom #{}))

(defmethod q.backend/define-queue!
  :queue.backend/appdb [_ _queue-name]
  ;;no-op for appdb
  )

(defn- fetch! []
  (when (not (empty? @listening-queues))
    (first @listening-queues)
    (t2/with-transaction [conn]
      (when-let [row (t2/query-one
                      conn
                      {:select   [:*]
                       :from     [(t2/table-name :model/QueueMessage)]
                       :where    [:and
                                  [:in :queue_name (map name @listening-queues)]
                                  [:= :status "pending"]]
                       :order-by [[:id :asc]]
                       :limit    1
                       :for      [:update :skip-locked]})]
        (u/prog1 {:id      (:id row)
                  :queue   (keyword "queue" (:queue_name row))
                  :payload (:payload row)}
          (t2/update! :model/QueueMessage
                      (:id row)
                      {:status_heartbeat (mi/now)
                       :status           "processing"
                       :owner            owner-id}))))))

;(defn- process-batch
;  "Runs the handler against a batch of messages and deletes the message from the queue if the handler did not throw an exception"
;  [message-id queue-name handler batch args]
;  (log/debugf "Processing batch of %d messages in queue %s" (count batch) queue-name)
;  (let [response (handler batch args)
;        ;; Make sure any handler computation is fully executed before deleting the row
;        response-realized (if (seq? response) (doall response) response)
;        del_count (t2/query-one (:conn args) {:delete-from (t2/table-name :model/QueueMessage)
;                                              :where       [:= :id message-id]})]
;    (when (= 0 del_count) (log/warnf "Message %d was already deleted from the queue. Likely error in concurrency handling" message-id))
;    response-realized))

;(defn- poll! []
;  (try
;    (t2/with-transaction [conn]
;      (log/infof "Checking for queued messages")
;      (if-let [[message-id queue-name batch] (fetch!)]
;        (let [handlers (get #p @queues #p queue-name)
;              {:keys [batch-handler response-handler]} handlers]
;          (log/infof "Found batch of %d messages in queue %s" (count batch) (name queue-name))
;          (if (empty? handlers)
;            (u/prog1 [:empty nil]
;              (log/infof "No handler for queue %s in %s" (name queue-name) (keys @queues)))
;            (do
;              (log/infof "Processing batch of %d messages in queue %s" (count batch) (name queue-name))
;              (try
;                (let [response (process-batch message-id queue-name batch-handler batch {:conn conn})]
;                  (log/info "Batch processed successfully")
;                  [:success (future (response-handler :success queue-name response))])
;                (catch Throwable e
;                  (u/prog1 [:error (future (response-handler :error queue-name e))]
;                    (log/error e "Error processing batch")))))))
;        (u/prog1 [:empty nil]
;          (log/info "No waiting messages in queue"))))
;    (catch Throwable e
;      (u/prog1 [:empty nil]
;        (log/error e "Error in background process")))))

(defn- start-polling! []
  (when-not @background-process
    (log/info "Starting background process for appdb queue")
    (reset! background-process
            (future
              (try
                (while (not (empty? @listening-queues))
                  (let [result (fetch!)]
                    (when-not (nil? result)
                      (log/info "Processing payload" {:queue (:queue result)})
                      (q.listener/handle! result)))
                  (Thread/sleep 2000))
                (catch InterruptedException _
                  (log/info "Background process interrupted")))
              (log/info "Stopping background process for appdb queue")
              (reset! background-process nil)))))

(defmethod q.backend/listen! :queue.backend/appdb [_ queue-name]
  (when-not (contains? @listening-queues queue-name)
    (swap! listening-queues conj queue-name)
    (log/infof "Registered handler for queue %s" (name queue-name))
    (start-polling!)
    queue-name))

(defmethod q.backend/clear-queue! :queue.backend/appdb
  [_ queue-name]
  (t2/delete! :model/QueueMessage :queue_name (name queue-name)))

(defmethod q.backend/close-queue! :queue.backend/appdb [_ queue-name]
  (swap! listening-queues disj queue-name)
  (log/infof "Unregistered handler for queue %s" (name queue-name)))

(defmethod q.backend/queue-length :queue.backend/appdb
  [_ queue]
  (or
   (t2/select-one-fn :num [:model/QueueMessage [[:count :*] :num]] :queue_name (name queue))
   0))

(defmethod q.backend/publish! :queue.backend/appdb
  [_ queue payload]
  (t2/with-transaction [_conn]
    (t2/insert! :model/QueueMessage
                {:queue_name (name queue)
                 :payload    payload})))

(defmethod q.backend/message-successful! :queue.backend/appdb
  [_ _queue-name message-id]
  (let [deleted (t2/delete! :model/QueueMessage message-id)]
    (when (= 0 deleted)
      (log/warnf "Message %d was already deleted from the queue. Likely error in concurrency handling" message-id))))

(defmethod q.backend/message-failed! :queue.backend/appdb
  [_ _queue-name message-id]
  (let [updated (t2/update! :model/QueueMessage
                            {:id    message-id
                             :owner owner-id}
                            {:status           "pending"
                             :failures         [:+ :failures 1]
                             :status_heartbeat (mi/now)
                             :owner            nil})]
    (when (= 0 updated)
      (log/warnf "Message %d was not found in the queue. Likely error in concurrency handling" message-id))))

;(deftype BatchedPersistentQueue
;  [queue-name]
;  BatchedQueue
;  (process-batch! [_this handler]
;    (t2/with-transaction []
;      (log/debugf "Checking for messages in queue %s" (name queue-name))
;      (if-let [message (t2/query-one
;                         [(str "select * from " (name (t2/table-name :model/QueueMessage))
;                            " where queue_name = '" (name queue-name) "' order by id asc limit 1 for update skip locked")])]
;        (let [payload (-> message :payload mi/json-out-with-keywordization)]
;          (log/debugf "Processing batch of %d messages in queue %s" (count payload) (name queue-name))
;          [(u/prog1 (handler payload)
;             (let [del_count (t2/delete! :model/QueueMessage (:id message))]
;               (when (= 0 del_count) (log/warnf "Message %d was already deleted from the queue. Likely error in concurrency handling" (:id message))))) (count payload)])
;        (u/prog1 [nil 0]
;          (log/debugf "No waiting messages in queue %s" (name queue-name))
;          (Thread/sleep 1000))))))
