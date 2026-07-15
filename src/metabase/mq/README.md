# metabase.mq

A persistent message queue for Metabase. Supports both durable (database-backed) and in-memory transports with a
unified API.

## Quick Start

```clojure
;; Declare the queue (its broker-side identity and properties).
(mq/def-queue! :queue/my-task {:transactional :try})

;; Register a listener (the consumer-side handler). The body receives a *vector* of messages.
(mq/def-listener! :queue/my-task
  [messages]
  (doseq [msg messages] (do-work! msg)))

;; Publish a message (inside a transaction — delivers after commit)
(t2/with-transaction [_]
  (mq/with-queue :queue/my-task [q]
    (mq/put q {:key "value"})))
```

All queue config — `:exclusive`, `:max-concurrent-batches`, `:max-batch-messages`, `:dedup-fn` — belongs on `def-queue!`,
because it takes effect at publish time on every node, regardless of where listeners are
registered. `def-listener!` only wires up the consumer-side handler. A listener registration
throws if its queue hasn't been declared yet — typos are caught at startup, not at first
publish.

## Publishing Semantics

`with-queue` is designed to read like a direct publish — you write a message and move on. Under the hood, delivery is intentionally deferred through several layers:

1. **Macro body must succeed.** Messages are only enqueued if the body of `with-queue` returns normally. An exception discards them.

2. **Surrounding transaction must commit.** If the call is inside a `t2/with-transaction` block (directly or transitively), messages are held until the transaction commits. A rollback discards them. This means a message will never be delivered for a database change that didn't happen.

3. **Batching window.** After the transaction commits, messages enter a time-windowed buffer. Rapid-fire publishes to the same channel within a sliding window are coalesced into a single batch before hitting the transport layer. This amortizes per-batch overhead during bursts. If a batch can't reach the backend when the window flushes, it is handed to the durable outbox (see below) instead of being retried in memory and eventually dropped — so a non-transactional publish survives a backend outage as long as the app DB is reachable.

4. **Deduplication.** Before dispatch, duplicate messages in the same batch are removed.

## Transactional publishing (the outbox)

Every queue declares a `:transactional` mode that controls how a publish relates to the surrounding
DB transaction. The routing (see `metabase.mq.publish/publish-collected!`):

| Mode       | In a transaction                                                  | Outside a transaction                     |
|------------|-------------------------------------------------------------------|-------------------------------------------|
| `:require` | Routed through the outbox                                         | **Throws** — a transaction is mandatory   |
| `:try`     | Routed through the outbox                                         | Published immediately\*                   |
| `:never`   | Deferred to after-commit, but held only in memory (no outbox row) | Published immediately\*                   |

\* "Immediately" means handed to the publish pipeline right away — which still passes through the
~100ms coalescing buffer (see step 3 above), so it is buffered in memory briefly rather than written to
the backend synchronously. A crash within that window loses a non-transactional publish; use `:require`
or `:try`-in-a-transaction if that matters.

### Why an outbox?

For `:require`/`:try` inside a transaction, handing the message straight to the backend after the
business write is unsafe: if the node crashes after the business transaction commits but before the
publish, the message is lost. The transactional outbox (`metabase.mq.queue.outbox`, table
`queue_message_outbox` in the app DB) closes that gap:

1. **before-commit** — the messages collected for each channel are dedup'd, chunked by
   `:max-batch-messages`, encoded, and inserted as `queue_message_outbox` rows *inside the still-open
   business transaction*, so they commit atomically with the business writes. A throwing
   before-commit callback rolls the whole transaction back.
2. **after-commit** — each inserted row is published to the backend and then deleted — straight
   through, no buffering. Each row has its own try/catch: if the publish fails (backend down,
   scheduler unavailable, …) the row is **left in place** for the recovery sweep. A row is only
   deleted once its publish has succeeded.
