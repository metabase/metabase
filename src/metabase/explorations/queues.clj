(ns metabase.explorations.queues
  "Wires the three units of exploration work onto the persistent queue.

    :queue/exploration-plan            one message per started thread
    :queue/exploration-query           one message per planned query
    :queue/exploration-timeline-score  one message per (done query, selected timeline) pair

  Each stage publishes the next: starting a thread enqueues a plan, planning enqueues that thread's
  queries, and a query finishing enqueues its timeline pairs. `metabase.explorations.runner`
  holds the actual work; this namespace is only the plumbing.

  Every publish happens inside the transaction that produced the rows the message names, so the
  queues are declared `:transactional :require`: a message exists iff the write that justified it
  committed. That is what lets the handlers be pure idempotency gates — a message can never point at
  a row that isn't there, and a row can never be left with no message coming for it.

  Delivery is at-least-once with a bounded retry budget and no dead-letter queue, so each queue also
  declares an `:on-error` handler. This matters more here than for most work: an exploration's
  completion gate is \"no queries still pending and every pair scored\", and the client polls until
  the thread completes. A batch that exhausted its retries and vanished would strand the row in
  `pending` and the user on a spinner forever. The `:on-error` handlers write the terminal state the
  UI already knows how to render (`error` on a query, a null-score sentinel on a pair, the
  planning-failed doc on a thread that never planned), so giving up is something the user sees
  rather than something that hangs."
  (:require
   [metabase.explorations.runner :as runner]
   [metabase.explorations.settings :as explorations.settings]
   [metabase.mq.core :as mq]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; --------------------------------------- Batch delivery ---------------------------------------

(defn- fail-query-message!
  "Terminal state for one query message: the row goes `error` with a message the UI renders, and the
  thread's completion gate is re-checked so the client stops polling."
  [{:keys [query-id]} error]
  (let [thread-id (runner/fail-query! query-id (ex-message error))]
    (runner/maybe-complete-thread! thread-id)))

(defn- fail-pair-message!
  "Terminal state for one timeline-score message: the pair is recorded unscored, which is what lets
  its thread complete rather than waiting forever on a score that is never coming."
  [{:keys [query-id timeline-id]} _error]
  (let [thread-id (runner/fail-pair! query-id timeline-id)]
    (runner/maybe-complete-thread! thread-id)))

(defn- record-failure!
  "Write one message's terminal-failure state via `fail!`, logging (never rethrowing) if that write
  itself fails. Recording a message's failure must never throw past its batch-mates: a racing
  duplicate insert or a transient db blip inside `fail!` would otherwise strand every message behind
  it without the terminal state its thread's completion gate is waiting on."
  [fail! message error]
  (try
    (fail! message error)
    (catch Throwable e
      (log/error e "Recording a failed exploration message failed; its thread may hang until retried"
                 {:message message}))))

(defn- deliver-batch!
  "Runs `handle!` on each message of a batch, isolating the messages from one another."
  [messages handle! fail!]
  (doseq [message messages]
    (try
      (u/auto-retry 1 (handle! message))
      (catch Throwable e
        (log/error e "Exploration message failed every attempt; recording it as failed" {:message message})
        (record-failure! fail! message e)))))

;;; ------------------------------------------- Queues -------------------------------------------

(mq/def-queue! :queue/exploration-plan
  {:transactional :require
   ;; One planner call per thread — a batch of 1 keeps each thread's LLM call on its own
   ;; retry budget rather than making a slow thread's failure re-run its neighbours.
   :max-batch-messages 1
   :on-error (fn [{:keys [messages error]}]
               (log/error error "Exploration planning gave up after exhausting retries"
                          {:thread-ids (mapv :thread-id messages)})
               (doseq [{:keys [thread-id]} messages]
                 ;; fail-plan! terminally stamps a thread that never planned, which is what stops
                 ;; the client polling it.
                 (runner/fail-plan! thread-id (ex-message error))
                 ;; For a thread that *was* planned (this delivery was a failing duplicate), this
                 ;; is the normal completion check; for one that wasn't, it's a no-op.
                 (runner/maybe-complete-thread! thread-id)))})

(mq/def-queue! :queue/exploration-query
  {:transactional :require
   :max-batch-messages 100
   :max-concurrent-batches #(explorations.settings/explorations-worker-count)
   :on-error (fn [{:keys [messages error]}]
               (run! #(record-failure! fail-query-message! % error) messages))})

(mq/def-queue! :queue/exploration-timeline-score
  {:transactional :require
   :max-batch-messages 100
   :max-concurrent-batches #(explorations.settings/explorations-worker-count)
   :on-error (fn [{:keys [messages error]}]
               (run! #(record-failure! fail-pair-message! % error) messages)
               (log/warn error "Timeline scoring gave up after exhausting retries; pair recorded unscored"))})

;;; ------------------------------------------ Publishing ------------------------------------------

(defn start-thread!
  "Start `thread-id`'s background processing by enqueuing its planning stage. Call inside the
  transaction that starts the thread, so the thread is planned iff it was really started."
  [thread-id]
  (mq/with-queue :queue/exploration-plan [q]
    (mq/put q {:thread-id thread-id})))

(defn- publish-pending-queries!
  "Enqueue every query of `thread-id` still waiting to run.

  Publishing whatever is currently `pending` (rather than whatever we just inserted) is what makes
  the plan handler safely redeliverable: a crash between inserting the rows and publishing their
  messages leaves the rows `pending`, and the redelivered plan message — which skips re-planning
  because the rows now exist — picks them up here. Re-publishing a message for a query that is
  already in flight is harmless, since running one is idempotent."
  [thread-id]
  (when-let [ids (seq (runner/pending-query-ids thread-id))]
    (t2/with-transaction [_conn]
      (mq/with-queue :queue/exploration-query [q]
        (doseq [id ids]
          (mq/put q {:query-id id}))))))

(defn- publish-timeline-pairs!
  "Enqueue scoring for a freshly-done `query-id` against each timeline selected on its thread."
  [thread-id query-id]
  (when-let [timeline-ids (seq (runner/thread-timeline-ids thread-id))]
    (t2/with-transaction [_conn]
      (mq/with-queue :queue/exploration-timeline-score [q]
        (doseq [timeline-id timeline-ids]
          (mq/put q {:query-id query-id :timeline-id timeline-id}))))))

;;; ------------------------------------------- Listeners -------------------------------------------

(mq/def-listener! :queue/exploration-plan [messages]
  (doseq [{:keys [thread-id]} messages]
    (runner/plan-thread! thread-id)
    (publish-pending-queries! thread-id)
    ;; A plan that produced no queries (nothing applicable, or a terminally-failed planner) is
    ;; already finished — the gate is what tells the client to stop polling.
    (runner/maybe-complete-thread! thread-id)))

(mq/def-listener! :queue/exploration-query [messages]
  (deliver-batch! messages
                  (fn [{:keys [query-id]}]
                    (when-let [thread-id (runner/run-query! query-id)]
                      (publish-timeline-pairs! thread-id query-id)
                      (runner/maybe-complete-thread! thread-id)))
                  fail-query-message!))

(mq/def-listener! :queue/exploration-timeline-score [messages]
  (deliver-batch! messages
                  (fn [{:keys [query-id timeline-id]}]
                    (when-let [thread-id (runner/score-pair! query-id timeline-id)]
                      (runner/maybe-complete-thread! thread-id)))
                  fail-pair-message!))
