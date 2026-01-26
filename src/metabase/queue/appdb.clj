(ns metabase.queue.appdb
  "Database-backed implementation of the message queue using the application database."
  (:require
   [metabase.models.interface :as mi]
   [metabase.queue.backend :as q.backend]
   [metabase.queue.listener :as q.listener]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private owner-id (str (random-uuid)))
(def ^:private background-process (atom nil))
(def ^:private listening-queues (atom #{}))

(defmethod q.backend/define-queue!
  :queue.backend/appdb [_ _queue-name]
  nil)

(defn- fetch!
  "Fetches the next pending message from any of the listening queues.
  Returns a map with :id, :queue, and :payload keys, or nil if no messages are available.
  Marks the fetched message as 'processing' within the same transaction."
  []
  (when (seq @listening-queues)
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
        (t2/update! :model/QueueMessage
          (:id row)
          {:status_heartbeat (mi/now)
           :status           "processing"
           :owner            owner-id})
        {:id      (:id row)
         :queue   (keyword "queue" (:queue_name row))
         :payload (:payload row)}))))

(defn- start-polling!
  "Starts the background polling process if not already running."
  []
  (when-not @background-process
    (log/info "Starting background process for appdb queue")
    (reset! background-process
      (future
        (try
          (loop []
            (when (seq @listening-queues)
              (when-let [result (fetch!)]
                (log/info "Processing payload" {:queue (:queue result)})
                (q.listener/handle! result))
              (Thread/sleep 2000)
              (recur)))
          (catch InterruptedException _
            (log/info "Background process interrupted")))
        (log/info "Stopping background process for appdb queue")
        (reset! background-process nil)))))

(defmethod q.backend/listen! :queue.backend/appdb [_ queue-name]
  (when-not (contains? @listening-queues queue-name)
    (swap! listening-queues conj queue-name)
    (log/infof "Registered listener for queue %s" (name queue-name))
    (start-polling!)))

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
