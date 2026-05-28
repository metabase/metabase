(ns metabase-enterprise.mq.queue.redis
  "Redis-backed queue. Optional — only loaded when the `queue-backend` setting is `redis`.

  Each `:queue/foo` channel maps to a Redis Stream `metabase:queue:foo` consumed by a single
  consumer group `metabase`. A batch published via `publish!` becomes one stream entry whose
  `payload` field is the opaque, already-encoded JSON string and whose `retries` field tracks
  the failure count. Delivery is at-least-once: an entry sits in the group's Pending Entries
  List (PEL) until acked. On success we `XACK`+`XDEL`; on failure we re-add with an incremented
  retry count (up to `queue-max-retries`) then ack the original; entries left pending by a
  crashed consumer are reclaimed via `XAUTOCLAIM`.

  Exclusive queues (at most one batch in-flight cluster-wide) are enforced with
  an atomic Lua script that checks the PEL is empty before reading — a plain check-then-read
  would race across nodes."
  (:require
   [clojure.string :as str]
   [metabase-enterprise.mq.settings :as ee.mq.settings]
   [metabase.mq.core-backend :as mq.backend]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.util.log :as log]
   [taoensso.carmine :as car :refer [wcar]])
  (:import
   (java.net InetSocketAddress Socket URI)))

(set! *warn-on-reflection* true)

(def backend-id
  "This backend's identifier"
  :queue.backend/redis)

(def ^:private group-name "metabase")
(def ^:private stream-prefix "metabase:queue:")

;; Atomically read the next entry for an exclusive queue only if the group's PEL is empty.
;; Redis runs scripts single-threaded, so the PEL check and the read that moves the entry into
;; the PEL happen as one indivisible operation — no cross-node check-then-read race.
(def ^:private exclusive-read-script
  "local p = redis.call('XPENDING', KEYS[1], ARGV[1])
   if p[1] == 0 then
     return redis.call('XREADGROUP','GROUP',ARGV[1],ARGV[2],'COUNT',1,'STREAMS',KEYS[1],'>')
   else
     return false
   end")

(defn- stream-name ^String [queue]
  (str stream-prefix (name queue)))

(defn- conn-opts [uri username password]
  {:pool {}
   :spec (cond-> {:uri uri}
           (not (str/blank? username)) (assoc :username username)
           (not (str/blank? password)) (assoc :password password))})

(defn- ensure-group!
  "Create the consumer group for `stream` (at id 0, creating the stream if needed) so a consumer
  can XREADGROUP. Idempotent on the broker — an already-existing group comes back as a BUSYGROUP
  error, which we ignore. Called when a queue starts being listened to, never on the read path."
  [conn ^String stream]
  (try
    (wcar conn (car/xgroup-create stream group-name "0" "MKSTREAM"))
    (catch Exception e
      (when-not (str/includes? (str (.getMessage e)) "BUSYGROUP")
        (throw e)))))

(defn- parse-entry
  "Turns a stream entry `[id [field val field val ...]]` into a map with :entry-id, :payload,
  and :retries."
  [[entry-id fields]]
  (let [m (apply hash-map fields)]
    {:entry-id entry-id
     :payload  (get m "payload")
     :retries  (parse-long (or (get m "retries") "0"))}))

(defn- first-entry
  "Extracts the first `[id fields]` entry from an XREADGROUP/EVAL reply
  `[[stream [[id fields] ...]]]`, or nil."
  [reply]
  (some-> reply first second first))

(defn- read-one!
  "Reads (and moves into the PEL) one entry for `queue`, or returns nil. Exclusive queues use
  the atomic Lua script; others read directly. Returns `{:entry-id :payload :retries}` — the
  stream entry id doubles as the batch-id. The group is created when the queue starts being
  listened to, so it always exists here."
  [conn consumer queue]
  (let [stream (stream-name queue)
        reply  (if (mq.backend/exclusive? queue)
                 (wcar conn (car/eval exclusive-read-script 1 stream group-name consumer))
                 (wcar conn (car/xreadgroup "GROUP" group-name consumer "COUNT" 1 "STREAMS" stream ">")))]
    (some-> (first-entry reply) parse-entry)))

(defn- entry-fields
  "Reads `{:entry-id :payload :retries}` for a single stream entry by id, or nil if it's gone.
  Redis is the source of truth — we look the entry up rather than tracking it in memory."
  [conn stream entry-id]
  (some-> (first (wcar conn (car/xrange stream entry-id entry-id))) parse-entry))

(defn- requeue-or-drop!
  "Storage for a reclaimed stale entry (which works directly on the stream entry, not the
  batch-registry): re-add with an incremented retry count for another attempt — returning
  `:recovered` — or drop it once retries are exhausted — returning `:failed`. Always acks and
  deletes the original entry so it leaves the PEL. Metrics/logs are emitted by the shared driver.
  The live-failure path goes through `failure-count`/`retry-batch!`/`fail-batch!` instead."
  [conn stream entry-id payload retries max-retries]
  (let [next-retries (inc (long retries))]
    (if (>= next-retries max-retries)
      (do
        (wcar conn (car/xack stream group-name entry-id) (car/xdel stream entry-id))
        :failed)
      (do
        (wcar conn
              (car/xadd stream "*" "payload" payload "retries" (str next-retries))
              (car/xack stream group-name entry-id)
              (car/xdel stream entry-id))
        :recovered))))

