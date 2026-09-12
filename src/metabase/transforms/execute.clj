(ns metabase.transforms.execute
  (:require
   [metabase.indexes.models.table-index :as table-index]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.interface :as transforms.i]
   ;; load the `transforms.i/execute!` `:query` method
   [metabase.transforms.query-impl]
   [metabase.util :as u]
   [metabase.workspaces.core :as workspaces]))

(set! *warn-on-reflection* true)

(defn- resolve-target
  "Redirects the target to its workspace table when workspaces are enabled (otherwise unmaps it, since the run
  writes the canonical table again), forcing a full run the first time an incremental transform lands in the
  workspace.
  Runs before `transforms.i/execute!` dispatches so every transform type writes to the same place. Hydrates the
  declared indexes
  and their request ids onto the target so the base reads them off `(:indexes target)` and
  `(:index-request-ids target)` at every table-creation seam, and stashes `:full-incremental-run?` so that
  (DB-backed) decision is made once and stays stable for the whole run."
  [transform]
  (let [requests  (table-index/select-applicable-for-transform (:id transform))
        remapped  (if-let [db-id (transforms-base.i/target-db-id transform)]
                    (let [{:keys [schema name]} (:target transform)]
                      (if (workspaces/enabled?)
                        (let [{:keys [schema name]} (workspaces/remap-table! db-id schema name)]
                          (update transform :target assoc :schema schema :name name))
                        (do (workspaces/unmap-table! db-id schema name)
                            transform)))
                    transform)
        full-run? (or (transforms-base.u/full-incremental-run? remapped)
                      (and (transforms-base.u/incremental-target? remapped)
                           (not= (:target remapped) (:target transform))
                           (not (transforms-base.u/target-table-exists? remapped))))]
    (-> remapped
        (assoc-in [:target :indexes] (mapv :structured requests))
        (assoc-in [:target :index-request-ids] (into [] (keep :id) requests))
        (assoc :full-incremental-run? full-run?))))

(defn- discard-unused-remapping!
  "After a failed run, unmap the target if its workspace table was never created, so the canonical table is not
  redirected to a table that does not exist."
  [transform resolved]
  (when-let [db-id (transforms-base.i/target-db-id transform)]
    ;; compare only the table's location: `resolve-target` also hangs indexes off the target, so comparing the
    ;; whole map would be true even for a run that was never remapped
    (when (and (not= (select-keys (:target resolved) [:schema :name])
                     (select-keys (:target transform) [:schema :name]))
               ;; not `false?`: a probe that throws tells us nothing, and leaving the remapping would point the
               ;; canonical table at a workspace table that may never have been created
               (not (true? (u/ignore-exceptions (transforms-base.u/target-table-exists? resolved)))))
      (let [{:keys [schema name]} (:target transform)]
        (workspaces/unmap-table! db-id schema name)))))

(defn execute!
  "Run `transform` and sync its target table.

  Executes synchronously, but the start is observable: once the run row is booked in the database,
  `:on-start` is called with the transform run id and `:start-promise` (if any) is delivered
  `[:started run-id]`. A throw before that point delivers the throwable to the promise instead, so
  callers awaiting the start never hang."
  ([transform]
   (execute! transform nil))
  ([transform {:keys [start-promise on-start] :as opts}]
   (let [opts (merge opts
                     {:on-start (fn [run-id]
                                  (when start-promise
                                    (deliver start-promise [:started run-id]))
                                  (when on-start
                                    (on-start run-id)))})]
     (try
       ;; inside the `try` because resolving the target can throw -- a database with workspaces on but no
       ;; workspace schema, say -- and a caller awaiting the start would otherwise hang forever
       (let [resolved (resolve-target transform)]
         (try
           (transforms.i/execute! resolved opts)
           (catch Throwable t
             (discard-unused-remapping! transform resolved)
             (throw t))))
       (catch Throwable t
         ;; so a caller awaiting the start isn't left hanging on a pre-start failure;
         ;; a no-op when the run had already started and the promise was delivered
         (when start-promise (deliver start-promise t))
         (throw t))))))
