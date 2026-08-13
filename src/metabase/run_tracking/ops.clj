(ns metabase.run-tracking.ops
  "Data operations for run-tracking heartbeats and orphan reaping."
  (:require
   [metabase.analytics-interface.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(set! *warn-on-reflection* true)

(defn cutoff
  "Honeysql form for `(now - age unit)` in the app-db dialect."
  [age unit]
  (h2x/add-interval-honeysql-form (mdb/db-type) :%now (- age) unit))

(defn unit->ms
  "Convert `age` of `unit` (`:second`, `:minute`, or `:hour`) to milliseconds."
  [age unit]
  (* age (case unit
           :second 1000
           :minute 60000
           :hour   3600000)))

(defn detection-latency-ms
  "Milliseconds elapsed past `(reference-ts + timeout-ms)` at `detected-at-ms` (epoch millis).
  Clamped at zero."
  [^OffsetDateTime reference-ts timeout-ms detected-at-ms]
  (max 0 (- detected-at-ms (inst-ms (.toInstant reference-ts)) timeout-ms)))

(defn heartbeat-ids!
  "Stamp `heartbeat-column = now` on the `active` rows of `model` in `ids`; no-op on empty `ids`.
  `active` is a HoneySQL predicate, e.g. `[:= :is_active true]`."
  [model active heartbeat-column ids]
  (when (seq ids)
    (t2/query {:update (t2/table-name model)
               :set    {heartbeat-column :%now}
               :where  [:and active [:in :id ids]]})))

(defn heartbeat-and-reconcile!
  "Per-node tick for the runs this process owns: call `(heartbeat! ids)`, then `(on-gone id)` for
  each id whose row no longer matches `active` (a HoneySQL predicate, e.g. `[:= :is_active true]`).

  `on-gone` runs on the shared heartbeat thread and must not block: a slow callback delays
  heartbeats for every run on this node, leaving them to be reaped as stale."
  [{:keys [model active ids heartbeat! on-gone]}]
  (when-let [ids (seq ids)]
    (heartbeat! ids)
    (let [active-ids (t2/select-fn-set :id model {:where [:and [:in :id ids] active]})]
      (doseq [id ids
              :when (not (contains? active-ids id))]
        (on-gone id)))))

(defn reap-rows!
  "Atomically move the `active` rows of `model` matching the `stale` honeysql predicate into
  `terminal`, returning the pre-update rows. `SELECT … FOR UPDATE` + `UPDATE` in one transaction,
  so the returned rows are exactly those transitioned.
  `active` is a HoneySQL predicate, e.g. `[:= :is_active true]`."
  [{:keys [model active stale terminal]}]
  (t2/with-transaction [_conn]
    (when-let [rows (not-empty (t2/select model {:where [:and active stale] :for :update}))]
      (t2/query {:update (t2/table-name model)
                 :set    terminal
                 :where  [:and active [:in :id (mapv :id rows)]]})
      rows)))

(defn reap-orphaned!
  "Like [[reap-rows!]] — reap the `active` rows of `model` matching the `stale` predicate into
  `terminal` — but also emit timeout analytics. Returns the reaped rows.

  `:metrics` (optional) holds the analytics inputs:
  - `:total-metric` (+ `:tags`) — counter incremented by the number of rows reaped.
  - `:latency-metric` (+ `:latency-column`, `:timeout-ms`) — per row, observes how long past
    `(row's :latency-column + :timeout-ms)` the reap was detected (see [[detection-latency-ms]])."
  [{:keys [model active terminal stale]
    {:keys [total-metric latency-metric tags latency-column timeout-ms]} :metrics}]
  (let [detected-at-ms (System/currentTimeMillis)
        reaped         (reap-rows! {:model model :active active :terminal terminal :stale stale})]
    (when (seq reaped)
      (when total-metric
        (analytics/inc! total-metric tags (count reaped)))
      (when latency-metric
        (doseq [row  reaped
                :let [ts (get row latency-column)]
                :when ts]
          (analytics/observe! latency-metric tags
                              (detection-latency-ms ts timeout-ms detected-at-ms)))))
    reaped))
