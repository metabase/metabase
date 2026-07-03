(ns metabase.transforms-rest.api.transform-dag-run
  "`/api/transform-dag-run` routes: the cross-transform view over manual DAG-reprocess runs (the
  `transform_dag_run` table), plus canceling one. Per-transform DAG endpoints (triggering a run,
  previewing it, and a single transform's run history) live on `/api/transform/:id/...` in
  [[metabase.transforms-rest.api.transform]]; the schemas here are shared with those endpoints."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.request.core :as request]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.core :as transforms.core]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def dag-directions
  "The DAG traversal directions a reprocess run can take."
  [:upstream :downstream])

(def DagRunResponse
  "A `transform_dag_run` row prepared for an API response (see `present-run`). `transform_name` is
  the seed transform's name, hydrated only by the cross-transform listing."
  [:map {:closed true}
   [:id pos-int?]
   [:source_transform_id pos-int?]
   [:direction :keyword]
   [:status [:enum :started :succeeded :failed :timeout :canceled]]
   [:is_active [:maybe :boolean]]
   [:start_time :any]
   [:end_time {:optional true} [:maybe :any]]
   [:message [:maybe :string]]
   [:user_id [:maybe pos-int?]]
   [:created_at :any]
   [:updated_at :any]
   [:transform_name {:optional true} [:maybe :string]]])

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

(api.macros/defendpoint :get "/" :- [:map {:closed true}
                                     [:data [:sequential DagRunResponse]]
                                     [:limit pos-int?]
                                     [:offset :int]
                                     [:total :int]]
  "Get paginated run history for all manual DAG-reprocess runs across transforms. Each row's seed
  transform name is hydrated as `transform_name`."
  [_route-params
   query-params :- [:map
                    [:status {:optional true} [:maybe [:enum "started" "succeeded" "failed" "timeout" "canceled"]]]
                    [:start-time {:optional true} [:maybe ms/NonBlankString]]
                    [:sort-column {:optional true} [:maybe [:enum "start_time" "end_time"]]]
                    [:sort-direction {:optional true} [:maybe [:enum "asc" "desc"]]]]]
  (api/check-data-analyst)
  (-> (transforms.core/paged-all-dag-runs (assoc query-params
                                                 :offset (request/offset)
                                                 :limit  (request/limit)))
      (update :data
              (fn [runs]
                (let [id->name (when-let [ids (seq (map :source_transform_id runs))]
                                 (t2/select-pk->fn :name :model/Transform :id [:in ids]))]
                  (mapv (fn [run]
                          (-> run
                              transforms-base.u/present-run
                              (assoc :transform_name (get id->name (:source_transform_id run)))))
                        runs))))))

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
