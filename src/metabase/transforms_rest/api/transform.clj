(ns metabase.transforms-rest.api.transform
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.api.util.handlers :as handlers]
   [metabase.request.core :as request]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms-rest.api.transform-dag-run :as transforms.dag-run]
   [metabase.transforms-rest.api.transform-job]
   [metabase.transforms-rest.api.transform-tag]
   [metabase.transforms-rest.api.util :as transforms-rest.api.u]
   [metabase.transforms.core :as transforms.core]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.u]
   [metabase.util.i18n :refer [deferred-tru LocalizedString]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2])
  (:import
   (java.time OffsetDateTime)))

(comment metabase.transforms-rest.api.transform-job/keep-me
         metabase.transforms-rest.api.transform-tag/keep-me)

(set! *warn-on-reflection* true)

(mr/def ::transform-source ::transforms.schema/transform-source)

(mr/def ::transform-target ::transforms.schema/transform-target)

(mr/def ::run-trigger
  [:enum "none" "global-schedule"])

(def ^:private CreatorResponse
  [:map {:closed true}
   [:id pos-int?]
   [:email :string]
   [:first_name [:maybe :string]]
   [:last_name [:maybe :string]]
   [:common_name {:optional true} [:maybe :string]]
   [:last_login {:optional true} [:maybe :any]]
   [:is_qbnewb {:optional true} :boolean]
   [:is_superuser {:optional true} :boolean]
   [:is_data_analyst {:optional true} :boolean]
   [:tenant_id {:optional true} [:maybe :any]]
   [:date_joined {:optional true} :any]])

(def ^:private OwnerResponse
  [:map {:closed true}
   [:id {:optional true} pos-int?]
   [:email :string]
   [:first_name {:optional true} [:maybe :string]]
   [:last_name {:optional true} [:maybe :string]]
   [:common_name {:optional true} [:maybe :string]]])

(def ^:private TransformLastRunResponse
  [:map {:closed true}
   [:id pos-int?]
   [:transform_id pos-int?]
   [:run_method :keyword]
   [:status [:enum :started :succeeded :failed :timeout :canceled :canceling]]
   [:is_active [:maybe :boolean]]
   [:start_time :any]
   [:end_time {:optional true} [:maybe :any]]
   [:message [:maybe :string]]
   [:user_id [:maybe pos-int?]]
   [:transform_name {:optional true} [:maybe :string]]
   [:transform_entity_id {:optional true} [:maybe :string]]
   [:job_run_id {:optional true} [:maybe pos-int?]]
   [:dag_run_id {:optional true} [:maybe pos-int?]]
   [:checkpoint_filter_field_id {:optional true} [:maybe pos-int?]]
   [:checkpoint_lo_value {:optional true} [:maybe :string]]
   [:checkpoint_hi_value {:optional true} [:maybe :string]]
   [:metered_as {:optional true} [:maybe :string]]])

(def ^:private TransformResponse
  [:map {:closed true}
   [:id pos-int?]
   [:name :string]
   [:description [:maybe :string]]
   [:source :any]
   [:target :any]
   [:table_dependencies {:optional true} [:maybe [:sequential :map]]]
   [:source_type :keyword]
   [:source_database_id {:optional true} [:maybe pos-int?]]
   [:source_readable {:optional true} [:maybe :boolean]]
   [:entity_id [:maybe :string]]
   [:created_at :any]
   [:updated_at :any]
   [:creator_id pos-int?]
   [:collection_id [:maybe pos-int?]]
   [:target_db_id {:optional true} [:maybe pos-int?]]
   [:run_trigger {:optional true} [:maybe :keyword]]
   [:creator CreatorResponse]
   [:last_run {:optional true} [:maybe TransformLastRunResponse]]
   [:tag_ids {:optional true} [:sequential pos-int?]]
   [:table {:optional true} [:maybe :map]]
   [:target_table_id {:optional true} [:maybe pos-int?]]
   [:owner_user_id {:optional true} [:maybe pos-int?]]
   [:owner_email {:optional true} [:maybe :string]]
   [:owner {:optional true} [:maybe OwnerResponse]]
   [:last_checkpoint_value {:optional true} [:maybe :string]]
   [:can_read {:optional true} :boolean]
   [:can_write {:optional true} :boolean]
   [:can_execute {:optional true} :boolean]
   ;; Index methods requestable on the target table (driver capability); nil when unsupported. Set only by GET /:id.
   ;; Referenced by registry keyword (not a require) to avoid a transforms-rest -> driver module dependency; the schema
   ;; is registered by `metabase.driver`, which is loaded well before any response is coerced.
   [:requestable_indexes {:optional true} [:maybe :metabase.driver/supported-index-methods]]])