(defn- reclaim-queue!
  "XAUTOCLAIMs every entry on `queue` idle past `stale-timeout-ms` (from a crashed consumer),
  re-queuing or dropping each. Returns a seq of `:recovered`/`:failed` outcomes."
  [conn consumer queue stale-timeout-ms max-retries]
  (let [stream (stream-name queue)]
    (loop [cursor "0" acc []]
      (let [[next-cursor entries] (wcar conn (car/xautoclaim stream group-name consumer
                                                             stale-timeout-ms cursor "COUNT" 100))
            acc                   (reduce (fn [acc entry]
                                            (let [{:keys [entry-id payload retries]} (parse-entry entry)]
                                              (conj acc (requeue-or-drop! conn stream entry-id payload retries
                                                                          max-retries))))
                                          acc entries)]
        (if (and (seq entries) next-cursor (not= next-cursor "0"))
          (recur next-cursor acc)
          acc)))))

(defn- watch-key [consumer]
  [::ensure-group consumer])

(defrecord RedisQueueBackend [conn poll-context]
  mq.backend/QueueBackend

  (backend-id [_this] backend-id)

  (publish! [_this queue payload]
    ;; Publishers don't need the consumer group — XADD creates the stream, and consumers create
    ;; the group at id 0 so it still picks up anything published before the group existed.
    (wcar conn (car/xadd (stream-name queue) "*" "payload" payload "retries" "0")))

  ;; Reads one entry per available queue; the stream entry id doubles as the batch-id, so the
  ;; ack/fail path resolves everything from the server (queue → stream, batch-id → entry).
  (fetch! [_this available-queues]
    (into []
          (keep (fn [queue]
                  (when-let [{:keys [entry-id payload]} (read-one! conn (:id poll-context) queue)]
                    {:queue queue :payload payload :batch-id entry-id})))
          available-queues))

  ;; Stream length (`total`) and pending (in-flight) counts per listened queue.
  (queue-depths [_this]
    (into []
          (mapcat (fn [queue]
                    (let [stream  (stream-name queue)
                          channel (name queue)
                          len     (wcar conn (car/xlen stream))
                          pending (first (wcar conn (car/xpending stream group-name)))]
                      [{:channel channel :status "total" :count len}
                       {:channel channel :status "pending" :count pending}])))
          (mq.backend/queue-names)))

  ;; The batch-id is the stream entry id; the queue gives the stream — so ack+delete directly.
  (batch-successful! [_this queue batch-id]
    (let [stream (stream-name queue)]
      (wcar conn (car/xack stream group-name batch-id) (car/xdel stream batch-id))))

  (failure-count [_this queue batch-id]
    (:retries (entry-fields conn (stream-name queue) batch-id)))

  (retry-batch! [_this queue batch-id]
    (let [stream (stream-name queue)]
      (when-let [{:keys [payload retries]} (entry-fields conn stream batch-id)]
        (wcar conn
              (car/xadd stream "*" "payload" payload "retries" (str (inc (long retries))))
              (car/xack stream group-name batch-id)
              (car/xdel stream batch-id)))))

  (fail-batch! [_this queue batch-id]
    (let [stream (stream-name queue)]
      (wcar conn (car/xack stream group-name batch-id) (car/xdel stream batch-id))))

  ;; Reclaims entries pending longer than the stale timeout (from a crashed consumer), re-queuing
  ;; or dropping each, and returns per-channel {:channel :recovered :failed} for the shared driver.
  (recover-stale! [_this stale-timeout-ms max-retries]
    (into []
          (keep (fn [queue]
                  (let [outcomes (reclaim-queue! conn (:id poll-context) queue stale-timeout-ms max-retries)]
                    (when (seq outcomes)
                      {:channel   (name queue)
                       :recovered (count (filter #{:recovered} outcomes))
                       :failed    (count (filter #{:failed} outcomes))}))))
          (mq.backend/queue-names)))

  ;; Refreshes the idle time of our in-flight entries (read from the group's pending list) so
  ;; reclaim doesn't steal a slow-but-alive batch.
  (run-heartbeats! [_this]
    (let [consumer (:id poll-context)]
      (doseq [queue (mq.backend/queue-names)]
        (let [stream (stream-name queue)]
          (doseq [[entry-id] (wcar conn (car/xpending stream group-name "-" "+" 1000 consumer))]
            (try
              (wcar conn (car/xclaim stream group-name consumer 0 entry-id "JUSTID"))
              (catch Exception e
                (log/warnf e "Failed to heartbeat Redis entry %s" entry-id))))))))

  (start! [this]
    ;; A consumer must have the group before it can XREADGROUP. Create one for every queue we
    ;; already listen to, then watch for queues whose listeners register later (test fixtures,
    ;; plugins) so they get their group the moment the listener appears.
    (doseq [queue (mq.backend/queue-names)]
      (ensure-group! conn (stream-name queue)))
    (mq.backend/watch-new-queues! (watch-key (:id poll-context))
                                  (fn [queue] (ensure-group! conn (stream-name queue))))
    (mq.backend/start-poll-loop! this poll-context "Redis Queue" 5000))

  (shutdown! [_this]
    (mq.backend/unwatch-new-queues! (watch-key (:id poll-context)))
    (mq.backend/stop-poll-loop! poll-context "Redis Queue")))

(defn make-backend
  "Constructs a `RedisQueueBackend`. With no args, reads connection details from the `mq-redis-*`
  settings. The 1-arg form takes an explicit URI (still honoring the username/password settings
  via the 3-arg form's caller); the 3-arg form is fully explicit and bypasses settings (tests)."
  ([] (make-backend (ee.mq.settings/mq-redis-uri)
                    (ee.mq.settings/mq-redis-username)
                    (ee.mq.settings/mq-redis-password)))
  ([uri] (make-backend uri nil nil))
  ([uri username password]
   (->RedisQueueBackend (conn-opts uri username password)
                        (mq.backend/make-poll-context))))

(defenterprise make-redis-backend
  "Enterprise implementation of the boundary fn declared in [[metabase.mq.init]]. Constructs the
  Redis queue backend from the `mq-redis-*` settings; used when `queue-backend=redis`."
  :feature :none
  []
  (make-backend))

;;; ------------------------------------------- Test helpers -------------------------------------------

(defn delete-stream!
  "Deletes the Redis Stream backing `queue` (and its consumer group). Intended for test cleanup
  so streams don't accumulate between runs."
  ([queue] (delete-stream! (ee.mq.settings/mq-redis-uri)
                           (ee.mq.settings/mq-redis-username)
                           (ee.mq.settings/mq-redis-password)
                           queue))
  ([uri username password queue]
   (wcar (conn-opts uri username password) (car/del (stream-name queue)))))

(defn broker-available?
  "Quick TCP probe of the configured Redis URI. Returns true if the server accepts a socket
  connection within `timeout-ms` (default 500). Use to skip redis tests when none is running."
  ([] (broker-available? (ee.mq.settings/mq-redis-uri) 500))
  ([^String uri timeout-ms]
   (try
     (let [u             (URI. uri)
           ^String host  (or (.getHost u) "localhost")
           port          (let [p (.getPort u)] (if (neg? p) 6379 p))]
       (with-open [s (Socket.)]
         (.connect s (InetSocketAddress. host (int port)) (int timeout-ms))
         true))
     (catch Throwable _ false))))
