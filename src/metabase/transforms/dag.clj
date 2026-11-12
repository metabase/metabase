(ns metabase.transforms.dag
  "Manual DAG-reprocess runs: reprocessing the transitive dependency DAG rooted at a single seed
  transform, upstream or downstream. This reuses the generic multi-transform coordinator in
  [[metabase.transforms.jobs]] (which honors the DAG, lanes, cancelation and timeouts) but tracks
  progress in its own `transform_dag_run` table rather than `transform_job_run`, and links member
  transform runs via `transform_run.dag_run_id`."
  (:require
   [clojure.set :as set]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.run-tracking.core :as rt]
   [metabase.task.core :as task]
   [metabase.tracing.core :as tracing]
   [metabase.transforms-base.ordering :as ordering]
   [metabase.transforms.coordinated-run :as coordinated-run]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.jobs :as jobs]
   [metabase.transforms.models.dag-run :as dag-run]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private dag-heartbeat-stale-minutes
  "A DAG run whose coordinator hasn't heartbeat in this many minutes is presumed dead and reaped."
  5)

(mr/def ::direction
  "Which transforms a DAG reprocess includes relative to its seed."
  [:enum :upstream :downstream])

(mr/def ::graph
  "A graph of transform IDs to the IDs of their neighbors."
  [:map-of ::lib.schema.id/transform [:set ::lib.schema.id/transform]])

(defonce ^:private dag-active-runs
  ;; dag-run-id -> promise, delivered once the run is found terminated externally (e.g. reaped) so
  ;; its coordinator aborts. Separate from the job-run atom in [[metabase.transforms.jobs]] because
  ;; the two id spaces (transform_dag_run vs transform_job_run) are independent.
  (atom {}))

;;; ------------------------------------------- Planning -------------------------------------------

