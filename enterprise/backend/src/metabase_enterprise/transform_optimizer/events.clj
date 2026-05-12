(ns metabase-enterprise.transform-optimizer.events
  "Event-driven post-materialization DDL replay.

  When a transform runs, the source-DB-targeting indices the optimizer
  proposed are durable — they're on tables we don't touch. But indices on
  the transform's *target* table get dropped every run because the
  transform pipeline recreates the table. To make optimizer-proposed
  indices survive subsequent runs, we persist them on the transform's
  `:target.post_run_ddl` JSON field at accept time and re-execute them
  whenever the transform completes.

  This module subscribes to `:event/transform-run-complete` (published by
  `transforms-base.util/complete-execution!`), looks up the transform's
  `:target.post_run_ddl`, and runs each statement on a fresh autocommit
  connection. Failures are logged but never fail the transform run
  itself — `CREATE INDEX IF NOT EXISTS` is idempotent so the user can
  re-trigger by running the transform again."
  (:require
   [metabase-enterprise.transform-optimizer.ddl.execute :as ddl.execute]
   [metabase.events.core :as events]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(derive ::transform-optimizer-post-run :metabase/event)
(derive :event/transform-run-complete ::transform-optimizer-post-run)

(defn- run-post-run-ddl!
  "Look up the transform's persisted DDL list and execute each statement
  against the target DB. Returns a vector of `{statement, status, …}`
  maps suitable for logging."
  [transform-id db-id]
  (let [transform (when transform-id
                    (t2/select-one [:model/Transform :id :target] :id transform-id))
        ddls      (some-> transform :target :post_run_ddl seq)
        database  (when db-id (t2/select-one :model/Database :id db-id))
        driver-kw (some-> database :engine keyword)]
    (when ddls
      (log/infof "transform-optimizer: replaying %d post-run DDL statements for transform %s"
                 (count ddls) transform-id)
      (mapv (fn [{:keys [statement] :as d}]
              (let [result (cond
                             (not (string? statement))
                             {:status :skipped :error-message "missing statement string"}

                             :else
                             (ddl.execute/execute! driver-kw database statement))]
                (when (= :failed (:status result))
                  (log/warnf "transform-optimizer: post-run DDL failed for transform %s: %s — %s"
                             transform-id statement (:error-message result)))
                (merge d result)))
            ddls))))

(methodical/defmethod events/publish-event! ::transform-optimizer-post-run
  [_topic {{:keys [transform-id db-id]} :object}]
  (try
    (run-post-run-ddl! transform-id db-id)
    (catch Exception e
      ;; The transform run already succeeded; failing the event handler
      ;; would falsely mark it as failed. Log loudly and move on.
      (log/error e "transform-optimizer: post-run DDL handler errored — transform run unaffected"
                 {:transform-id transform-id :db-id db-id}))))
