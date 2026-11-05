(ns metabase.transforms.execute
  (:require
   [metabase.indexes.models.table-index :as table-index]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.schema :as transforms-base.schema]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.interface :as transforms.i]
   ;; load the `transforms.i/execute!` `:query` method
   [metabase.transforms.query-impl]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.workspaces.core :as ws]))

(set! *warn-on-reflection* true)

(mu/defn- resolve-target :- ::transforms-base.schema/transform
  "Moves the target to where this instance writes it: on a workspace sidecar, the scratch namespace mapped to its
  schema (see [[ws/resolve-transform-target]]). Every transform type runs through here, and everything after reads
  the target from the transform, so this is the one place that decides where a transform writes.

  Also hydrates the declared indexes and their request ids onto the target so the base reads them off
  `(:indexes target)` and `(:index-request-ids target)` at every table-creation seam, and stashes
  `:full-incremental-run?` so that (DB-backed) decision is made once and stays stable for the whole run."
  [transform :- ::transforms.schema/transform]
  (let [requests (table-index/select-applicable-for-transform (:id transform))
        db-id    (transforms-base.i/target-db-id transform)
        resolved (cond-> transform
                   db-id (update :target #(ws/resolve-transform-target db-id %)))
        ;; An incremental run appends to its target. When the workspace moved the target, that table can be missing
        ;; though the watermark survives (a new scratch namespace, a dropped scratch table): start over with a full run.
        moved?   (not= (:target resolved) (:target transform))]
    (-> resolved
        (assoc-in [:target :indexes] (mapv :structured requests))
        (assoc-in [:target :index-request-ids] (into [] (keep :id) requests))
        (assoc :full-incremental-run? (or (transforms-base.u/full-incremental-run? transform)
                                          (and moved?
                                               (transforms-base.u/incremental-target? resolved)
                                               (not (transforms-base.u/target-table-exists? resolved))))))))

(mu/defn execute! :- :nil
  "Run `transform` and sync its target table.

  Executes synchronously, but the start is observable: once the run row is booked in the database,
  `:on-start` is called with the transform run id and `:start-promise` (if any) is delivered
  `[:started run-id]`. A throw before that point delivers the throwable to the promise instead, so
  callers awaiting the start never hang."
  ([transform :- ::transforms.schema/transform]
   (execute! transform nil))
  ([transform :- ::transforms.schema/transform
    {:keys [start-promise on-start] :as opts} :- [:maybe ::transforms.schema/execute-options]]
   (let [opts (merge opts
                     {:on-start (fn [run-id]
                                  (when start-promise
                                    (deliver start-promise [:started run-id]))
                                  (when on-start
                                    (on-start run-id)))})]
     (try
       ;; the executors log their own failures at ERROR; this one happens before any executor runs
       (transforms.i/execute! (try (resolve-target transform)
                                   (catch Throwable t
                                     (log/errorf "Could not resolve the target of transform %s: %s"
                                                 (pr-str (:id transform)) (ex-message t))
                                     (throw t)))
                              opts)
       (catch Throwable t
         ;; so a caller awaiting the start isn't left hanging on a pre-start failure;
         ;; a no-op when the run had already started and the promise was delivered
         (when start-promise (deliver start-promise t))
         (throw t)))
     nil)))
