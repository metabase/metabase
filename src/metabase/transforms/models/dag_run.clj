(ns metabase.transforms.models.dag-run
  "A `transform_dag_run` tracks a manual DAG-reprocess run: reprocessing the transitive dependency DAG
  rooted at a single seed transform (upstream or downstream). Like a scheduled job run it coordinates
  many member transform runs, but it is always triggered manually from one transform rather than by a
  job — so it has its own table rather than overloading `transform_job_run`. Member runs link back
  via `transform_run.dag_run_id`."
  (:require
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.models.util :as transforms.models.u]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/TransformDagRun [_model] :transform_dag_run)

(doto :model/TransformDagRun
  (derive :metabase/model)
  (derive :hook/timestamped?))

(defmethod app-db-copy/spec :model/TransformDagRun [_model]
  {:skip? false})

(t2/define-before-update :model/TransformDagRun
  [run]
  (cond-> run
    (transforms.models.u/ended-without-end-time? run) (assoc :end_time (mi/now))))

(t2/deftransforms :model/TransformDagRun
  {:status    mi/transform-keyword
   :direction mi/transform-keyword})

(t2/define-before-insert :model/TransformDagRun
  [{:keys [source_transform_id] :as run}]
  (if-let [transform (some-> source_transform_id transforms.db/transform-snapshot)]
    (assoc run
           :source_transform_name      (:name transform)
           :source_transform_entity_id (:entity_id transform))
    run))

(mu/defn start-dag-run! :- ::transforms.schema/transform-dag-run
  "Start a DAG-reprocess run seeded from `source-transform-id`, traversing `direction`
  (`:upstream`/`:downstream`). `user-id` is the user who triggered it; `transform-count` is the
  number of transforms the run's plan selected to run, stored for display in run listings.
  The insert hook snapshots the seed transform's name and entity_id so the run stays displayable after the
  transform is deleted (its FK is SET NULL, as for `transform_run.transform_id`)."
  [source-transform-id :- ::lib.schema.id/transform
   direction           :- [:enum :upstream :downstream]
   user-id             :- [:maybe ::lib.schema.id/user]
   transform-count     :- :int]
  (transforms.db/insert-dag-run! {:source_transform_id source-transform-id
                                  :direction           direction
                                  :transform_count     transform-count
                                  :user_id             user-id
                                  :status              :started
                                  :is_active           true}))

(mu/defn running-run-for-source-transform-id :- [:maybe ::transforms.schema/transform-dag-run]
  "Return the single active DAG run seeded from `source-transform-id`, or nil."
  [source-transform-id :- ::lib.schema.id/transform]
  (transforms.db/active-dag-run-for-transform source-transform-id))

(mu/defn transform-runs-for-dag-run :- [:sequential ::transforms.schema/transform-run]
  "Return the transform runs that were part of the given DAG run, ordered by start time."
  [dag-run-id :- ms/PositiveInt]
  (transforms.db/runs-for-dag-run dag-run-id))
