(ns metabase-enterprise.replacement.api
  "`/api/ee/replacement/` routes"
  (:require
   [metabase-enterprise.replacement.convert :as convert]
   [metabase-enterprise.replacement.execute :as replacement.execute]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.runner :as replacement.runner]
   [metabase-enterprise.replacement.schema :as replacement.schema]
   [metabase-enterprise.replacement.source-check :as replacement.source-check]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
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
                   (replacement.runner/run-swap
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

(api.macros/defendpoint :post "/replace-source-with-transform"
  :- [:map
      [:status [:= 202]]
      [:body [:map {:closed true}
              [:run_id ::replacement.schema/run-id]]]]
  "Re-run a transform and replace all usages of the source entity with the output
   table. The FE should create the transform first via the transforms API.
   Returns 202 with a run_id for polling.
   Returns 409 if another replacement or conversion is already running."
  [_route-params
   _query-params
   {:keys [source_entity_id source_entity_type transform_id unpersist_card archive_card]}
   :- ::replacement.schema/replace-source-with-transform-request]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/Transform :id transform_id))
  (let [job-row  (replacement-run/create-run!
                  source_entity_type source_entity_id
                  source_entity_type source_entity_id
                  api/*current-user-id* :replace-with-transform)
        progress (replacement-run/run-row->progress job-row)
        work-fn  (fn [progress]
                   (convert/replace-source-with-transform!
                    source_entity_type source_entity_id transform_id
                    (:id job-row) progress
                    {:unpersist-card? unpersist_card
                     :archive-card?   archive_card}))]
    (replacement.execute/execute-async! work-fn progress)
    (-> (response/response {:run_id (:id job-row)})
        (assoc :status 202))))

(api.macros/defendpoint :get "/runs"
  :- [:sequential ::replacement.schema/run]
  "List source replacement/conversion runs. Optionally filter to only active runs."
  [_route-params
   {:keys [is-active]}
   :- [:map [:is-active {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (replacement-run/list-runs :is-active is-active))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/replacement` routes."
  (api.macros/ns-handler *ns* +auth))
