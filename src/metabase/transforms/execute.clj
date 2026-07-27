(ns metabase.transforms.execute
  (:require
   [metabase.indexes.models.table-index :as table-index]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.interface :as transforms.i]
   [metabase.transforms.query-impl :as transforms.query-impl]))

(set! *warn-on-reflection* true)

(defn- resolve-target
  "Apply the workspace target-rewrite hook before dispatch. On a workspaced child
  instance for `(:database target)`, the hook rewrites `:schema` to the workspace
  output schema and records a TableRemapping for the canonical (schema, name).
  Off-workspace and OSS: no-op pass-through.

  Lives at the dispatch wrapper so every transform type (`:query`, `:python`, and
  any future kind registered via `transforms.i/execute!`) inherits the gate. The
  hook must run before per-type execution begins, since callees consume
  `(:target transform)` to decide where to write.

  When `target-db-id` returns nil (no per-type impl, or transform shape doesn't
  identify a target DB), the hook is skipped — workspace rewriting requires a
  known DB id to look up `db-workspace-namespace`.

  Also hydrates the declared indexes and their request ids onto the target so the base reads them off
  `(:indexes target)` and `(:index-request-ids target)` at every table-creation seam, and stashes
  `:full-incremental-run?` so that (DB-backed) decision is made once and stays stable for the whole run."
  [transform]
  (let [requests (table-index/select-applicable-for-transform (:id transform))]
    (-> (if-let [db-id (transforms-base.i/target-db-id transform)]
          (assoc transform :target
                 (transforms.query-impl/resolve-transform-target db-id (:target transform)))
          transform)
        (assoc-in [:target :indexes] (mapv :structured requests))
        (assoc-in [:target :index-request-ids] (into [] (keep :id) requests))
        (assoc :full-incremental-run? (transforms-base.u/full-incremental-run? transform)))))

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
       (transforms.i/execute! (resolve-target transform) opts)
       (catch Throwable t
         ;; so a caller awaiting the start isn't left hanging on a pre-start failure;
         ;; a no-op when the run had already started and the promise was delivered
         (when start-promise (deliver start-promise t))
         (throw t))))))
