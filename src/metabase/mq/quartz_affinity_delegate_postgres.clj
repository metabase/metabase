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
  [this conn no-later no-earlier max-count]
  (quartz-affinity/select-trigger-to-acquire conn no-later no-earlier max-count
                                             (fn [sql] (.superRtp this sql))))
