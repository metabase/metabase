(ns metabase.transforms-rest.api.transform-dag-run
  "`/api/transform-dag-run` routes: operations on a single manual DAG-reprocess run (the
  `transform_dag_run` table) — its member transform runs and canceling it. Rows come from the
  unified runs listing (`GET /api/transform/runs`, `run_type = dag`); per-transform DAG endpoints
  (triggering a run and previewing it) live on `/api/transform/:id/...` in
  [[metabase.transforms-rest.api.transform]]."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.core :as transforms.core]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def dag-directions
  "The DAG traversal directions a reprocess run can take."
  [:upstream :downstream])

(def DagRunTransformRunResponse
  "A member transform run of a DAG run — a `transform_run` row (linked via `dag_run_id`), hydrated
  with its transform, the same shape a job run's member runs use."
  [:map {:closed true}
   [:id pos-int?]
   [:transform_id [:maybe pos-int?]]
   [:job_run_id [:maybe pos-int?]]
   [:dag_run_id [:maybe pos-int?]]
   [:run_method :keyword]
   [:status [:enum :started :succeeded :failed :timeout :canceled :canceling]]
   [:is_active [:maybe :boolean]]
   [:start_time :any]
   [:end_time {:optional true} [:maybe :any]]
   [:message [:maybe :string]]
   [:user_id [:maybe pos-int?]]
   [:transform_name {:optional true} [:maybe :string]]
   [:transform_entity_id {:optional true} [:maybe :string]]
   [:transform {:optional true} [:maybe :map]]
   [:metered_as {:optional true} [:maybe :string]]
   [:checkpoint_filter_field_id {:optional true} [:maybe pos-int?]]
   [:checkpoint_lo_value {:optional true} [:maybe :string]]
   [:checkpoint_hi_value {:optional true} [:maybe :string]]])

(api.macros/defendpoint :get "/:run-id/transform-runs" :- [:sequential DagRunTransformRunResponse]
  "Get the transform runs that made up a specific DAG run (the drill-down of a `dag` row in the
  unified runs listing)."
  [{:keys [run-id]} :- [:map [:run-id ms/PositiveInt]]]
  (api/check-data-analyst)
  (api/check-404 (t2/select-one :model/TransformDagRun :id run-id))
  (let [runs (transforms.core/transform-runs-for-dag-run run-id)]
    (->> (t2/hydrate runs [:transform :collection :transform_tag_ids])
         (map transforms-base.u/present-run))))

(api.macros/defendpoint :post "/:run-id/cancel" :- :nil
  "Cancel an in-progress manual DAG run and request cancellation of its still-running transforms."
  [{:keys [run-id]} :- [:map [:run-id ms/PositiveInt]]]
  (api/check-data-analyst)
  (api/check-404 (t2/select-one :model/TransformDagRun :id run-id))
  (api/check-400 (transforms.core/cancel-dag-run! run-id))
  nil)

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform-dag-run` routes."
  (api.macros/ns-handler *ns* +auth))