3. **recovery** — a periodic sweep (`recover-outbox!`, driven by the Quartz job in
   `metabase.mq.task.outbox`) republishes any rows older than ~1 minute that a crash — or a failed
   after-commit publish — left behind, deleting each row once its publish succeeds. It claims rows
   with `FOR UPDATE SKIP LOCKED`, so concurrent sweeps on different nodes pick up disjoint rows. A
   publish failure is almost always transient (backend/DB connectivity), so a failing row is **never
   dropped**: its `publish_attempts` is bumped and its next retry scheduled with exponential backoff
   (`next_attempt_at`, 1m doubling up to 10m), and it is retried until it publishes.

A row for a queue that was later *removed* from the code isn't a special case: publishing to the backend
doesn't check queue existence, so the row publishes normally and is deleted; the resulting trigger then
ages out through the queue reaper (`metabase.mq.task.queue-reaper`) like any other unlistened message.

The net guarantee: **a message is published if and only if the business transaction that produced it
commits**, regardless of which backend the queue uses — the outbox table always lives in the app DB.
Delivery stays at-least-once (a crash in the after-commit window makes the sweep republish), so
listeners must be idempotent.

`:never` skips the outbox *on the happy path*: inside a transaction it still waits for commit (a
rollback discards it) but is held only in memory — no outbox row — so it stays cheap under load. It is
best-effort in the sense that a *crash* before the buffer flushes loses it. It is **not** best-effort
about backend availability: if the flush can't reach the backend, a `:never` batch falls back to the
outbox just like `:try`, so a backend outage doesn't lose messages. Use `:never` when you want to avoid
the per-publish outbox write, not when you're willing to drop messages.

### Publish-time outbox fallback (non-transactional publishes)

A publish that isn't routed through the outbox up front — `:try` outside a transaction, or any `:never`
publish — goes through the batching buffer and then straight to the backend. If that backend write
fails (scheduler down, momentary DB blip), the buffer does **not** manage its own retry/drop: it writes
the batch to `queue_message_outbox` via `outbox/insert-batch!` (leaving `next_attempt_at` null, like a
crash-orphaned row), and the same recovery sweep takes over — it picks the row up once it has aged past
`recovery-age-ms` (~1 minute), then retries with backoff, never dropping. So a handed-off batch is
delayed by up to that recovery window plus the sweep interval, not published instantly — but it is not
lost. The only remaining loss is if the outbox insert *also* fails, i.e. the app DB is down too (a total
outage), which is logged and metered as `batches-dropped{reason=outbox-handoff-failed}`.

## Message serialization

Messages must be JSON-serializable. A batch is encoded to a JSON string once, at the publish
boundary (`mq.transport/publish!` → `mq.payload/encode`), and decoded once, at the delivery
boundary (`mq.impl/deliver!` → `mq.payload/decode`). In between, backends move the opaque string
around and never look inside it — so encoding is not a backend concern, and every backend
delivers an identical shape. Decoding keywordizes map keys, but values pass through JSON:
keyword values become strings, sets become vectors, dates become strings.

## Queue semantics

|               | Queue                                                                |
|---------------|----------------------------------------------------------------------|
| Delivery      | At-least-once per listener                                           |
| Ordering      | **None.** See below                                                  |
| Retry         | Yes — up to `queue-max-retries` (default 5)                          |
| Backing store | Quartz `QRTZ_*` tables; `queue_message_outbox` for transactional publishes |
| Backlog       | Persists until processed or exhausted                               |
| Use when      | Work must complete reliably                                         |

**Guaranteed delivery is the guarantee. Ordering is not.** Batches are delivered concurrently, retried
with backoff (so a failed batch lands after ones published later), and Quartz does not fire triggers in
submission order even when it serializes them. Don't write a listener that assumes it sees messages in
publish order — and don't infer the guarantee from a test that passed, since the memory backend can
look FIFO by accident. If a queue needs serialized delivery, say so with `:max-concurrent-batches 1`
(per node) or `:exclusive true` (cluster-wide) — and note that even those give you mutual exclusion,
not order.

### Limiting concurrency

