(ns metabase.explorations.queues
  "Wires the two units of exploration work onto the persistent queue.

    :queue/exploration-plan            one message per started thread
    :queue/exploration-query           one message per planned query

  Each stage publishes the next: starting a thread enqueues a plan, and planning enqueues that
  thread's queries. `metabase.explorations.runner` holds the actual work; this namespace is only
  the plumbing.

  Every publish happens inside the transaction that produced the rows the message names, so the
  queues are declared `:transactional :require`: a message exists iff the write that justified it
  committed. That is what lets the handlers be pure idempotency gates — a message can never point at
  a row that isn't there, and a row can never be left with no message coming for it.

  Delivery is at-least-once with a bounded retry budget and no dead-letter queue, so each queue also
  declares an `:on-error` handler. This matters more here than for most work: an exploration's
  completion gate is \"no queries still pending\", and the client polls until the thread completes.
  A batch that exhausted its retries and vanished would strand the row in `pending` and the user on
  a spinner forever. The `:on-error` handlers write the terminal state the UI already knows how to
  render (`error` on a query, the planning-failed doc on a thread that never planned), so giving up
  is something the user sees rather than something that hangs.

  Most failures never reach those handlers, though, and that is deliberate — how long a failure is
  retried, and who records it, depends on what the failure looks like:

    - Planning failures are terminal on the first attempt. `generate-query-plan!` catches its own
      throwables and writes the planning-failed state itself, so nothing propagates for mq to retry.
      The plan queue's `:on-error` is the backstop for failures *around* the planner — app-db trouble
      in the listener — not for the planner itself.

    - A failing query is retried once immediately, inside the delivery. If it still fails while
      others in its batch succeed, it is poison rather than infrastructure: it is stamped `error`
      right there, so the user sees it promptly instead of after a full backoff ladder.

    - When every message of a *multi-message* batch fails, no single query can be blamed — that is an
      outage. The batch is rethrown so mq redelivers it with exponential backoff, and only an
      exhausted budget hands it to `:on-error`. See [[deliver-batch!]]."
  (:require
   [metabase.explorations.runner :as runner]
   [metabase.explorations.settings :as explorations.settings]
   [metabase.mq.core :as mq]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

;;; --------------------------------------- Batch delivery ---------------------------------------

(defn- record-failure!
  "Write one message's terminal-failure state via `fail!`, returning whatever `fail!` returns (the
  affected thread-id). Logs and swallows — returning nil — if that write itself throws: recording a
  message's failure must never throw past its batch-mates, or a racing duplicate insert or transient
  db blip inside `fail!` would strand every message behind it. The follow-up completion check is NOT
  done here (see [[deliver-batch!]])."
  [fail! message error]
  (try
    (fail! message error)
    (catch Throwable e
      (log/error e "Recording a failed exploration message failed; its thread may hang until retried"
                 {:message message})
      nil)))

(defn- attempt-message!
  "Runs `handle!` on one message, retrying it once within this delivery so a momentary blip on one
  message does not cost its batch-mates a redelivery. Returns `{:message _ :thread-id _}` if it
  succeeded, or `{:message _ :error throwable}` if both attempts failed."
  [handle! message]
  (try
    {:message message :thread-id (u/auto-retry 1 (handle! message))}
    (catch Throwable e
      {:message message :error e})))

(defn- deliver-batch!
  "Runs `handle!` on every message of a batch and decides how the batch gives up.

  A batch that failed only in part is read as poison messages: each failure is recorded terminally via
  `fail!` without aborting its batch-mates, so a bad query surfaces promptly and on its own.

  A batch in which every one of *several* messages failed is read as an outage instead — one poison
  message cannot fail its batch-mates — so it is rethrown, handing it back to mq to redeliver on its
  exponential backoff ladder (which also releases this worker in between) rather than burning a
  transient blip into terminal, user-visible state milliseconds after the first attempt. Nothing is
  recorded on the way out; if that retry budget runs out, the queue's `:on-error` writes the terminal
  state after all.

  A *lone* failing message stays on the recording path: with no batch-mates, nothing distinguishes an
  outage from a query that was never going to work, and making the user wait out the whole ladder for
  the latter is the worse of the two mistakes.

  Both `handle!` and `fail!` return the affected thread-id (or nil). Returns the distinct non-nil
  thread-ids the batch touched — the caller runs their completion checks separately, OUTSIDE this
  per-message swallow, so a failing check can propagate to mq for retry rather than being lost."
  [messages handle! fail!]
  (let [results (mapv #(attempt-message! handle! %) messages)]
    (if (and (next results) (every? :error results))
      (let [e (:error (first results))]
        (log/warnf e "All %d messages of an exploration batch failed; letting mq retry it with backoff"
                   (count results))
        (throw e))
      (into #{}
            (keep (fn [{:keys [message thread-id error]}]
                    (if error
                      (do (log/error error "Exploration message failed every attempt; recording it as failed"
                                     {:message message})
                          (record-failure! fail! message error))
                      thread-id)))
            results))))

(defn- mark-query-errored!
  "The query queue's `fail!`: terminally mark the message's query `error` (the state the UI renders)
  and return its thread id. Deliberately does NOT run the completion check — that is run by the
  listener, outside [[deliver-batch!]]'s swallow, so its failures reach mq."
  [{:keys [query-id]} error]
  (runner/fail-query! query-id (ex-message error)))

(defn- try-complete-thread!
  "Best-effort completion check for the `:on-error` give-up path: mq swallows an `:on-error` throw
  and drops the batch regardless, so log-and-swallow here rather than abort the remaining threads."
  [thread-id]
  (try
    (runner/maybe-complete-thread! thread-id)
    (catch Throwable e
      (log/error e "Completion check failed while giving up on an exploration batch" {:thread-id thread-id}))))

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
               ;; Retries exhausted: mark each query `error` (isolated) and re-check its thread's
               ;; completion. Best-effort — mq drops the batch on any `:on-error` throw anyway.
               (run! try-complete-thread!
                     (into #{} (keep #(record-failure! mark-query-errored! % error)) messages)))})

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

;;; ------------------------------------------- Listeners -------------------------------------------

(mq/def-listener! :queue/exploration-plan [messages]
  (doseq [{:keys [thread-id]} messages]
    (runner/plan-thread! thread-id)
    (publish-pending-queries! thread-id)
    ;; A plan that produced no queries (nothing applicable, or a terminally-failed planner) is
    ;; already finished — the gate is what tells the client to stop polling.
    (runner/maybe-complete-thread! thread-id)))

(mq/def-listener! :queue/exploration-query [messages]
  (->> (deliver-batch! messages
                       (fn [{:keys [query-id]}] (runner/run-query! query-id))
                       mark-query-errored!)
       (run! runner/maybe-complete-thread!)))
