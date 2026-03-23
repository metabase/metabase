(ns metabase-enterprise.replacement.api
  "`/api/ee/replacement/` routes"
  (:require
   [metabase-enterprise.replacement.execute :as replacement.execute]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.runner :as replacement.runner]
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase-enterprise.replacement.source-check :as replacement.source-check]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.transforms.core :as transforms]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/check-replace-source" :- ::replacement.schema/check-replace-source-response
  "Check whether a source entity can be replaced by a target entity. Returns compatibility
  errors describing column mismatches, type mismatches, primary key mismatches, and foreign
  key mismatches."
  [_route-params
   _query-params
   {:keys [source_entity_id source_entity_type target_entity_id target_entity_type]}
   :- [:map
       [:source_entity_id   ::replacement.schema/source-entity-id]
       [:source_entity_type ::replacement.schema/source-entity-type]
       [:target_entity_id   ::replacement.schema/source-entity-id]
       [:target_entity_type ::replacement.schema/source-entity-type]]]
  (api/check-superuser)
  (replacement.source-check/check-replace-source
   [source_entity_type source_entity_id]
   [target_entity_type target_entity_id]))

(api.macros/defendpoint :post "/replace-source" :- [:map
                                                    [:status [:= 202]] ;; throws to return 409
                                                    [:body [:map {:closed true}
                                                            [:run_id ::replacement.schema/run-id]]]]
  "Replace all usages of a source entity with a target entity asynchronously.
   Returns 202 with a run_id for polling. Returns 409 if a replacement is already running."
  [_route-params
   _query-params
   {:keys [source_entity_id source_entity_type target_entity_id target_entity_type]}
   :- [:map
       [:source_entity_id   ::replacement.schema/source-entity-id]
       [:source_entity_type ::replacement.schema/source-entity-type]
       [:target_entity_id   ::replacement.schema/source-entity-id]
       [:target_entity_type ::replacement.schema/source-entity-type]]]
  (api/check-superuser)
  (let [result (replacement.source-check/check-replace-source
                [source_entity_type source_entity_id]
                [target_entity_type target_entity_id])]
    (when-not (:success result)
      (throw (ex-info "Sources are not replaceable" {:status-code 400
                                                     :errors      (:errors result)}))))
  (let [work-fn  (fn [progress]
                   (replacement.runner/run-swap-source!
                    [source_entity_type source_entity_id]
                    [target_entity_type target_entity_id]
                    progress))
        job-row  (replacement-run/create-run!
                  source_entity_type source_entity_id
                  target_entity_type target_entity_id api/*current-user-id*)
        progress (replacement-run/run-row->progress job-row)]
    (replacement.execute/execute-async! work-fn progress)
    (-> (response/response {:run_id (:id job-row)})
        (assoc :status 202))))

(api.macros/defendpoint :post "/replace-model-with-transform" :- [:map
                                                                  [:status [:= 202]]
                                                                  [:body [:map {:closed true}
                                                                          [:run_id ::replacement.schema/run-id]]]]
  "Create a transform from a model, execute it, and replace all usages of the model
   with the output table. Un-persists the model and converts it to a saved question.
   Returns 202 with a run_id for polling.

   If there is an error during the transform execution, no replacement will be
   performed and the model will remain unchanged.

   If there is an error during the source swap, the transform and the output
   table will be retained, and the model will remain unchanged. We cannot delete
   the transform or the output table because they can be used by other queries at
   this point."
  [_route-params
   _query-params
   {:keys [card_id transform_name transform_target target_collection_id transform_tag_ids]}
   :- [:map
       [:card_id              ::replacement.schema/source-entity-id]
       [:transform_name       :string]
       [:transform_target     :map]
       [:target_collection_id {:optional true} [:maybe ::replacement.schema/source-entity-id]]
       [:transform_tag_ids    {:optional true} [:maybe [:sequential pos-int?]]]]]
  (api/check-superuser)
  (let [user-id   api/*current-user-id*
        card      (api/check-404 (t2/select-one :model/Card :id card_id))
        transform (transforms/create-transform!
                   {:name          transform_name
                    :source        {:type  :query
                                    :query (:dataset_query card)}
                    :target        transform_target
                    :collection_id target_collection_id
                    :tag_ids       transform_tag_ids})
        job-row   (replacement-run/create-run!
                   :card card_id
                   :transform (:id transform)
                   user-id)
        progress  (replacement-run/run-row->progress job-row)
        work-fn   (fn [progress]
                    (replacement.runner/run-swap-model-with-transform! card_id (:id transform) progress :user-id user-id))]
    (replacement.execute/execute-async! work-fn progress)
    (-> (response/response {:run_id (:id job-row)})
        (assoc :status 202))))

(api.macros/defendpoint :get "/runs" :- [:sequential ::replacement.schema/run]
  "List replacement runs, optionally filtered by is-active."
  [_route-params
   {:keys [is-active]} :- [:map [:is-active {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (t2/select :model/ReplacementRun
             (cond-> {:order-by [[:start_time :desc]]}
               (some? is-active) (assoc :where [:= :is_active is-active]))))

(api.macros/defendpoint :get "/runs/:id" :- ::replacement.schema/run
  "Get the status of a source replacement run."
  [{:keys [id]} :- [:map [:id ::replacement.schema/run-id]]]
  (api/check-superuser)
  (or (t2/select-one :model/ReplacementRun :id id)
      (throw (ex-info "Run not found" {:status-code 404}))))

(api.macros/defendpoint :post "/runs/:id/cancel" :- [:map [:success boolean?]]
  "Cancel a running source replacement."
  [{:keys [id]} :- [:map [:id ::replacement.schema/run-id]]]
  (api/check-superuser)
  (let [run (t2/select-one :model/ReplacementRun :id id)]
    (when-not run
      (throw (ex-info "Run not found" {:status-code 404})))
    (when-not (:is_active run)
      (throw (ex-info "Run is not active" {:status-code 409})))
    (replacement-run/cancel-run! id)
    {:success true}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/replacement` routes."
  (api.macros/ns-handler *ns* +auth))
