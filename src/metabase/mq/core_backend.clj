(ns metabase.mq.core-backend
  "SPI for implementing an mq queue backend *outside* the mq module.

  A backend is a record that implements the [[QueueBackend]] protocol; the shared poll loop then
  drives it. The appdb and memory backends live inside the module and reach for the internal
  namespaces directly, but out-of-module backends (e.g. the enterprise Redis backend) should
  depend only on this namespace. It re-exports exactly the surface such a backend needs — the
  protocol, the poll-loop driver, and the registry/listener queries — so the module's internals
  stay private and [[metabase.mq.core]] (the user-facing API) stays uncluttered.

  Re-exporting the protocol via potemkin keeps it implementable: a `defrecord` against
  [[QueueBackend]] here still satisfies the original protocol, so the poll loop's calls dispatch
  to it."
  (:require
   [metabase.mq.listener :as listener]
   [metabase.mq.queue.backend :as q.backend]
   [metabase.mq.queue.polling :as q.polling]
   [metabase.mq.queue.registry :as q.registry]
   [metabase.util.namespaces :as u.ns]))

(set! *warn-on-reflection* true)

(u.ns/import-fns
 ;; The protocol an external backend implements (and the poll loop calls back through).
 [q.backend QueueBackend]
 ;; Whether a queue requires at-most-one-batch-in-flight semantics.
 [q.registry exclusive?]
 ;; The channels currently being listened to, plus watch hooks for per-queue setup as new ones
 ;; start being listened to.
 [listener queue-names watch-new-queues! unwatch-new-queues!])

;; The shared poll-loop driver. Renamed so a backend's own `start!`/`shutdown!` protocol methods
;; read unambiguously against these (they delegate the polling thread lifecycle to them).
(u.ns/import-fn q.polling/make-poll-context)
(u.ns/import-fn q.polling/start! start-poll-loop!)
(u.ns/import-fn q.polling/stop! stop-poll-loop!)
