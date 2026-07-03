(ns metabase.transforms.dag
  "Manual DAG-reprocess runs: reprocessing the transitive dependency DAG rooted at a single seed
  transform, upstream or downstream. This reuses the generic multi-transform coordinator in
  [[metabase.transforms.jobs]] (which honors the DAG, lanes, cancelation and timeouts) but tracks
  progress in its own `transform_dag_run` table rather than `transform_job_run`, and links member
  transform runs via `transform_run.dag_run_id`."
  (:require
   [clojure.set :as set]
   [metabase.run-tracking.core :as rt]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.transforms-base.ordering :as ordering]
   [metabase.transforms.canceling :as canceling]
   [metabase.transforms.jobs :as jobs]
   [metabase.transforms.models.dag-run :as dag-run]
   [metabase.transforms.models.transform-run-cancelation :as transform-run-cancelation]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private dag-heartbeat-stale-minutes
  "A DAG run whose coordinator hasn't heartbeat in this many minutes is presumed dead and reaped."
  5)

(defonce ^:private dag-active-runs
  ;; dag-run-id -> promise, delivered once the run is found terminated externally (e.g. reaped) so
  ;; its coordinator aborts. Separate from the job-run atom in [[metabase.transforms.jobs]] because
  ;; the two id spaces (transform_dag_run vs transform_job_run) are independent.
  (atom {}))

;;; ------------------------------------------- Planning -------------------------------------------