(mu/defn- dependents-graph :- ::graph
  "Reverse a forward dependency map (id -> #{deps it reads}) into a dependents map
  (id -> #{transforms that read it})."
  [forward-deps :- ::graph]
  (reduce-kv (fn [acc id deps]
               (reduce #(update %1 %2 (fnil conj #{}) id) acc deps))
             {} forward-deps))

(mu/defn- reachable :- [:set ::lib.schema.id/transform]
  "Set of nodes reachable from `start` in `graph` (id -> #{neighbor-ids}), including `start`."
  [graph :- ::graph
   start :- ::lib.schema.id/transform]
  (loop [queue [start] seen #{}]
    (if-let [node (first queue)]
      (if (seen node)
        (recur (rest queue) seen)
        (recur (into (rest queue) (get graph node)) (conj seen node)))
      seen)))

(mu/defn- lean-transforms :- [:sequential ::transforms.schema/transform]
  "Transforms with only the columns the ordering walk needs — avoids loading every transform's full
  row just to compute the dependency graph (full rows are fetched only for the resulting closure)."
  []
  (transforms.db/transform-dependency-rows))

(mu/defn- full-transforms :- [:sequential ::transforms.schema/transform]
  [ids :- [:set ::lib.schema.id/transform]]
  (if (seq ids)
    (transforms.db/transforms ids)
    []))

(mu/defn- dag-run-plan :- [:map {:closed true}
                           [:transform-ids [:set ::lib.schema.id/transform]]
                           [:plan          ::transforms.schema/transform-plan]]
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
  [seed-id   :- ::lib.schema.id/transform
   direction :- ::direction]
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

(mu/defn dag-run-transforms :- [:sequential ::transforms.schema/transform]
  "Return the transforms a DAG reprocess from `transform-id` would run, in planned execution order.
  `direction` is as in [[run-dag!]]."
  [transform-id :- ::lib.schema.id/transform
   direction    :- ::direction]
  (-> (dag-run-plan transform-id direction) :plan :order vec))

;;; ------------------------------------------- Execution -------------------------------------------

(mu/defn- start-dag-run-unless-racing! :- [:maybe ::transforms.schema/transform-dag-run]
  "Insert the DAG run row, or return nil if a concurrent trigger for the same seed transform won
  the `(source_transform_id, is_active)` uniqueness race."
  [transform-id     :- ::lib.schema.id/transform
   direction        :- ::direction
   user-id          :- [:maybe ::lib.schema.id/user]
   transform-count  :- :int]
  (try
    (dag-run/start-dag-run! transform-id direction user-id transform-count)
    (catch Exception e
      (when-not (transforms.u/duplicate-key-violation? e)
        (throw e)))))

(mu/defn run-dag! :- [:maybe ms/PositiveInt]
  "Run all transforms in the dependency DAG rooted at `transform-id`, tracking progress in a
  `transform_dag_run` row. Blocks until the run finishes; runs are always manual.

  `direction` selects which transforms are included:
  - `:upstream`   — the seed plus all transforms it transitively depends on
  - `:downstream` — the seed plus all transforms that transitively depend on it

  `:start-promise`, if provided, is delivered `[:started dag-run-id]` once the run row is created,
  `nil` if nothing was run (already running / empty closure), or a Throwable on a pre-start failure.
  Returns the dag-run-id, or nil if nothing was executed."
  [transform-id :- ::lib.schema.id/transform
   {:keys [direction user-id start-promise]} :- [:map {:closed true}
                                                 [:direction                       ::direction]
                                                 [:user-id                         {:optional true} [:maybe ::lib.schema.id/user]]
                                                 [:start-promise {:optional true} [:maybe ::transforms.schema/promise]]]]
  (try
    (if (dag-run/running-run-for-source-transform-id transform-id)
      (do (log/info "Not executing DAG run for transform" (pr-str transform-id) "because one is already running")
          (some-> start-promise (deliver nil))
          nil)
      (let [{:keys [transform-ids plan]} (dag-run-plan transform-id direction)]
        (if (empty? transform-ids)
          (do (log/info "Skipping DAG run for transform" (pr-str transform-id) "because no transforms found in closure")
              (some-> start-promise (deliver nil))
              nil)
          (if-let [{run-id :id} (start-dag-run-unless-racing! transform-id direction user-id
                                                              (count transform-ids))]
            (do (some-> start-promise (deliver [:started run-id]))
                (tracing/with-span :tasks "task.transform.run-dag" {:transform/id        transform-id
                                                                    :transform/direction (name direction)
                                                                    :transform/count     (count transform-ids)}
                  (jobs/execute-coordinated-run! :model/TransformDagRun run-id transform-ids plan
                                                 (format "DAG run for transform %s" (pr-str transform-id))
                                                 {:run-method       :manual
                                                  :user-id          user-id
                                                  :parent-run-type  :dag
                                                  :active-runs-atom dag-active-runs}))
                run-id)
            (do (log/info "Not executing DAG run for transform" (pr-str transform-id) "because one is already running")
                (some-> start-promise (deliver nil))
                nil)))))
    (catch Throwable t
      ;; unblock any caller waiting on the promise on a pre-start failure
      (some-> start-promise (deliver t))
      (throw t))))

(mu/defn cancel-dag-run! :- :boolean
  "Cancel an in-progress DAG run and request cancellation of its still-running member transform runs.
  Returns true if the run was active and is now canceled, false if it had already finished."
  [run-id :- ms/PositiveInt]
  (coordinated-run/cancel! :model/TransformDagRun :dag_run_id run-id))

;;; ------------------------------------------- Heartbeat / reaping -------------------------------------------

(mu/defn- heartbeat-and-reconcile-runs! :- :nil
  "Stamp a heartbeat on every active DAG run this process is coordinating, then deliver the `gone`
  promise of any that were terminated externally so their coordinator aborts."
  []
  (coordinated-run/heartbeat-and-reconcile! :model/TransformDagRun dag-active-runs))

(mu/defn- reap-orphaned-runs! :- [:maybe [:sequential ::transforms.schema/transform-dag-run]]
  "Reap DAG runs whose coordinator process died (stale heartbeat)."
  []
  (coordinated-run/reap-orphaned-runs! :model/TransformDagRun "dag" dag-heartbeat-stale-minutes))

(defmethod task/init! ::TransformDagRunHeartbeat [_]
  (rt/start-heartbeat! heartbeat-and-reconcile-runs! 1))

(defmethod task/init! ::TransformDagRunReaper [_]
  (rt/schedule-reaper! {:job-key "metabase.transforms.dag.reaper-job"
                        :label   "transform DAG run"
                        :reap-fn #'reap-orphaned-runs!}))
