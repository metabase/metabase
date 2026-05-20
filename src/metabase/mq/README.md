# metabase.mq

A persistent message queue for Metabase. Supports both durable (database-backed) and in-memory transports with a
unified API.

## Quick Start

```clojure
;; Declare the queue (its broker-side identity and properties)
(mq/def-queue! :queue/my-task)

;; Register a listener (the consumer-side handler)
(mq/def-listener! :queue/my-task
  [msg]
  (do-work! msg))

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

## Queue semantics

|               | Queue                                       |
|---------------|---------------------------------------------|
| Delivery      | At-least-once per listener                  |
| Retry         | Yes — up to `queue-max-retries` (default 5) |
| Backing table | `queue_message_batch`                       |
| Backlog       | Persists until processed or exhausted       |
| Use when      | Work must complete reliably                 |

## Architecture

```
User Code
  with-queue
        │
        ▼
Publish Pipeline (mq.publish)
  collect inside tx → batch 100ms window → deduplicate
        │
        ▼
Transport Dispatch (mq.transport)   ← multimethod on channel namespace
  :queue → queue backends
        │
        ▼
Backends
  appdb  — FOR UPDATE SKIP LOCKED
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

Use `with-test-mq` from `metabase.mq.test` to run tests with an isolated in-memory backend. It supports double-delivery
chaos testing to verify listener idempotency.

```clojure
(deftest my-test
  (mq.test/with-test-mq
    (mq/with-queue :queue/my-task {:id 1})
    (is (= 1 @processed-count))))
```
