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

(defn- remap-target
  "Redirect `transform`'s target to its workspace table when workspaces are enabled, else unmap it; an incremental
  transform whose target just moved back out of the workspace runs in full."
  [transform]
  (if-let [db-id (transforms-base.i/target-db-id transform)]
    (let [{:keys [schema name]} (:target transform)]
      (if (workspaces/enabled?)
        (let [{:keys [schema name]} (workspaces/remap-table! db-id schema name)]
          (update transform :target assoc :schema schema :name name))
        (cond-> transform
          (and (workspaces/unmap-table! db-id schema name)
               (transforms-base.u/incremental-target? transform))
          (assoc :full-incremental-run? true))))
    transform))

(defn delete-target-table!
  "Drop `transform`'s output table and deactivate its Table, the workspace table standing in for it included."
  [{:keys [target] :as transform}]
  (when-let [db-id (transforms-base.i/target-db-id transform)]
    (let [{:keys [schema name]} target
          workspace (workspaces/workspace-table db-id schema name)]
      (when (not= (select-keys workspace [:schema :name]) (select-keys target [:schema :name]))
        (transforms-base.u/delete-target-table! (update transform :target merge workspace))
        (workspaces/unmap-table! db-id schema name))))
  (transforms-base.u/delete-target-table! transform))

(defn- resolve-target
  "Hydrate the declared indexes onto `remapped`'s target and decide `:full-incremental-run?` once for the run: an
  incremental transform runs in full the first time it lands in the workspace."
  [transform remapped]
  (let [requests  (table-index/select-applicable-for-transform (:id transform))
        full-run? (or (transforms-base.u/full-incremental-run? remapped)
                      (and (transforms-base.u/incremental-target? remapped)
                           (not= (:target remapped) (:target transform))
                           (not (transforms-base.u/target-table-exists? remapped))))]
    (-> remapped
        (assoc-in [:target :indexes] (mapv :structured requests))
        (assoc-in [:target :index-request-ids] (into [] (keep :id) requests))
        (assoc :full-incremental-run? full-run?))))

(defn- discard-unused-remapping!
  "Unmap `transform`'s target when `remapped` points it at a workspace table that does not exist."
  [transform remapped]
  (when-let [db-id (transforms-base.i/target-db-id transform)]
    (when (and (not= (:target remapped) (:target transform))
               (not (true? (u/ignore-exceptions (transforms-base.u/target-table-exists? remapped)))))
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
       (let [remapped (remap-target transform)]
         (try
           (transforms.i/execute! (resolve-target transform remapped) opts)
           (catch Throwable t
             (discard-unused-remapping! transform remapped)
             (throw t))))
       (catch Throwable t
         ;; so a caller awaiting the start isn't left hanging on a pre-start failure;
         ;; a no-op when the run had already started and the promise was delivered
         (when start-promise (deliver start-promise t))
         (throw t))))))