(defn- dependents-graph
  "Reverse a forward dependency map (id -> #{deps it reads}) into a dependents map
  (id -> #{transforms that read it})."
  [forward-deps]
  (reduce-kv (fn [acc id deps]
               (reduce #(update %1 %2 (fnil conj #{}) id) acc deps))
             {} forward-deps))

(defn- reachable
  "Set of nodes reachable from `start` in `graph` (id -> #{neighbor-ids}), including `start`."
  [graph start]
  (loop [queue [start] seen #{}]
    (if-let [node (first queue)]
      (if (seen node)
        (recur (rest queue) seen)
        (recur (into (rest queue) (get graph node)) (conj seen node)))
      seen)))

(defn- lean-transforms
  "Transforms with only the columns the ordering walk needs — avoids loading every transform's full
  row just to compute the dependency graph (full rows are fetched only for the resulting closure)."
  []
  (t2/select [:model/Transform :id :target :target_table_id :created_at :table_dependencies]))

(defn- full-transforms [ids]
  (if (seq ids)
    (t2/select :model/Transform :id [:in ids])
    []))

(defn- dag-run-plan
  "Compute both the set of transform-ids a DAG reprocess should run and the execution plan to run
  them. Returns `{:transform-ids #{...} :plan {:order [...] :deps {...}}}`.

  `:upstream`   — seed + all transforms the seed transitively depends on. This is exactly the closure
                  `transform-ordering` walks from the seed, so the walk's `:dependencies` map is both
                  the id set (its keys) and the plan input. The whole closure runs.
  `:downstream` — seed + all transforms that transitively depend on the seed. The ordering code only
                  walks toward dependencies, so we build the full forward graph once and reverse it to
                  find dependents. Only the downstream set runs — the dependents' *other* upstream
                  inputs are already-materialized tables and must NOT be reprocessed, so we keep only
                  the dependency edges that stay within the downstream set. Dropping the external edges
                  preserves ordering (the seed still runs before anything that depends on it) while
                  leaving those inputs untouched."
  [seed-id direction]
  (let [lean (lean-transforms)]
    (case direction
      :upstream
      (let [{:keys [dependencies uncached]} (ordering/transform-ordering #{seed-id} lean)
            ids                              (set (keys dependencies))]
        (ordering/persist-table-dependencies! uncached)
        {:transform-ids ids
         :plan          (jobs/dependencies->plan dependencies (full-transforms ids))})

      :downstream
      (let [{:keys [dependencies uncached]} (ordering/transform-ordering (into #{} (map :id) lean) lean)
            _                                (ordering/persist-table-dependencies! uncached)
            downstream-ids                   (reachable (dependents-graph dependencies) seed-id)
            deps                             (into {}
                                                   (map (fn [id]
                                                          [id (set/intersection (get dependencies id #{}) downstream-ids)]))
                                                   downstream-ids)]
        {:transform-ids downstream-ids
         :plan          (jobs/dependencies->plan deps (full-transforms downstream-ids))}))))

(defn dag-run-transforms
  "Return the transforms a DAG reprocess from `transform-id` would run, in planned execution order.
  Used to preview the run in a confirmation dialog before committing to it. `direction` is as in
  [[run-dag!]]."
  [transform-id direction]
  (-> (dag-run-plan transform-id direction) :plan :order vec))

;;; ------------------------------------------- Execution -------------------------------------------

(defn run-dag!
  "Run all transforms in the dependency DAG rooted at `transform-id`, tracking progress in a
  `transform_dag_run` row. Blocks until the run finishes; runs are always manual.

  `direction` selects which transforms are included:
  - `:upstream`   — the seed plus all transforms it transitively depends on
  - `:downstream` — the seed plus all transforms that transitively depend on it

  `:start-promise`, if provided, is delivered `[:started dag-run-id]` once the run row is created (so
  a caller can respond with the id without waiting for the run to finish), `nil` if nothing was run
  (already running / empty closure), or a Throwable on a pre-start failure. Returns the dag-run-id,
  or nil if nothing was executed."
  [transform-id {:keys [direction user-id skip-fresh-deps? start-promise]
                 :or   {skip-fresh-deps? false}}]
  (try
    (if (dag-run/running-run-for-source-transform-id transform-id)
      (do (log/info "Not executing DAG run for transform" (pr-str transform-id) "because one is already running")
          (when start-promise (deliver start-promise nil))
          nil)
      (let [{:keys [transform-ids plan]} (dag-run-plan transform-id direction)]
        (if (empty? transform-ids)
          (do (log/info "Skipping DAG run for transform" (pr-str transform-id) "because no transforms found in closure")
              (when start-promise (deliver start-promise nil))
              nil)
          (let [{run-id :id} (dag-run/start-dag-run! transform-id direction user-id)]
            (when start-promise (deliver start-promise [:started run-id]))
            (tracing/with-span :tasks "task.transform.run-dag" {:transform/id        transform-id
                                                                :transform/direction (name direction)
                                                                :transform/count     (count transform-ids)}
              (try
                (let [result (jobs/run-transforms! run-id transform-ids
                                                   {:run-method        :manual
                                                    :user-id           user-id
                                                    :skip-fresh-deps?  skip-fresh-deps?
                                                    :parent-run-type   :dag
                                                    :active-runs-atom  dag-active-runs
                                                    :precomputed-plan  plan
                                                    :add-run-activity! #(dag-run/add-run-activity! run-id)})]
                  (case (::jobs/status result)
                    :succeeded (dag-run/succeed-started-run! run-id)
                    ;; terminated externally (e.g. reaped): the row is already terminal, just log
                    :aborted   (log/warnf "DAG run %s for transform %s was terminated externally; coordinator aborted."
                                          (pr-str run-id) (pr-str transform-id))
                    :failed    (try
                                 (dag-run/fail-started-run! run-id
                                                            {:message (jobs/compile-transform-failure-messages
                                                                       (::jobs/failures result))})
                                 (catch Exception e
                                   (log/error e "Error when failing a DAG run.")))))
                (catch Throwable t
                  (try
                    (dag-run/fail-started-run! run-id {:message (ex-message t)})
                    (catch Exception e
                      (log/error e "Error when failing a DAG run.")))
                  (throw t))))
            run-id))))
    (catch Throwable t
      ;; a pre-start failure (before the row was created) — unblock any caller waiting on the promise
      (when (and start-promise (not (realized? start-promise)))
        (deliver start-promise t))
      (throw t))))

(defn cancel-dag-run!
  "Cancel an in-progress DAG run. Marks the coordinating run canceled (so its coordinator stops
  dispatching once it observes the run is no longer active) and requests cancellation of each
  still-running member transform run — signalling the in-process cancel channel for promptness and
  recording a cancelation row so the cancel-runs task finalizes it cluster-wide. Returns true if the
  run was active and is now canceled, false if it had already finished."
  [run-id]
  (boolean
   (when (pos? (dag-run/cancel-started-run! run-id))
     (doseq [member-run-id (dag-run/active-transform-run-ids-for-dag-run run-id)]
       (transform-run-cancelation/mark-cancel-started-run! member-run-id)
       (canceling/chan-signal-cancel! member-run-id))
     true)))

;;; ------------------------------------------- Heartbeat / reaping -------------------------------------------

(defn- heartbeat-and-reconcile-runs!
  "Stamp a heartbeat on every active DAG run this process is coordinating, then deliver the `gone`
  promise of any that were terminated externally so their coordinator aborts."
  []
  (rt/heartbeat-and-reconcile! {:model      :model/TransformDagRun
                                :active     [:= :is_active true]
                                :ids        (keys @dag-active-runs)
                                :heartbeat! dag-run/heartbeat-runs!
                                :on-gone    (fn [run-id]
                                              (some-> (get @dag-active-runs run-id) (deliver true)))}))

(defn- reap-orphaned-runs!
  "Reap DAG runs whose coordinator process died (stale heartbeat)."
  []
  (dag-run/reap-orphaned-runs! dag-heartbeat-stale-minutes))

(defmethod task/init! ::TransformDagRunHeartbeat [_]
  (rt/start-heartbeat! heartbeat-and-reconcile-runs! 1))

(defmethod task/init! ::TransformDagRunReaper [_]
  (rt/schedule-reaper! {:job-key "metabase.transforms.dag.reaper-job"
                        :label   "transform DAG run"
                        :reap-fn #'reap-orphaned-runs!}))