By default a queue's batches run concurrently, bounded only by the Quartz thread pool — which is
shared with sync, pulses, and every other scheduled job. A queue that can fan out (one message per
row, per chart, per whatever) will happily eat that pool. Two knobs bound it:

| Config                       | Bound                                    | Hard? | Enforced by |
|------------------------------|------------------------------------------|-------|-------------|
| `:exclusive true`            | 1 batch **cluster-wide**                 | Yes   | The backend (see below) |
| `:max-concurrent-batches n`  | ~n batches **per node**                  | No — a throttle | Trigger acquisition / `fetch!` free-slot count |
| *(neither)*                  | Unbounded, up to the Quartz thread pool  | —     | — |

`:exclusive` is a **backend** guarantee, and each backend implements it its own way — Quartz with
`@DisallowConcurrentExecution` on the job class, the memory backend by never fetching a second batch
for a queue that already has one in flight. The shared poll driver knows nothing about the flag, so a
new backend has to implement it or it silently won't hold.

**Pick one — they don't layer.** Declaring both throws at registration: `:exclusive` is already the
strictest limit there is, so a per-node cap on top of it could never bind, and the two are enforced by
completely different machinery. A queue that wants "roughly one at a time, per node" wants
`:max-concurrent-batches 1`; a queue that needs *exactly* one at a time wants `:exclusive`.

`:max-concurrent-batches` may be an int or a 0-arg fn, so a cap can be backed by a setting and tuned
live:

```clojure
(mq/def-queue! :queue/exploration-query
  {:transactional :require
   :max-batch-messages 100
   :max-concurrent-batches #(explorations.settings/explorations-worker-count)})
```

A node at its cap **stops taking the work** rather than queueing it internally: it reports the queue as
one it currently can't handle, and the affinity delegate leaves those triggers `WAITING` in the shared
store for a node with room. That's the same mechanism that keeps a node from acquiring messages for a
queue it has no listener for. It's also the only shape of limit a real broker can honor — "fetch at
most N right now" is SQS's `MaxNumberOfMessages` and a Redis multi-pop count — so poll backends express
it by asking `fetch!` for a per-queue free-slot count.

**`:max-concurrent-batches` is a throttle, not a guarantee.** Both enforcement points race the work
they're gating — Quartz decides what to acquire on its scheduler thread *before* the job body runs, and
a poll backend can hand back a batch it fetched a moment before a slot filled — so a node can end up a
batch or two over its cap. When that happens the batch is simply **delivered**. It is not bounced: a
re-queue path would need its own backoff, its own metric, and a hot-loop to avoid if the upstream
throttle ever stopped working, all to shave an overshoot that is small, bounded, and drains itself.
Reach for `:exclusive` when a limit has to actually hold.

A queue's config means the same thing on every backend — that's a contract, not a coincidence. The
backends differ in *mechanism* (Quartz pushes and filters at trigger acquisition; poll backends ask
`fetch!` for a free-slot count), never in what the config means. If you add a backend, that is the bar.

### Terminal failures: `:on-error`

There is no dead-letter queue. Once a batch exhausts `queue-max-retries` it is dropped, and without a
handler the only trace is a log line and a `batches-dropped{reason=delivery-exhausted}` counter. That
is fine for fire-and-forget work, but it silently strands anything the *producer* left behind — a row
parked in a `pending` status waiting on the handler will sit there forever.

Declare an `:on-error` handler to record the terminal failure durably:

```clojure
(mq/def-queue! :queue/run-report
  {:transactional :require
   :on-error (fn [{:keys [channel messages error attempts]}]
               (doseq [{:keys [report-id]} messages]
                 ;; Only fail a report that is still pending. See "at-least-once" below: this
                 ;; handler can fire for a batch a peer already completed.
                 (t2/update! :model/Report {:id report-id :status "pending"}
                             {:status "error" :error_message (ex-message error)})))})
```

It is called on the terminal drop only — not on each failed attempt, and never for a batch that
recovers on a retry. Exceptions it throws are logged (`on-error-failed`) and swallowed: the batch is
dropped either way, so a broken handler cannot wedge the queue into redelivering an exhausted batch.

