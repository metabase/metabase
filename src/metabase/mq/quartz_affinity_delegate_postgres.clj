(ns metabase.mq.quartz-affinity-delegate-postgres
  "Affinity `DriverDelegate` for Postgres: a `PostgreSQLDelegate` subclass (Metabase uses
  `PostgreSQLDelegate` on Postgres for BLOB handling) that overrides only `selectTriggerToAcquire`,
  re-issuing the acquire query with this node's queue capability spliced into its `WHERE` clause.

  Identical to `metabase.mq.quartz-affinity-delegate-std` except for the base class — keep the two in
  sync. See [[metabase.mq.quartz-affinity]]."
  (:gen-class :extends org.quartz.impl.jdbcjobstore.PostgreSQLDelegate
              :name metabase.mq.QueueAffinityPostgresDelegate
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
