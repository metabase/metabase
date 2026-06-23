(ns metabase.mq.queue.outbox
  "Transactional outbox for queue publishes.

  When a queue declared `:transactional :require`/`:try` is published to inside a DB transaction,
  the messages are not handed straight to the backend (which would be lost if the node crashed
  after the business transaction committed but before the publish). Instead:

    1. before-commit — the accumulated messages are dedup'd, chunked by the queue's
       `:max-batch-messages`, encoded, and inserted into the `queue_message_outbox` table *inside
       the business transaction*. They commit atomically with the business writes.
    2. after-commit — each inserted row is published to the backend and then deleted from the
       outbox. No waiting/buffering — straight through.
    3. recovery — a periodic sweep ([[recover-outbox!]]) republishes any rows a crash left behind
       (rows older than [[recovery-age-ms]]), covering the window between commit and the
       after-commit publish.

  This makes a message published iff the business transaction that produced it commits, regardless
  of which backend the queue ultimately uses — the outbox table always lives in the app DB."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.mq.payload :as payload]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.transport :as transport]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql Timestamp)
   (java.time Instant)))

(set! *warn-on-reflection* true)

(def ^:private recovery-age-ms
  "Outbox rows older than this are assumed orphaned by a crash and republished by [[recover-outbox!]].
  The normal after-commit path publishes and deletes its rows immediately, well within this window,
  so the sweep only ever picks up rows a crash left behind."
  (* 60 1000))

(def ^:private recovery-batch-size
  "How many outbox rows [[recover-outbox!]] claims per transaction."
  100)

(defn- for-update-clause
  "FOR UPDATE clause for the recovery sweep: SKIP LOCKED on Postgres/MySQL so concurrent sweeps on
  different nodes claim disjoint rows; plain FOR UPDATE on H2."
  []
  (if (#{:postgres :mysql} (mdb/db-type))
    [:update :skip-locked]
    [:update]))

(defn insert-outbox-rows!
  "before-commit callback: for every channel buffered in `*transaction-state*`, apply the queue's
  dedup-fn, chunk by `:max-batch-messages`, encode, and insert one `queue_message_outbox` row per
  chunk — inside the still-open business transaction. Records the inserted rows back into the
  transaction state under `::rows` so the after-commit callback can publish and delete them."
  []
  (when-let [state (mdb/transaction-state)]
    (let [by-channel (::messages @state)
          rows (vec
                (for [[channel msgs] by-channel
                      :let  [dedup    (q.registry/dedup-fn channel)
                             deduped  (if dedup (dedup msgs) msgs)]
                      :when (seq deduped)
                      chunk (partition-all (q.registry/max-batch-messages channel) deduped)
                      :let  [payload (payload/encode (vec chunk))
                             id      (t2/insert-returning-pk! :queue_message_outbox
                                                              {:queue_name (name channel)
                                                               :payload    payload})]]
                  {:id id :channel channel :payload payload}))]
      (swap! state assoc ::rows rows))))

(defn publish-outbox-rows!
  "after-commit callback: publish each row inserted by [[insert-outbox-rows!]] to the backend and
  delete it from the outbox. Per-row try/catch — on failure the row is left for [[recover-outbox!]]
  to republish (at-least-once)."
  []
  (when-let [state (mdb/transaction-state)]
    (doseq [{:keys [id channel payload]} (::rows @state)]
      (try
        (transport/publish-encoded! channel payload)
        (t2/delete! :queue_message_outbox :id id)
        (catch Exception e
          (log/error e "Error publishing outbox row; recovery sweep will retry"
                     {:channel channel :outbox-id id}))))))

(defn defer-transactional!
  "Routes `msgs` for `channel` through the transactional outbox. Accumulates them per channel in
  `*transaction-state*` and, once per transaction, registers [[insert-outbox-rows!]] as a
  before-commit callback and [[publish-outbox-rows!]] as an after-commit callback. Must be called
  inside a transaction."
  [channel msgs]
  (let [state (mdb/transaction-state)
        old   (first (swap-vals! state
                                 (fn [s]
                                   (-> s
                                       (update-in [::messages channel] (fnil into []) msgs)
                                       (assoc ::registered? true)))))]
    (when-not (::registered? old)
      (mdb/before-commit! insert-outbox-rows!)
      (mdb/after-commit! publish-outbox-rows!))))

(defn recover-outbox!
  "Republishes outbox rows a crash left behind — rows older than [[recovery-age-ms]] (the normal
  after-commit path deletes its rows immediately). Claims rows with FOR UPDATE SKIP LOCKED, publishes
  each to the backend, and deletes it, all on the transaction's connection so for the appdb backend
  the publish-insert and the delete commit together (atomic move); other backends get an
  at-least-once relay. Loops until a claim returns fewer than [[recovery-batch-size]] rows. Returns
  the number of rows republished."
  []
  (loop [total 0]
    ;; `with-transaction` binds the current connectable, so the bare t2 calls below — and the
    ;; backend's insert inside `publish-encoded!` for the appdb backend — all run on this
    ;; transaction's connection.
    (let [n (long (t2/with-transaction [_conn]
                    (let [threshold (Timestamp/from (.minusMillis (Instant/now) recovery-age-ms))
                          rows      (t2/query {:select   [:id :queue_name :payload]
                                               :from     [:queue_message_outbox]
                                               :where    [:< :created_at threshold]
                                               :order-by [[:id :asc]]
                                               :limit    recovery-batch-size
                                               :for      (for-update-clause)})]
                      (doseq [{:keys [id queue_name payload]} rows]
                        (transport/publish-encoded! (keyword "queue" queue_name) payload)
                        (t2/delete! :queue_message_outbox :id id))
                      (count rows))))]
      (if (>= n recovery-batch-size)
        (recur (+ total n))
        (+ total n)))))