(def ^:private TransformRunResponse
  [:map {:closed true}
   [:id pos-int?]
   [:transform_id [:maybe pos-int?]]
   [:run_method :keyword]
   [:status [:enum :started :succeeded :failed :timeout :canceled :canceling]]
   [:is_active [:maybe :boolean]]
   [:start_time :any]
   [:end_time {:optional true} [:maybe :any]]
   [:message [:maybe :string]]
   [:user_id [:maybe pos-int?]]
   [:transform_name {:optional true} [:maybe :string]]
   [:transform_entity_id {:optional true} [:maybe :string]]
   [:job_run_id {:optional true} [:maybe pos-int?]]
   [:dag_run_id {:optional true} [:maybe pos-int?]]
   [:checkpoint_filter_field_id {:optional true} [:maybe pos-int?]]
   [:checkpoint_lo_value {:optional true} [:maybe :string]]
   [:checkpoint_hi_value {:optional true} [:maybe :string]]
   [:metered_as {:optional true} [:maybe :string]]
   ;; Transform can have id/name when exists, or be nil when deleted
   [:transform {:optional true} [:maybe [:map {:closed true}
                                         [:id {:optional true} pos-int?]
                                         [:name {:optional true} :string]
                                         [:deleted {:optional true} :boolean]
                                         [:collection_id {:optional true} [:maybe pos-int?]]
                                         [:collection {:optional true} [:maybe :map]]
                                         [:tag_ids {:optional true} [:sequential pos-int?]]]]]])

(comment
  ;; Examples
  [{:id 1
    :name "Gadget Products"
    :source {:type "query"
             :query {:database 1
                     :type "native",
                     :native {:query "SELECT * FROM PRODUCTS WHERE CATEGORY = 'Gadget'"
                              :template-tags {}}}}
    :target {:type "table"
             :schema "transforms"
             :name "gadget_products"}}])

(api.macros/defendpoint :get "/" :- [:sequential TransformResponse]
  "Get a list of transforms."
  [_route-params
   query-params :-
   [:map
    [:last-run-start-time {:optional true} [:maybe ms/NonBlankString]]
    [:last-run-statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout"])]]
    [:tag-ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:database-id {:optional true} [:maybe ms/PositiveInt]]]]
  (transforms.core/get-transforms query-params))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
(api.macros/defendpoint :post "/" :- TransformResponse
  "Create a new transform."
  [_route-params
   _query-params
   body :- [:map
            [:name :string]
            [:description {:optional true} [:maybe :string]]
            [:source ::transforms.schema/transform-source]
            [:target ::transforms.schema/transform-target]
            [:run_trigger {:optional true} ::run-trigger]
            [:tag_ids {:optional true} [:sequential ms/PositiveInt]]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]
            [:owner_user_id {:optional true} [:maybe ms/PositiveInt]]
            [:owner_email {:optional true} [:maybe :string]]]]
  (transforms.core/check-feature-enabled! body)
  (api/create-check :model/Transform body)
  (transforms.core/check-database-feature body)
  (transforms.core/validate-incremental-column-type! body)
  (api/check (not (transforms-base.u/target-table-exists? body))
             403
             (deferred-tru "A table with that name already exists."))
  (-> (transforms.core/create-transform! body)
      transforms.u/add-source-readable))

