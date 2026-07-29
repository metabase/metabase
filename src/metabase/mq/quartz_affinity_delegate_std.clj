(ns metabase.mq.quartz-affinity-delegate-std
  "Affinity `DriverDelegate` for H2/MySQL: a `StdJDBCDelegate` subclass that overrides only
  `selectTriggerToAcquire`, re-issuing the acquire query with this node's queue capability spliced into
  its `WHERE` clause. See [[metabase.mq.quartz-affinity]] for the why and how.

  This is `gen-class`, so it is AOT-compiled in the uberjar and runtime-compiled in dev by
  [[metabase.mq.quartz-affinity/install-delegate!]]. Keep this namespace tiny — all logic lives in
  `metabase.mq.quartz-affinity` — and keep it in sync with `metabase.mq.quartz-affinity-delegate-postgres`
  (the two differ only in their base class)."
  (:gen-class :extends org.quartz.impl.jdbcjobstore.StdJDBCDelegate
              :name metabase.mq.QueueAffinityStdDelegate
              :exposes-methods {rtp superRtp})
  (:require
   [metabase.mq.quartz-affinity :as quartz-affinity]))

(set! *warn-on-reflection* true)

(defn -selectTriggerToAcquire
  "gen-class override: acquire triggers with this node's queue-affinity predicate baked into the query
  (see [[metabase.mq.quartz-affinity/select-trigger-to-acquire]]), rather than Quartz's unfiltered scan."
  ;; `(.superRtp this ...)` is a reflective call: `superRtp` is the gen-class's own exposed super
  ;; method, so it only exists on the class this very namespace generates — `this` can't be type-hinted
  ;; with that class at its own compile time (it isn't defined yet). The reflection is therefore
  ;; unavoidable here and harmless (one call per trigger-acquire query); this shim ns is excluded from
  ;; Eastwood's reflection linter in deps.edn for the same reason.
  [this conn no-later no-earlier max-count]
  (quartz-affinity/select-trigger-to-acquire conn no-later no-earlier max-count
                                             (fn [sql] (.superRtp this sql))))
