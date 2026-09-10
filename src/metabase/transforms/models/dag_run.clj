(ns metabase.transforms.models.dag-run
  "A `transform_dag_run` tracks a manual DAG-reprocess run: reprocessing the transitive dependency DAG
  rooted at a single seed transform (upstream or downstream). Like a scheduled job run it coordinates
  many member transform runs, but it is always triggered manually from one transform rather than by a
  job — so it has its own table rather than overloading `transform_job_run`. Member runs link back
  via `transform_run.dag_run_id`."
  (:require
   [metabase.models.interface :as mi]
   [metabase.transforms.db :as transforms.db]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformDagRun [_model] :transform_dag_run)

(derive :model/TransformDagRun :metabase/model)
(derive :model/TransformDagRun :hook/timestamped?)

(t2/deftransforms :model/TransformDagRun
  {:status    mi/transform-keyword
   :direction mi/transform-keyword})

(defn start-dag-run!
  "Start a DAG-reprocess run seeded from `source-transform-id`, traversing `direction`
  (`:upstream`/`:downstream`). `user-id` is the user who triggered it; `transform-count` is the
  number of transforms the run's plan selected to run, stored for display in run listings.
  Snapshots the seed transform's name and entity_id so the run stays displayable after the
  transform is deleted (its FK is SET NULL, as for `transform_run.transform_id`)."
  [source-transform-id direction user-id transform-count]
  (let [transform (transforms.db/transform-snapshot source-transform-id)]
    (transforms.db/insert-dag-run! {:source_transform_id        source-transform-id
                                    :source_transform_name      (:name transform)
                                    :source_transform_entity_id (:entity_id transform)
                                    :direction                  direction
                                    :transform_count            transform-count
                                    :user_id                    user-id
                                    :status                     :started
                                    :is_active                  true})))

(defn running-run-for-source-transform-id
  "Return the single active DAG run seeded from `source-transform-id`, or nil."
  [source-transform-id]
  (transforms.db/active-dag-run-for-transform source-transform-id))

(defn transform-runs-for-dag-run
  "Return the transform runs that were part of the given DAG run, ordered by start time."
  [dag-run-id]
  (transforms.db/runs-for-dag-run dag-run-id))
