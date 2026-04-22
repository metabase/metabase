(ns metabase-enterprise.workspaces.remapping-poll
  "Periodic poller that reconciles the per-workspace warehouse ledger (`_mb_remappings`
   inside each workspace schema) into the app-db `table_remapping` cache.

   Append-only semantics: we only *add* rows to the app-db. Rows present in the app-db
   but missing from a warehouse ledger are left alone — remappings are never deleted
   in this deployment model. This also means the poll is resilient to a transient
   warehouse outage (we don't accidentally purge the cache when we can't read the
   ledger).

   Error handling: per-database errors are logged and swallowed so one broken database
   can't starve the others. Errors inside a database's ledger-read are also swallowed
   (treated as empty) by `remapping-ledger/read-ledger!` when the cause is an
   undefined-table state.

   The write path is `add-schema+table-mapping!`, which throws on duplicate key — so
   we diff first and only insert rows that aren't already in the app-db. That keeps
   the poller idempotent and spares us from sprinkling try/catches around every insert."
  (:require
   [metabase-enterprise.workspaces.core :as ws]
   [metabase-enterprise.workspaces.remapping-ledger :as ledger]
   [metabase-enterprise.workspaces.table-remapping :as ws.table-remapping]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- missing-mappings
  "Given the ledger rows for a DB and the set of `[from-schema from-table-name]` pairs
   already present in the app-db, return the ledger rows that haven't been cached yet.

   Takes maps with keys `:from_schema :from_table_name :to_table_name`; returns a
   seq of the same shape."
  [ledger-rows already-cached]
  (remove (fn [{from-schema :from_schema from-table-name :from_table_name}]
            (contains? already-cached [from-schema from-table-name]))
          ledger-rows))

(defn- sync-db-ledger!
  "Read one database's ledger, diff against the app-db cache, insert the missing rows.
   Workspace schema is looked up from the workspace config — caller ensures the db-id
   is workspaced.

   Isolated from `poll-once!` so per-DB failures can be caught at the right granularity."
  [db-id workspace-schema]
  (let [conn-spec  (sql-jdbc.conn/db->pooled-connection-spec db-id)
        ledger-rows (ledger/read-ledger! conn-spec workspace-schema)]
    (if (seq ledger-rows)
      (let [cached  (set (keys (ws.table-remapping/all-mappings-for-db db-id)))
            missing (missing-mappings ledger-rows cached)]
        (doseq [{from-schema     :from_schema
                 from-table-name :from_table_name
                 to-table-name   :to_table_name} missing]
          (ws.table-remapping/add-schema+table-mapping!
           db-id
           [from-schema from-table-name]
           [workspace-schema to-table-name]))
        (when (seq missing)
          (log/infof "remapping-poll: cached %d new remapping(s) for db-id=%s from ledger %s._mb_remappings"
                     (count missing) db-id workspace-schema))
        {:db-id db-id :synced (count missing)})
      {:db-id db-id :synced 0})))

(defn poll-once!
  "Iterate every workspaced database, read its ledger, and upsert missing rows into the
   app-db. No-op when workspaces are not active.

   Returns a seq of per-DB result maps (`{:db-id :synced :error?}`). Errors inside a
   single DB are logged and the poll continues; only a top-level failure (e.g. corrupt
   workspace config) aborts the whole tick."
  []
  (when (ws/active?)
    (mapv (fn [[db-id {output-schema :output_schema}]]
            (try
              (sync-db-ledger! db-id output-schema)
              (catch Throwable t
                (log/warnf t "remapping-poll: failed to sync ledger for db-id=%s schema=%s"
                           db-id output-schema)
                {:db-id db-id :synced 0 :error? true})))
          (get (ws/get-config) :databases {}))))
