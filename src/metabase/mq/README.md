# metabase.mq

A persistent message queue and pub/sub topic system for Metabase. Supports both durable (database-backed) and in-memory
transports with a unified API.

## Quick Start

```clojure
;; Register a listener
(mq/def-listener! :queue/my-task
  [msg]
  (do-work! msg))

;; Publish a message (inside a transaction — delivers after commit)
(t2/with-transaction [_]
  (mq/with-queue :queue/my-task {:key "value"}))

;; Publish to a topic (fan-out, at-most-once)
(mq/with-topic :topic/settings-changed {:setting "site-name"})
```

## Publishing Semantics

`with-queue` and `with-topic` are designed to read like a direct publish — you write a message and move on. Under the hood, delivery is intentionally deferred through several layers:

1. **Macro body must succeed.** Messages are only enqueued if the body of `with-queue` / `with-topic` returns normally. An exception discards them.

2. **Surrounding transaction must commit.** If the call is inside a `t2/with-transaction` block (directly or transitively), messages are held until the transaction commits. A rollback discards them. This means a message will never be delivered for a database change that didn't happen.

3. **Batching window.** After the transaction commits, messages enter a time-windowed buffer. Rapid-fire publishes to the same channel within a sliding window are coalesced into a single batch before hitting the transport layer. This amortizes per-batch overhead during bursts.

4. **Deduplication.** Before dispatch, duplicate messages in the same batch are removed.

## Queues vs Topics

|               | Queue                                           | Topic                             |
|---------------|-------------------------------------------------|-----------------------------------|
| Delivery      | Exactly-once per listener (claimed by one node) | At-least-once per active node     |
| Retry         | Yes — up to `queue-max-retries` (default 5)     | No                                |
| Backing table | `queue_message_batch`                           | `topic_message_batch`             |
| Backlog       | Persists until processed or exhausted           | Cleaned up after 1 hour           |
| Use when      | Work must complete reliably                     | All nodes must react to something |

## Architecture

```
User Code
  with-queue / with-topic
        │
        ▼
Publish Pipeline (mq.publish)
  collect inside tx → batch 100ms window → deduplicate
        │
        ▼
Transport Dispatch (mq.transport)   ← multimethod on channel namespace
  :queue → queue backends
  :topic → topic backends
        │
        ▼
Backends
  appdb  — FOR UPDATE SKIP LOCKED (queue), offset polling (topic)
  memory — LinkedBlockingQueue per channel
        │
        ▼
Delivery Engine (mq.impl)
  worker pool → handle! → listener fn
```
### Idempotency

Queue listeners must be idempotent. A batch can return to `pending` after a partial failure, and the same messages will
be redelivered. Use `dedup-fn` to filter already-processed messages on retry:

```clojure
(mq/def-listener! :queue/my-task
  {:dedup-fn (fn [msgs] (remove already-processed? msgs))}
  [msg]
  (process! msg))
```

## Testing

Use `with-test-mq` from `metabase.mq.test` to run tests with an isolated in-memory backend. It supports double-delivery
chaos testing to verify listener idempotency.

```clojure
(deftest my-test
  (mq.test/with-test-mq
    (mq/with-queue :queue/my-task {:id 1})
    (is (= 1 @processed-count))))
```
