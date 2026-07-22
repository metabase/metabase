(ns metabase.op-cache-impl.storage
  "Storage protocol for the op cache: keyed reads and writes of values, plus per-key claims. Implement this to plug
  in a storage medium (application database, in-memory, ...). No cache semantics (freshness, grace windows,
  coalescing) belong here.")

(defprotocol Storage
  "Keyed reads and writes of values, plus per-key claims. Implementations must make `try-claim!` atomic across every
  process sharing the storage."
  (read-entry [storage k]
    "The stored entry for `k`: `{:value <any>, :written-at <instant>}`, or nil if there is none.")
  (write-entry! [storage k value]
    "Store `value` at `k`, stamping `:written-at` with the current time and releasing any claim on `k`.")
  (delete-entry! [storage k]
    "Remove the entry for `k`, along with any claim on it.")
  (try-claim! [storage k claim-ttl-ms]
    "Atomically claim `k`. Returns true if this caller won the claim; false if another caller holds a live one. A
    claim older than `claim-ttl-ms` counts as abandoned and may be taken over. Claims are per-key and independent of
    whether a value is stored at `k`.")
  (release-claim! [storage k]
    "Release any claim on `k` without touching the stored value."))