(api.macros/defendpoint :get "/:id" :- TransformResponse
  "Get a specific transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (transforms.core/get-transform id))

(api.macros/defendpoint :get "/:id/dependencies" :- [:sequential TransformResponse]
  "Get the dependencies of a specific transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/read-check :model/Transform id)
  (let [id->transform (t2/select-pk->fn identity :model/Transform)
        {graph :dependencies} (transforms.core/transform-ordering #{id} (vals id->transform))
        dep-ids         (get graph id)
        dependencies    (map id->transform dep-ids)]
    (->> (t2/hydrate dependencies :creator :owner :can_read :can_write :can_execute)
         transforms.u/add-source-readable)))

(api.macros/defendpoint :get "/run" :- [:map {:closed true}
                                        [:data [:sequential TransformRunResponse]]
                                        [:limit pos-int?]
                                        [:offset :int]
                                        [:total :int]]
  "Get transform runs based on a set of filter params."
  [_route-params
   query-params :-
   [:map
    [:sort-column    {:optional true} [:enum "transform-name" "start-time" "end-time" "status" "run-method" "transform-tags" "duration"]]
    [:sort-direction {:optional true} [:enum "asc" "desc"]]
    [:transform-ids {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
    [:statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout"])]]
    [:transform-tag-ids {:optional true} [:maybe (ms/QueryVectorOf ms/IntGreaterThanOrEqualToZero)]]
    [:start-time {:optional true} [:maybe ms/NonBlankString]]
    [:end-time {:optional true} [:maybe ms/NonBlankString]]
    [:run-methods {:optional true} [:maybe (ms/QueryVectorOf [:enum "manual" "cron"])]]
    [:user-id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-data-analyst)
  (-> (transforms.core/paged-runs (assoc query-params
                                         :offset (request/offset)
                                         :limit  (request/limit)))
      (update :data #(map transforms-base.u/present-run %))))

(def ^:private RunSummaryResponse
  "One row of the unified runs listing: a job run, a manual DAG-reprocess run, or a standalone
  transform run (one not belonging to a job/DAG run). Identified by `(run_type, id)`; `entity_id`
  is the id of the associated job/transform and `name` its name (nil if it was deleted).
  `direction` is set only for DAG runs."
  [:map {:closed true}
   [:run_type [:enum :job :dag :transform]]
   [:id pos-int?]
   [:entity_id [:maybe pos-int?]]
   [:name [:maybe [:or :string LocalizedString]]]
   [:direction [:maybe [:enum :upstream :downstream]]]
   [:run_method [:maybe :keyword]]
   [:status [:enum :started :succeeded :failed :timeout :canceled :canceling]]
   [:is_active [:maybe :boolean]]
   [:start_time :any]
   [:end_time {:optional true} [:maybe :any]]
   [:message [:maybe :string]]
   [:user_id [:maybe pos-int?]]])

(api.macros/defendpoint :get "/runs" :- [:map {:closed true}
                                         [:data [:sequential RunSummaryResponse]]
                                         [:limit pos-int?]
                                         [:offset :int]
                                         [:total :int]]
  "Paginated unified run history: every row is a root run — a job run, a manual DAG-reprocess run,
  or a standalone transform run — never a member run of a job/DAG (those are listed by `GET /run`
  and the per-run `transform-runs` endpoints).

  `types` selects which kinds to include (all by default); `transform-ids` narrows to runs that ran
  any of the given transforms. The remaining filters work as in `GET /run`."
  [_route-params
   query-params :-
   [:map
    [:types {:optional true} [:maybe (ms/QueryVectorOf [:enum "job" "dag" "transform"])]]
    [:statuses {:optional true} [:maybe (ms/QueryVectorOf [:enum "started" "succeeded" "failed" "timeout" "canceled" "canceling"])]]
    [:run-methods {:optional true} [:maybe (ms/QueryVectorOf [:enum "manual" "cron"])]]
    [:start-time {:optional true} [:maybe ms/NonBlankString]]
    [:end-time {:optional true} [:maybe ms/NonBlankString]]
    [:transform-ids {:optional true} [:maybe (ms/QueryVectorOf ms/PositiveInt)]]
    [:sort-column {:optional true} [:maybe [:enum "start_time" "end_time"]]]
    [:sort-direction {:optional true} [:maybe [:enum "asc" "desc"]]]]]
  (api/check-data-analyst)
  (-> (transforms.core/paged-run-summaries (assoc query-params
                                                  :types  (map keyword (:types query-params))
                                                  :offset (request/offset)
                                                  :limit  (request/limit)))
      (update :data transforms.core/present-run-summaries)))

(api.macros/defendpoint :get "/run/:run-id" :- TransformRunResponse
  "Get a transform run by ID."
  [{:keys [run-id]} :- [:map
                        [:run-id ms/PositiveInt]]]
  (api/check-data-analyst)
  (let [run (api/check-404 (t2/select-one :model/TransformRun :id run-id))]
    (-> (t2/hydrate run [:transform :collection :transform_tag_ids])
        transforms-base.u/present-run)))

(api.macros/defendpoint :put "/:id" :- TransformResponse
  "Update a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   body :- [:map
            [:name {:optional true} :string]
            [:description {:optional true} [:maybe :string]]
            [:source {:optional true} ::transforms.schema/transform-source]
            [:target {:optional true} ::transforms.schema/transform-target]
            [:run_trigger {:optional true} ::run-trigger]
            [:tag_ids {:optional true} [:sequential ms/PositiveInt]]
            [:collection_id {:optional true} [:maybe ms/PositiveInt]]
            [:owner_user_id {:optional true} [:maybe ms/PositiveInt]]
            [:owner_email {:optional true} [:maybe :string]]]]
  (api/write-check :model/Transform id)
  (transforms.core/update-transform! id body))

(api.macros/defendpoint :delete "/:id" :- :nil
  "Delete a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (transforms.core/delete-transform! (api/write-check :model/Transform id)))

(api.macros/defendpoint :delete "/:id/table" :- :nil
  "Delete a transform's output table."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/write-check :model/Transform id)
  (transforms-base.u/delete-target-table-by-id! id)
  nil)

(api.macros/defendpoint :post "/:id/cancel" :- :nil
  "Cancel the current run for a given transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (let [transform (api/write-check :model/Transform id)
        run       (api/check-404 (transforms.core/running-run-for-transform-id id))]
    (transforms.core/mark-cancel-started-run! (:id run))
    (when (transforms-base.u/python-transform? transform)
      ;; The cancelation row was just inserted with DB `current_timestamp`; `now` is within a
      ;; few ms of that and fine for the latency histogram, and avoids the perf/complexity cost of
      ;; getting the exact timestamp back out of the DB.
      (transforms.core/cancel-run! run (OffsetDateTime/now))))
  nil)

(api.macros/defendpoint :post "/:id/reset-checkpoint" :- :nil
  "Reset the stored checkpoint for an incremental transform."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/write-check :model/Transform id)
  (t2/update! :model/Transform id {:last_checkpoint_value nil})
  nil)

(defn- check-feature-and-lock!
  "Check that the transform's premium features are enabled and that transforms are not locked by the
  trial quota."
  [transform]
  (transforms.core/check-feature-enabled! transform)
  (api/check (not (transforms.core/transform-locked? transform))
             [402 {:message    (deferred-tru "Transforms are temporarily locked because the trial quota has been reached.")
                   :error-code "metabase_transforms_locked"}]))

(defn run-transform!
  "Run a transform. Returns a 202 response with run_id.
   The transform must already be fetched and validated."
  [transform]
  (check-feature-and-lock! transform)
  (transforms-rest.api.u/async-run-response
   (deferred-tru "Transform run started")
   :run_id
   (fn [start-promise]
     (transforms.core/execute! transform {:start-promise start-promise
                                          :run-method    :manual
                                          :user-id       api/*current-user-id*}))))

(api.macros/defendpoint :post "/:id/run" :- [:map
                                             [:status [:= 202]]
                                             [:body [:map {:closed true}
                                                     [:message :any]
                                                     [:run_id [:maybe pos-int?]]]]]
  "Run a transform."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (run-transform! (api/read-check :model/Transform id)))

(api.macros/defendpoint :post "/:id/run-dag" :- [:map
                                                 [:status [:= 202]]
                                                 [:body [:map {:closed true}
                                                         [:message :any]
                                                         [:dag_run_id [:maybe pos-int?]]]]]
  "Trigger a DAG-reprocess run starting from a single transform: runs the transform and every
  transform in its transitive dependency closure. Returns a 202 with the created `dag_run_id`, or a
  nil `dag_run_id` when nothing was run (a DAG run for this transform is already in progress, or the
  closure is empty).

  `direction` selects which transforms are included:
  - `upstream`   — the seed transform plus all transforms it depends on
  - `downstream` — the seed transform plus all transforms that depend on it"
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [direction]} :- [:map
                           [:direction (ms/enum-decode-keyword transforms.dag-run/dag-directions)]]]
  (check-feature-and-lock! (api/write-check :model/Transform id))
  (transforms-rest.api.u/async-run-response
   (deferred-tru "DAG run started")
   :dag_run_id
   (fn [start-promise]
     (transforms.core/run-dag! id {:direction     direction
                                   :user-id       api/*current-user-id*
                                   :start-promise start-promise}))))

(api.macros/defendpoint :get "/:id/dag-transforms" :- [:sequential [:map {:closed true}
                                                                    [:id pos-int?]
                                                                    [:name :string]]]
  "Preview the transforms a DAG reprocess from this transform would run (see `POST /:id/run-dag`),
  in execution order."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   {:keys [direction]} :- [:map [:direction (ms/enum-decode-keyword transforms.dag-run/dag-directions)]]]
  (api/read-check :model/Transform id)
  (mapv (fn [{xform-id :id, xform-name :name}]
          {:id xform-id, :name xform-name})
        (transforms.core/dag-run-transforms id direction)))

(def ^{:arglists '([request respond raise])} routes
  "`/api/transform` routes."
  (handlers/routes
   (api.macros/ns-handler *ns* +auth)))

(def ^{:arglists '([request respond raise])} transform-dag-run-routes
  "`/api/transform-dag-run` routes."
  (api.macros/ns-handler 'metabase.transforms-rest.api.transform-dag-run +auth))

(def ^{:arglists '([request respond raise])} transform-tag-routes
  "`/api/transform-tag` routes."
  (api.macros/ns-handler 'metabase.transforms-rest.api.transform-tag +auth))

(def ^{:arglists '([request respond raise])} transform-job-routes
  "`/api/transform-job` routes."
  (api.macros/ns-handler 'metabase.transforms-rest.api.transform-job +auth))
