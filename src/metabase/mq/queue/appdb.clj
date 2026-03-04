(ns metabase.mq.queue.appdb
  "Database-backed implementation of the message queue using the application database."
  (:require
   [metabase.models.interface :as mi]
   [metabase.mq.impl :as mq.impl]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.impl :as q.impl]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import (java.sql Timestamp)
           (java.time Instant)
           (java.util.concurrent Future)))

(set! *warn-on-reflection* true)

(defn- queue-max-retries []
  ((requiring-resolve 'metabase.mq.settings/queue-max-retries)))

(def ^:private owner-id (str (random-uuid)))
(def ^:private background-process (atom nil))

(defn- fetch!
  "Fetches the next pending message from any of the listening queues.
  Returns a map with :bundle-id, :queue, and :messages keys, or nil if no messages are available.
  Marks the fetched message as 'processing' within the same transaction."
  []
  (when-let [queue-names (seq (keys @q.impl/*listeners*))]
    (t2/with-transaction [conn]
      (when-let [row (t2/query-one
                      conn
                      {:select   [:*]
                       :from     [:queue_message_bundle]
                       :where    [:and
                                  [:in :queue_name (map name queue-names)]
                                  [:= :status "pending"]]
                       :order-by [[:id :asc]]
                       :limit    1
                       :for      [:update :skip-locked]})]
        (t2/update! :queue_message_bundle
                    (:id row)
                    {:status_heartbeat (mi/now)
                     :status           "processing"
                     :owner            owner-id})
        {:bundle-id (:id row)
         :queue     (keyword "queue" (:queue_name row))
         :messages  (json/decode (:messages row))}))))

;;; ------------------------------------------- Failed Bundle Cleanup -------------------------------------------

(def ^:private cleanup-max-age-ms
  "Failed bundles older than this are eligible for cleanup.
  Currently 1 week (604800000ms). Not yet configurable at runtime."
  (* 7 24 60 60 1000))

(def ^:private cleanup-interval-ms
  "How often the cleanup loop runs.
  Currently 1 day (86400000ms). Not yet configurable at runtime."
  (* 24 60 60 1000))

(def ^:private cleanup-future
  "Holds the background future running the cleanup loop, or nil if not started."
  (atom nil))

(defn- cleanup-failed-bundles!
  "Deletes all failed `queue_message_bundle` rows older than [[cleanup-max-age-ms]]."
  []
  (let [threshold (Timestamp/from (.minusMillis (Instant/now) cleanup-max-age-ms))
        deleted   (t2/delete! :queue_message_bundle :status "failed" :status_heartbeat [:< threshold])]
    (when (pos? deleted)
      (log/infof "Cleaned up %d failed queue bundles" deleted))
    deleted))

;;; ------------------------------------------- Polling -------------------------------------------

(def ^:private error-backoff-ms
  "Backoff time after an unexpected error in the polling loop."
  5000)

(defn- process-bundle!
  "Fetches a bundle and delivers it to the shared accumulation layer.
  Return true if there was a bundle available. False if not"
  []
  (when-let [{:keys [bundle-id queue messages]} (fetch!)]
    (q.impl/deliver-bundle! :queue.backend/appdb queue bundle-id messages)
    true))

(defn- start-polling!
  "Starts the background polling process if not already running."
  []
  (when (compare-and-set! background-process nil ::starting)
    (try
      (log/info "Starting background process for appdb queue")
      (mq.impl/start-cleanup-loop-once! cleanup-future cleanup-interval-ms cleanup-failed-bundles! "Queue")
      (reset! background-process
              (future
                (try
                  (loop []
                    (try
                      (if (seq @q.impl/*listeners*)
                        (if (process-bundle!)
                          nil ;; delivered a bundle, loop immediately to fetch more
                          (Thread/sleep 2000))
                        ;; No queues registered — sleep longer and re-check
                        (Thread/sleep 5000))
                      (catch InterruptedException e (throw e))
                      (catch Exception e
                        (log/error e "Unexpected error in queue polling loop, backing off")
                        (Thread/sleep (long error-backoff-ms))))
                    (recur))
                  (catch InterruptedException _
                    (log/info "Background process interrupted")))
                (log/info "Stopping background process for appdb queue")
                (reset! background-process nil)))
      (catch Exception e
        (reset! background-process nil)
        (throw e)))))

(defmethod q.backend/shutdown! :queue.backend/appdb [_]
  (mq.impl/stop-cleanup-loop! cleanup-future "Queue")
  (when-let [f @background-process]
    (when (instance? Future f)
      (.cancel ^Future f true))
    (reset! background-process nil))
  (log/info "Shut down appdb queue backend"))

(defmethod q.backend/start! :queue.backend/appdb [_]
  (start-polling!))

(defmethod q.backend/queue-length :queue.backend/appdb
  [_ queue]
  (or
   (t2/select-one-fn :num [:queue_message_bundle [[:count :*] :num]] :queue_name (name queue))
   0))

(defmethod q.backend/publish! :queue.backend/appdb
  [_ queue messages]
  (t2/insert! :queue_message_bundle
              {:queue_name (name queue)
               :messages   (json/encode messages)}))

(defmethod q.backend/bundle-successful! :queue.backend/appdb
  [_ _queue-name bundle-id]
  (let [deleted (t2/delete! :queue_message_bundle :id bundle-id :owner owner-id)]
    (when (= 0 deleted)
      (log/warnf "Message %d was already deleted from the queue. Likely error in concurrency handling" bundle-id))))

(defmethod q.backend/bundle-failed! :queue.backend/appdb
  [_ queue-name bundle-id]
  (let [row     (t2/select-one :queue_message_bundle :id bundle-id :owner owner-id)
        updated (when row
                  (if (>= (inc (:failures row)) (queue-max-retries))
                    (do
                      (log/warnf "Message %d has reached max failures (%d), marking as failed" bundle-id (queue-max-retries))
                      (mq.impl/analytics-inc! :metabase-mq/queue-bundle-permanent-failures {:queue (name queue-name)})
                      (t2/update! :queue_message_bundle
                                  {:id    bundle-id
                                   :owner owner-id}
                                  {:status           "failed"
                                   :failures         [:+ :failures 1]
                                   :status_heartbeat (mi/now)
                                   :owner            nil}))
                    (do
                      (mq.impl/analytics-inc! :metabase-mq/queue-bundle-retries {:queue (name queue-name)})
                      (t2/update! :queue_message_bundle
                                  {:id    bundle-id
                                   :owner owner-id}
                                  {:status           "pending"
                                   :failures         [:+ :failures 1]
                                   :status_heartbeat (mi/now)
                                   :owner            nil}))))]
    (when (and row (= 0 updated))
      (log/warnf "Message %d was not found in the queue. Likely error in concurrency handling" bundle-id))))
