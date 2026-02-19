(ns metabase.mq.topic.postgres
  "PostgreSQL LISTEN/NOTIFY backend for the pub/sub system.
  Uses native LISTEN/NOTIFY for near-instant message delivery with zero storage overhead.
  Falls back to the `topic_message` table for payloads exceeding PostgreSQL's 8000-byte limit."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.mq.topic.backend :as topic.backend]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.security MessageDigest)
   (java.sql Connection)
   (org.postgresql PGConnection PGNotification)))

(set! *warn-on-reflection* true)

(def keep-me
  "Referenced from [[metabase.mq.core]] to ensure this namespace is loaded."
  true)

;;; ------------------------------------------------ Channel Naming ------------------------------------------------

(def ^:private channel-prefix "mb_topic_")

(def ^:private max-channel-bytes
  "PostgreSQL channel names are limited to 63 bytes."
  63)

(defn- sha256-hex
  "Returns the hex-encoded SHA-256 hash of `s`."
  ^String [^String s]
  (let [digest (MessageDigest/getInstance "SHA-256")
        hash-bytes (.digest digest (.getBytes s "UTF-8"))]
    (apply str (map #(format "%02x" %) hash-bytes))))

(defn topic->channel-name
  "Converts a topic keyword to a valid PostgreSQL channel name.
  The channel name is lowercased, with `/` replaced by `__`, and prefixed with `mb_ps_`.
  If the result exceeds 63 bytes, a SHA-256 hash is used instead."
  [topic-kw]
  (let [raw   (-> (str (namespace topic-kw) "/" (name topic-kw))
                  (.replace "/" "__")
                  .toLowerCase)
        named (str channel-prefix raw)]
    (if (<= (count (.getBytes named "UTF-8")) max-channel-bytes)
      named
      (let [hash (sha256-hex raw)
            ;; Truncate hash to fit within limit after prefix
            max-hash-len (- max-channel-bytes (count (.getBytes ^String channel-prefix "UTF-8")))]
        (str channel-prefix (subs hash 0 max-hash-len))))))

;;; ------------------------------------------------ Listener State ------------------------------------------------

(def ^:private listener-state
  "Holds `{:connection, :thread, :running?, :channels, :channel->topic}` for the dedicated LISTEN connection."
  (atom nil))

;;; -------------------------------------------- Raw Connection Helpers --------------------------------------------

(defn- open-connection
  "Borrows a connection from the pooled DataSource and holds it indefinitely.
  Because this connection is never returned to the pool, c3p0's `DISCARD ALL`
  on check-in never fires, so LISTEN registrations are preserved."
  ^Connection []
  (let [conn (.getConnection (mdb/data-source))]
    (.setAutoCommit conn true)
    conn))

(defn- execute-sql!
  "Execute a SQL statement on the given connection."
  [^Connection conn ^String sql]
  (with-open [stmt (.createStatement conn)]
    (.execute stmt sql)))

(defn- quote-identifier
  "Double-quotes a PostgreSQL identifier to allow special characters like hyphens."
  ^String [^String s]
  (str "\"" (.replace s "\"" "\"\"") "\""))

(defn- listen-on-channel!
  "Issues LISTEN on the dedicated connection for the given channel."
  [^Connection conn ^String channel-name]
  (execute-sql! conn (str "LISTEN " (quote-identifier channel-name))))

(defn- unlisten-channel!
  "Issues UNLISTEN on the dedicated connection for the given channel."
  [^Connection conn ^String channel-name]
  (execute-sql! conn (str "UNLISTEN " (quote-identifier channel-name))))

;;; ------------------------------------------- Notification Dispatch -------------------------------------------

(defn- dispatch-notification!
  "Parses a PG notification payload and dispatches to all registered handlers for the topic."
  [^PGNotification notification channel->topic]
  (let [channel-name (.getName notification)
        payload-str  (.getParameter notification)
        topic        (get channel->topic channel-name)]
    (when topic
      (try
        (let [payload (json/decode payload-str)
              [batch-id messages] (if-let [ref-id (and (map? payload) (get payload "ref"))]
                                    ;; Large message fallback: fetch from topic_message table
                                    (when-let [row (t2/select-one :topic_message_batch :id ref-id)]
                                      [(:id row) (json/decode (:messages row))])
                                    ;; Normal inline payload
                                    [0 payload])]
          (when messages
            (topic.backend/handle! topic.backend/*backend* topic batch-id messages)))
        (catch Exception e
          (log/errorf e "Error parsing postgres payload for channel %s" channel-name))))))

;;; ------------------------------------------- Listener Thread -------------------------------------------

(defn- get-notifications
  "Fetches pending notifications from the PG connection with a blocking timeout."
  [^Connection conn timeout-ms]
  (let [^PGConnection pg-conn (.unwrap conn PGConnection)]
    (.getNotifications pg-conn (int timeout-ms))))

(defn- reconnect!
  "Attempts to reconnect the listener, with exponential backoff."
  [state]
  (loop [delay-ms 1000]
    (when (:running? @state)
      (log/infof "postgres listener reconnecting in %dms..." delay-ms)
      (Thread/sleep (long delay-ms))
      (if-let [new-conn (try
                          (let [conn (open-connection)]
                            ;; Re-issue LISTEN for all tracked channels
                            (doseq [ch (:channels @state)]
                              (listen-on-channel! conn ch))
                            conn)
                          (catch Exception e
                            (log/error e "postgres reconnection failed")
                            nil))]
        (do
          (swap! state assoc :connection new-conn)
          new-conn)
        (recur (min (* delay-ms 2) 30000))))))

(defn- start-listener-thread!
  "Starts a daemon thread that polls for PG notifications and dispatches them.
  Uses `bound-fn*` to convey dynamic bindings (e.g. `*handlers*`) to the new thread."
  [state]
  (let [thread (Thread.
                ^Runnable
                (bound-fn* (fn []
                             (log/info "postgres listener thread started")
                             (loop []
                               (when (:running? @state)
                                 (let [conn (:connection @state)]
                                   (try
                                     (when-let [notifications (get-notifications conn 500)]
                                       (let [channel->topic (:channel->topic @state)]
                                         (doseq [n notifications]
                                           (dispatch-notification! n channel->topic))))
                                     (catch Exception e
                                       (when (:running? @state)
                                         (log/error e "postgres listener error, reconnecting...")
                                         (try
                                           (.close ^Connection conn)
                                           (catch Exception _))
                                         (reconnect! state)))))
                                 (recur)))
                             (log/info "postgres listener thread stopped")))
                "postgres-topic-listener")]
    (.setDaemon thread true)
    (.start thread)
    thread))

(defn- ensure-listener!
  "Idempotently initializes the dedicated LISTEN connection and polling thread."
  []
  (when-not (:running? @listener-state)
    (locking listener-state
      (when-not (:running? @listener-state)
        (let [conn (open-connection)]
          (reset! listener-state {:connection    conn
                                  :running?      true
                                  :channels      #{}
                                  :channel->topic {}})
          (let [thread (start-listener-thread! listener-state)]
            (swap! listener-state assoc :thread thread)))))))

;;; ------------------------------------------- Backend Multimethods -------------------------------------------

(def ^:private max-inline-payload-bytes
  "NOTIFY payload limit is 8000 bytes. We use 7500 to leave headroom."
  7500)

(defmethod topic.backend/publish! :topic.backend/postgres
  [_ topic-name messages]
  (let [payload-str (json/encode messages)
        payload-bytes (count (.getBytes ^String payload-str "UTF-8"))
        channel (topic->channel-name topic-name)]
    (if (<= payload-bytes max-inline-payload-bytes)
      ;; Small message: send inline via NOTIFY
      (t2/query {:select [[[:pg_notify channel payload-str]]]})
      ;; Large message: write to table, send ref
      (let [{:keys [id]} (first (t2/insert-returning-instances! :topic_message_batch
                                                                {:topic_name (name topic-name)
                                                                 :messages   payload-str}))
            ref-payload (json/encode {"ref" id})]
        (t2/query {:select [[[:pg_notify channel ref-payload]]]})))))

(defmethod topic.backend/subscribe! :topic.backend/postgres
  [_ topic-name]
  (ensure-listener!)
  (let [channel (topic->channel-name topic-name)]
    (locking listener-state
      (let [{:keys [connection channels]} @listener-state]
        (when-not (contains? channels channel)
          (listen-on-channel! connection channel)
          (swap! listener-state update :channels conj channel)
          (swap! listener-state assoc-in [:channel->topic channel] topic-name))))
    (log/infof "postgres subscribed to topic %s (channel %s)" (name topic-name) channel)))

(defmethod topic.backend/unsubscribe! :topic.backend/postgres
  [_ topic-name]
  (let [channel (topic->channel-name topic-name)]
    (locking listener-state
      (when-let [{:keys [connection]} @listener-state]
        (try
          (unlisten-channel! connection channel)
          (catch Exception e
            (log/warnf e "Error during UNLISTEN for channel %s" channel)))
        (swap! listener-state update :channels disj channel)
        (swap! listener-state update :channel->topic dissoc channel)))
    (log/infof "postgres unsubscribed from topic %s" (name topic-name))))

(defmethod topic.backend/shutdown! :topic.backend/postgres [_]
  (when-let [{:keys [^Connection connection ^Thread thread]} @listener-state]
    (swap! listener-state assoc :running? false)
    (try (.close connection) (catch Exception _))
    (when thread
      (.join thread 5000))
    (reset! listener-state nil)
    (log/info "postgres listener stopped")))