**`:on-error` is at-least-once, like delivery itself. Write it to be idempotent, and to tolerate
firing for work that actually succeeded** — hence the `:status "pending"` guard above.

A message carries no identity. A retry is a fresh trigger with a new id, and the attempt counter
rides inside it, so two deliveries of one payload are two *independent* batches with two independent
retry budgets and nothing joining them. If a duplicate delivery fails while the original succeeded,
the failing copy runs out its own budget and fires `:on-error` for a batch that is already done. That
is not a corner case reserved for crashes: Quartz's cluster failover re-fires a batch onto a second
node whenever the first misses a heartbeat, which a *live* node does under a long GC pause or app-DB
latency — it is never told to stop, and its copy carries on.

`metabase.mq.queue.on-error-test` pins this
(`duplicate-delivery-fires-on-error-for-an-already-succeeded-payload-test`). Closing it needs message
identity plus a record of what has already been delivered.

The hook lives in the shared retry-vs-drop policy (`metabase.mq.queue.impl/handle-batch-failure-policy!`)
rather than in any one backend, so it is inherited by every backend — a poll backend gets it through the
shared poll driver, a push backend by calling the policy directly (as Quartz does). A backend cannot
implement a retry budget without going through that policy, so `:on-error` comes along for free with any
backend added later.

## Architecture

```
User Code
  with-queue
        │
        ▼
Publish Pipeline (mq.publish)
  collect in with-queue → deduplicate → route by :transactional mode:
    immediate → 100ms coalescing buffer       (mq.publish-buffer)
    outbox    → queue_message_outbox row,
                published after commit         (mq.queue.outbox)
        │
        ▼
Transport Dispatch (mq.transport)   ← multimethod on channel namespace
  :queue → queue backends
        │
        ▼
Backends
  quartz — one-shot Quartz job per batch (push; clustered JDBC JobStore)
  memory — LinkedBlockingQueue per channel
        │
        ▼
Delivery Engine (mq.impl)
  worker pool → handle! → listener fn
```
### Idempotency

Queue listeners must be idempotent, and must be safe to run **concurrently with another copy of
themselves on another node**. Two things to hold onto:

- **A batch can be redelivered.** It returns to `pending` after a partial failure, and the same
  messages come back.
- **A batch can be delivered *twice at once*.** Quartz's clustered failover re-fires a batch onto a
  second node when the first misses a heartbeat — and a live node misses heartbeats under a long GC
  pause, app-DB latency, or pool exhaustion. It is never interrupted, so both copies run. Separately,
  a queue that isn't declared `:exclusive` has no cross-node mutual exclusion at all: N nodes × the
  Quartz thread pool can be in the same listener at once.

A "have I already done this?" check is therefore not enough on its own — two copies can both check,
both see no, and both proceed. Where that matters, make the *write* safe rather than the check:
condition the update on the state that justified the message (`{:id x :status "pending"}`), reserve
via a unique constraint, or take a row lock and re-check inside the transaction.

`with-test-mq`'s `{:duplicate-delivery? true}` (below) delivers every message twice, which will catch
a listener that assumed exactly-once.

## Testing

Use `with-test-mq` from `metabase.mq.test-util` to run tests against an isolated in-memory backend.
Declare the queue at namespace top level (so it registers into every run's fresh registry), then
pass a listener map right after the binding vector. Pass `{:duplicate-delivery? true}` in the opts
map to deliver every message twice and prove your listener is idempotent.

```clojure
(mq/def-queue! :queue/my-task {:transactional :try})

(deftest my-test
  (let [processed (atom [])]
    (mq.tu/with-test-mq [ctx]
      {:queue/my-task (fn [messages] (swap! processed into messages))}
      (mq/with-queue :queue/my-task [q] (mq/put q {:id 1}))
      (mq.tu/eventually! ctx #(= 1 (count @processed)))
      (is (= [{:id 1}] @processed)))))
```
