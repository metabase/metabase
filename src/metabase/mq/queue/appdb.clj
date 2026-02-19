(ns metabase.mq.queue.appdb
  "Database-backed implementation of the message queue using the application database."
  (:require
   [metabase.analytics.prometheus :as analytics]
   [metabase.models.interface :as mi]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.settings :as mq.settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private owner-id (str (random-uuid)))
(def ^:private background-process (atom nil))
(def ^:private listening-queues (atom #{}))

(defn- fetch!
  "Fetches the next pending message from any of the listening queues.
  Returns a map with :batch-id, :queue, and :messages keys, or nil if no messages are available.
  Marks the fetched message as 'processing' within the same transaction."
  []
  (when (seq @listening-queues)
    (t2/with-transaction [conn]
      (when-let [row (t2/query-one
                      conn
                      {:select   [:*]
                       :from     [:queue_message_batch]
                       :where    [:and
                                  [:in :queue_name (map name @listening-queues)]
                                  [:= :status "pending"]]
                       :order-by [[:id :asc]]
                       :limit    1
                       :for      [:update :skip-locked]})]
        (t2/update! :queue_message_batch
                    (:id row)
                    {:status_heartbeat (mi/now)
                     :status           "processing"
                     :owner            owner-id})
        {:batch-id (:id row)
         :queue    (keyword "queue" (:queue_name row))
         :messages (json/decode (:messages row))}))))

(def ^:private error-backoff-ms
  "Backoff time after an unexpected error in the polling loop."
  5000)

(defn- start-polling!
  "Starts the background polling process if not already running."
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
                            (q.backend/handle! :queue.backend/appdb (:queue result) (:batch-id result) (:messages result)))
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

(defmethod q.backend/shutdown! :queue.backend/appdb [_]
  (when-let [^java.util.concurrent.Future f @background-process]
    (.cancel f true)
    (reset! background-process nil))
  (log/info "Shut down appdb queue backend"))

(defmethod q.backend/listen! :queue.backend/appdb [_ queue-name]
  (when-not (contains? @listening-queues queue-name)
    (swap! listening-queues conj queue-name)
    (log/infof "Registered listener for queue %s" (name queue-name))
    (start-polling!)))

(defmethod q.backend/stop-listening! :queue.backend/appdb [_ queue-name]
  (swap! listening-queues disj queue-name)
  (log/infof "Unregistered handler for queue %s" (name queue-name)))

(defmethod q.backend/queue-length :queue.backend/appdb
  [_ queue]
  (or
   (t2/select-one-fn :num [:queue_message_batch [[:count :*] :num]] :queue_name (name queue))
   0))

(defmethod q.backend/publish! :queue.backend/appdb
  [_ queue messages]
  (t2/with-transaction [_conn]
    (t2/insert! :queue_message_batch
                {:queue_name (name queue)
                 :messages   (json/encode messages)})))

(defmethod q.backend/batch-successful! :queue.backend/appdb
  [_ _queue-name batch-id]
  (let [deleted (t2/delete! :queue_message_batch batch-id)]
    (when (= 0 deleted)
      (log/warnf "Message %d was already deleted from the queue. Likely error in concurrency handling" batch-id))))

(defmethod q.backend/batch-failed! :queue.backend/appdb
  [_ queue-name batch-id]
  (let [row     (t2/select-one :queue_message_batch :id batch-id :owner owner-id)
        updated (when row
                  (if (>= (inc (:failures row)) (mq.settings/queue-max-retries))
                    (do
                      (log/warnf "Message %d has reached max failures (%d), marking as failed" batch-id (mq.settings/queue-max-retries))
                      (analytics/inc! :metabase-mq/queue-batch-permanent-failures {:queue (name queue-name)})
                      (t2/update! :queue_message_batch
                                  {:id    batch-id
                                   :owner owner-id}
                                  {:status           "failed"
                                   :failures         [:+ :failures 1]
                                   :status_heartbeat (mi/now)
                                   :owner            nil}))
                    (do
                      (analytics/inc! :metabase-mq/queue-batch-retries {:queue (name queue-name)})
                      (t2/update! :queue_message_batch
                                  {:id    batch-id
                                   :owner owner-id}
                                  {:status           "pending"
                                   :failures         [:+ :failures 1]
                                   :status_heartbeat (mi/now)
                                   :owner            nil}))))]
    (when (and row (= 0 updated))
      (log/warnf "Message %d was not found in the queue. Likely error in concurrency handling" batch-id))))
