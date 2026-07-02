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

All queue config — `:exclusive`, `:max-batch-messages`, `:dedup-fn` — belongs on `def-queue!`,
because it takes effect at publish time on every node, regardless of where listeners are
registered. `def-listener!` only wires up the consumer-side handler. A listener registration
throws if its queue hasn't been declared yet — typos are caught at startup, not at first
publish.

## Publishing Semantics

`with-queue` is designed to read like a direct publish — you write a message and move on. Under the hood, delivery is intentionally deferred through several layers:

1. **Macro body must succeed.** Messages are only enqueued if the body of `with-queue` returns normally. An exception discards them.

2. **Surrounding transaction must commit.** If the call is inside a `t2/with-transaction` block (directly or transitively), messages are held until the transaction commits. A rollback discards them. This means a message will never be delivered for a database change that didn't happen.

3. **Batching window.** After the transaction commits, messages enter a time-windowed buffer. Rapid-fire publishes to the same channel within a sliding window are coalesced into a single batch before hitting the transport layer. This amortizes per-batch overhead during bursts.

4. **Deduplication.** Before dispatch, duplicate messages in the same batch are removed.

## Transactional publishing (the outbox)

Every queue declares a `:transactional` mode that controls how a publish relates to the surrounding
DB transaction. The routing (see `metabase.mq.publish/publish-collected!`):

| Mode       | In a transaction                                                  | Outside a transaction                   |
|------------|-------------------------------------------------------------------|-----------------------------------------|
| `:require` | Routed through the outbox                                         | **Throws** — a transaction is mandatory |
| `:try`     | Routed through the outbox                                         | Published immediately                   |
| `:never`   | Deferred to after-commit, but held only in memory (no outbox row) | Published immediately                   |

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
   (`next_attempt_at`, 1m doubling up to 1h), and it is retried until it publishes.

The net guarantee: **a message is published if and only if the business transaction that produced it
commits**, regardless of which backend the queue uses — the outbox table always lives in the app DB.
Delivery stays at-least-once (a crash in the after-commit window makes the sweep republish), so
listeners must be idempotent.

`:never` skips the outbox: inside a transaction it still waits for commit (a rollback discards it)
but is held only in memory, so it is best-effort — a crash before delivery loses it. Use it only
where durability doesn't matter.

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
| Retry         | Yes — up to `queue-max-retries` (default 5)                          |
| Backing store | Quartz `QRTZ_*` tables; `queue_message_outbox` for transactional publishes |
| Backlog       | Persists until processed or exhausted                               |
| Use when      | Work must complete reliably                                         |

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

Queue listeners must be idempotent. A batch can return to `pending` after a partial failure, and the same messages will
be redelivered.

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
