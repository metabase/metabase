(ns metabase.run-tracking.core
  "Shared primitives for run-tracking heartbeats and orphan reaping: the atomic stale-row reaper and the
  heartbeat write."
  (:require
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2])
  (:import
   (java.time Duration Instant OffsetDateTime)
   (java.time.temporal ChronoUnit)))

(set! *warn-on-reflection* true)

(defn cutoff
  "Honeysql form for `(now - age unit)` in the app-db dialect."
  [age unit]
  (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit))

(defn unit->duration
  "Convert `age` of `unit` (`:second`, `:minute`, or `:hour`) to an exact `java.time.Duration`."
  ^Duration [age unit]
  (Duration/of age (case unit
                     :minute ChronoUnit/MINUTES
                     :second ChronoUnit/SECONDS
                     :hour   ChronoUnit/HOURS)))

(defn detection-latency-ms
  "Milliseconds elapsed past `(reference-ts + timeout-duration)` at the time of detection. Clamped at zero."
  [^OffsetDateTime reference-ts ^Duration timeout-duration ^Instant detected-at]
  (max 0 (.toMillis (.minus (Duration/between (.toInstant reference-ts) detected-at)
                            timeout-duration))))

(defn heartbeat-ids!
  "Stamp `heartbeat-column = now` on the active rows of `model` named by `ids`; `active` guards the update
  so finished rows are skipped. No-op on empty `ids`."
  [model active heartbeat-column ids]
  (when (seq ids)
    (apply t2/update! model :id [:in ids] (concat active [{heartbeat-column :%now}]))))

(defn reap-rows!
  "Atomically transition the active rows of `model` whose `stale-column` predates `(now - age unit)` into
  the `terminal` state, returning the pre-update rows. Uses `SELECT … FOR UPDATE` + `UPDATE` in one
  transaction so the returned rows are exactly those transitioned.

  Options: `:model`, `:active` (kv-vector guarding the SELECT/UPDATE), `:stale-column` (timestamp compared
  to the cutoff), `:terminal` (map merged into the UPDATE), `:age`/`:unit` (staleness cutoff), and optional
  `:also-stale` (extra predicate OR'd with the cutoff check)."
  [{:keys [model active stale-column terminal age unit also-stale]}]
  (let [cutoff-form (cutoff age unit)
        stale       (if also-stale
                      [:or [:< stale-column cutoff-form] also-stale]
                      [:< stale-column cutoff-form])]
    (t2/with-transaction [_conn]
      (when-let [rows (not-empty (apply t2/select model (concat active [{:where stale :for :update}])))]
        (apply t2/update! model :id [:in (mapv :id rows)] (concat active [terminal]))
        rows))))
