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
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.mq.payload :as payload]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.mq.transaction :as mq.tx]
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

(def ^:private recovery-page-size
  "How many outbox rows [[recover-outbox!]] claims per transaction (one keyset-paginated page)."
  50)

(def ^:private recovery-retry-base-ms
  "Base delay before the recovery sweep retries a row after its first failed publish. Each further
  consecutive failure doubles the delay ([[retry-delay-ms]]), capped at [[recovery-retry-max-ms]]."
  (* 60 1000))

(def ^:private recovery-retry-max-ms
  "Cap on the exponential backoff between failed recovery publishes, so a row that keeps failing is
  still retried at least this often. Rows are never dropped — a committed message is retried until
  it publishes — so this bounds how long a transient backend outage delays delivery."
  (* 10 60 1000))

(defn retry-delay-ms
  "Backoff (ms) before the recovery sweep retries a row on its 1-based `attempts`-th consecutive
  failed publish: 1m, 2m, 4m, 8m … doubling, capped at [[recovery-retry-max-ms]]. Public for testing."
  [attempts]
  (long (min recovery-retry-max-ms
             (* recovery-retry-base-ms (Math/pow 2 (dec attempts))))))

(defn- for-update-clause
  "FOR UPDATE clause for the recovery sweep: SKIP LOCKED on Postgres/MySQL so concurrent sweeps on
  different nodes claim disjoint rows; plain FOR UPDATE on H2."
  []
  (if (#{:postgres :mysql} (mdb/db-type))
    [:update :skip-locked]
    [:update]))

(defn insert-batch!
  "Insert one already-encoded batch `payload` for `channel` as a `queue_message_outbox` row and return
  its primary key."
  [channel payload]
  (t2/insert-returning-pk! :queue_message_outbox
                           {:queue_name (name channel)
                            :payload    payload}))

(defn insert-outbox-rows!
  "before-commit callback: for every channel buffered in `*transaction-state*`, apply the queue's
  dedup-fn, chunk by `:max-batch-messages`, encode, and insert one `queue_message_outbox` row per
  chunk — inside the still-open business transaction. Records the inserted rows
  back into the transaction state under `::rows` so the after-commit callback can publish and delete them."
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
                             id      (insert-batch! channel payload)]]
                  {:id id :channel channel :payload payload}))]
      (swap! state assoc ::rows rows))))

(defn publish-outbox-rows!
  "after-commit callback: publish each row inserted by [[insert-outbox-rows!]] to the backend, then
  delete the successfully-published rows in a single batched DELETE. Per-row try/catch — on failure
  the row is left for [[recover-outbox!]] to republish (at-least-once). Takes the transaction's `state`
  atom explicitly (captured when the callback was registered) because after-commit callbacks run after
  the transaction bindings unwind, when the dynamic [[mdb/transaction-state]] is no longer bound."
  [state]
  (let [published-ids (reduce
                       (fn [ids {:keys [id channel payload]}]
                         (try
                           (transport/publish-encoded! channel payload)
                           (conj ids id)
                           (catch Exception e
                             (log/error e "Error publishing outbox row; recovery sweep will retry"
                                        {:channel channel :outbox-id id})
                             ids)))
                       []
                       (::rows @state))]
    (when (seq published-ids)
      (t2/delete! :queue_message_outbox :id [:in published-ids]))))

