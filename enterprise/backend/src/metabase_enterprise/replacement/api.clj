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
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(api.macros/defendpoint :post "/source/check-replace" :- ::replacement.schema/check-replace-source-response
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

(api.macros/defendpoint :post "/source/replace" :- [:map
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

(api.macros/defendpoint :get "/source/runs" :- [:sequential ::replacement.schema/run]
  "List source replacement runs, optionally filtered by is-active."
  [_route-params
   {:keys [is-active]} :- [:map [:is-active {:optional true} [:maybe :boolean]]]]
  (api/check-superuser)
  (t2/select :model/ReplacementRun
             (cond-> {:order-by [[:start_time :desc]]}
               (some? is-active) (assoc :where [:= :is_active is-active]))))

(api.macros/defendpoint :get "/source/runs/:id" :- ::replacement.schema/run
  "Get the status of a source replacement run."
  [{:keys [id]} :- [:map [:id ::replacement.schema/run-id]]]
  (api/check-superuser)
  (api/check-404 (t2/select-one :model/ReplacementRun :id id)))

(api.macros/defendpoint :post "/source/runs/:id/cancel" :- [:map [:success boolean?]]
  "Cancel a running source replacement."
  [{:keys [id]} :- [:map [:id ::replacement.schema/run-id]]]
  (api/check-superuser)
  (let [run (api/check-404 (t2/select-one :model/ReplacementRun :id id))]
    (when-not (:is_active run)
      (throw (ex-info "Run is not active" {:status-code 409})))
    (replacement-run/cancel-run! id)
    {:success true}))

(def ^{:arglists '([request respond raise])} routes
  "`/api/ee/replacement` routes."
  (api.macros/ns-handler *ns* +auth))
