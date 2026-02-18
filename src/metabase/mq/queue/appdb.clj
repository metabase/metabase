(ns metabase.mq.queue.appdb
  "Database-backed implementation of the message queue using the application database."
  (:require
   [metabase.models.interface :as mi]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.listener :as q.listener]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private owner-id (str (random-uuid)))
(def ^:private background-process (atom nil))
(def ^:private listening-queues (atom #{}))

(defmethod q.backend/define-queue!
  :mq.queue.backend/appdb [_ _queue-name]
  nil)

(defn- fetch!
  "Fetches the next pending message from any of the listening queues.
  Returns a map with :id, :queue, and :messages keys, or nil if no messages are available.
  Marks the fetched message as 'processing' within the same transaction."
  []
  (when (seq @listening-queues)
    (t2/with-transaction [conn]
      (when-let [row (t2/query-one
                      conn
                      {:select   [:*]
                       :from     [:queue_message]
                       :where    [:and
                                  [:in :queue_name (map name @listening-queues)]
                                  [:= :status "pending"]]
                       :order-by [[:id :asc]]
                       :limit    1
                       :for      [:update :skip-locked]})]
        (t2/update! :queue_message
                    (:id row)
                    {:status_heartbeat (mi/now)
                     :status           "processing"
                     :owner            owner-id})
        {:id       (:id row)
         :queue    (keyword "queue" (:queue_name row))
         :messages (json/decode (:messages row))}))))

(def ^:private error-backoff-ms
  "Backoff time after an unexpected error in the polling loop."
  5000)

(defn- start-polling!
  "Starts the background polling process if not already running.
  Uses compare-and-set! to prevent race conditions when multiple threads call this concurrently."
  []
  (when (compare-and-set! background-process nil ::starting)
    (try
      (log/info "Starting background process for appdb queue")
      (reset! background-process
              (future
                (try
                  (loop []
                    (when (seq @listening-queues)
                      (try
                        (if-let [result (fetch!)]
                          (do
                            (log/info "Processing messages" {:queue (:queue result) :count (count (:messages result))})
                            (try
                              (doseq [payload (:messages result)]
                                (q.listener/call-handler! {:id (:id result) :queue (:queue result) :payload payload}))
                              (q.backend/message-successful! q.backend/*backend* (:queue result) (:id result))
                              (catch Exception e
                                (log/error e "Error handling queue message batch" {:queue (:queue result) :message-id (:id result)})
                                (q.backend/message-failed! q.backend/*backend* (:queue result) (:id result)))))
                          (Thread/sleep 2000))
                        (catch InterruptedException e (throw e))
                        (catch Exception e
                          (log/error e "Unexpected error in queue polling loop, backing off")
                          (Thread/sleep (long error-backoff-ms))))
                      (recur)))
                  (catch InterruptedException _
                    (log/info "Background process interrupted")))
                (log/info "Stopping background process for appdb queue")
                (reset! background-process nil)))
      (catch Exception e
        (reset! background-process nil)
        (throw e)))))

(defmethod q.backend/listen! :mq.queue.backend/appdb [_ queue-name]
  (when-not (contains? @listening-queues queue-name)
    (swap! listening-queues conj queue-name)
    (log/infof "Registered listener for queue %s" (name queue-name))
    (start-polling!)))

(defmethod q.backend/clear-queue! :mq.queue.backend/appdb
  [_ queue-name]
  (t2/delete! :queue_message :queue_name (name queue-name)))

(defmethod q.backend/close-queue! :mq.queue.backend/appdb [_ queue-name]
  (swap! listening-queues disj queue-name)
  (log/infof "Unregistered handler for queue %s" (name queue-name)))

(defmethod q.backend/queue-length :mq.queue.backend/appdb
  [_ queue]
  (or
   (t2/select-one-fn :num [:queue_message [[:count :*] :num]] :queue_name (name queue))
   0))

(defmethod q.backend/publish! :mq.queue.backend/appdb
  [_ queue messages]
  (t2/with-transaction [_conn]
    (t2/insert! :queue_message
                {:queue_name (name queue)
                 :messages   (json/encode messages)})))

(defmethod q.backend/message-successful! :mq.queue.backend/appdb
  [_ _queue-name message-id]
  (let [deleted (t2/delete! :queue_message message-id)]
    (when (= 0 deleted)
      (log/warnf "Message %d was already deleted from the queue. Likely error in concurrency handling" message-id))))

(def ^:private max-failures
  "Maximum number of failures before a message is moved to 'failed' terminal status."
  5)

(defmethod q.backend/message-failed! :mq.queue.backend/appdb
  [_ _queue-name message-id]
  (let [row     (t2/select-one :queue_message :id message-id :owner owner-id)
        updated (when row
                  (if (>= (inc (:failures row)) max-failures)
                    (do
                      (log/warnf "Message %d has reached max failures (%d), marking as failed" message-id max-failures)
                      (t2/update! :queue_message
                                  {:id    message-id
                                   :owner owner-id}
                                  {:status           "failed"
                                   :failures         [:+ :failures 1]
                                   :status_heartbeat (mi/now)
                                   :owner            nil}))
                    (t2/update! :queue_message
                                {:id    message-id
                                 :owner owner-id}
                                {:status           "pending"
                                 :failures         [:+ :failures 1]
                                 :status_heartbeat (mi/now)
                                 :owner            nil})))]
    (when (and row (= 0 updated))
      (log/warnf "Message %d was not found in the queue. Likely error in concurrency handling" message-id))))