(defn defer-transactional!
  "Routes `msgs` for `channel` through the transactional outbox. Accumulates them per channel in
  `*transaction-state*` and, once per transaction, registers [[insert-outbox-rows!]] as a
  before-commit callback and [[publish-outbox-rows!]] as an after-commit callback. Must be called
  inside a transaction."
  [channel msgs]
  (mq.tx/accumulate-and-register!
   ::messages ::registered? channel msgs
   (fn [state]
     ;; capture `state` in the after-commit closure — it runs after the transaction bindings unwind,
     ;; when the dynamic transaction-state is no longer bound (the before-commit insert still runs while
     ;; the transaction is open, so it reads the dynamic var directly).
     (mdb/do-before-commit insert-outbox-rows!)
     (mdb/do-after-commit #(publish-outbox-rows! state)))))

(defn- bump-failed-row
  "Records one failed recovery publish into `acc`: bump the row's `publish_attempts` and schedule its
  next retry at `now` + exponential backoff ([[retry-delay-ms]]). The row is never dropped — a
  publish failure is almost always transient (backend/DB connectivity), and the outbox's guarantee is
  that a committed message is eventually delivered — so it is retried until it publishes."
  [acc ^Instant now {:keys [id queue_name publish_attempts]} ^Exception e]
  (let [next-attempts (inc publish_attempts)
        delay-ms      (retry-delay-ms next-attempts)]
    (log/warn e "Failed to publish queue outbox row during recovery; will retry with backoff"
              {:queue queue_name :outbox-id id :publish-attempts next-attempts :retry-delay-ms delay-ms})
    (analytics/inc! :metabase-mq/batches-retried {:channel queue_name :reason "outbox-recovery"})
    (update acc :bumps conj {:id id :next-attempt-at (Timestamp/from (.plusMillis now delay-ms))})))

(defn- recover-page!
  "Runs one transaction of the recovery sweep over up to [[recovery-page-size]] *due* rows, in id order
  starting after `after-id` (keyset pagination). Publishes each row independently: published rows are
  deleted; rows that hit a *message-specific* failure are bumped and backed off ([[bump-failed-row]]).

  Returns `[recovered next-after-id]`, where `next-after-id` is the id to resume the next page from, or
  nil when the page was empty (no more due rows) OR the backend was found unavailable (stop the sweep)."
  [after-id]
  (t2/with-transaction [_conn]
    (let [now    (Instant/now)
          now-ts (Timestamp/from now)
          rows (t2/query {:select   [:id :queue_name :payload :publish_attempts]
                          :from     [:queue_message_outbox]
                          :where    [:and
                                     [:> :id after-id]
                                     [:or
                                      [:and [:= :next_attempt_at nil]
                                       [:< :created_at (Timestamp/from (.minusMillis now recovery-age-ms))]]
                                      [:<= :next_attempt_at now-ts]]]
                          :order-by [[:id :asc]]
                          :limit    recovery-page-size
                          :for      (for-update-clause)})
          {:keys [recover-ids bumps backend-down?]}
          (reduce (fn [acc {:keys [id queue_name payload] :as row}]
                    (try
                      (transport/publish-encoded! (keyword "queue" queue_name) payload)
                      (update acc :recover-ids conj id)
                      (catch Exception e
                        (if (q.backend/backend-unavailable? e)
                          ;; backend is down — stop now (leave this row untouched) rather than bumping
                          ;; every remaining row and hammering a backend we already know is unavailable.
                          (reduced (assoc acc :backend-down? true))
                          (bump-failed-row acc now row e)))))
                  {:recover-ids [] :bumps [] :backend-down? false}
                  rows)]
      ;; published rows are removed; message-specific failures have their attempt count bumped and next retry scheduled.
      (when (seq recover-ids) (t2/delete! :queue_message_outbox :id [:in recover-ids]))
      (doseq [{:keys [id next-attempt-at]} bumps]
        (t2/update! :queue_message_outbox :id id
                    {:publish_attempts [:+ :publish_attempts [:inline 1]]
                     :next_attempt_at  next-attempt-at}))
      (when backend-down?
        (log/info "Outbox recovery: backend unavailable, remaining rows retry next run"))
      ;; nil next-after-id stops the sweep: no more due rows, or the backend is down.
      [(count recover-ids) (when (and (not backend-down?) (seq rows)) (:id (last rows)))])))

(defn recover-outbox!
  "Republishes outbox rows a crash left behind — rows older than [[recovery-age-ms]] (the normal
  after-commit path deletes its rows immediately).

  Rows that hit a message-specific failure are never dropped — the outbox's guarantee is that a
  committed message is eventually delivered — so they are retried forever (with backoff). If the backend
  itself is unavailable the sweep stops after the first such failure and lets the next scheduled run
  retry, rather than thrashing the whole backlog. The sweep never revisits rows within a sweep.

  Returns the number of rows successfully republished."
  []
  (loop [total    0
         after-id 0]
    (let [[recovered next-after-id] (recover-page! after-id)]
      (if next-after-id
        (recur (long (+ total recovered)) (long next-after-id))
        total))))
