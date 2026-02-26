(ns metabase-enterprise.replacement.api
  "`/api/ee/replacement/` routes"
  (:require
   [metabase-enterprise.replacement.execute :as replacement.execute]
   [metabase-enterprise.replacement.models.replacement-run :as replacement-run]
   [metabase-enterprise.replacement.runner :as replacement.runner]
   [metabase-enterprise.replacement.source :as replacement.source]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [ring.util.response :as response]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private entity-type-enum
  [:enum :card :table])

(mr/def ::column
  [:map
   [:id             [:maybe pos-int?]]
   [:name           :string]
   [:display_name   :string]
   [:base_type      [:maybe :string]]
   [:effective_type [:maybe :string]]
   [:semantic_type  [:maybe :string]]])

(def ^:private column-error-type-enum
  [:enum :column-type-mismatch :missing-primary-key :extra-primary-key :missing-foreign-key :foreign-key-mismatch])

(def ^:private error-type-enum
  [:enum :cycle-detected :database-mismatch])

(mr/def ::column-mapping
  [:map
   [:source [:maybe ::column]]
   [:target [:maybe ::column]]
   [:errors {:optional true} [:sequential column-error-type-enum]]])

(mr/def ::check-replace-source-response
  [:map
   [:success         :boolean]
   [:errors          {:optional true} [:sequential error-type-enum]]
   [:column_mappings {:optional true} [:sequential ::column-mapping]]])

;; same db on both sides

;; u pick some tables, get all the upstream stuff it cannot read from something not in the list,
;; check they dont have any upstream data source outside the list

;; database replacement
;; - need to check 

;; set of tables -> set of tables

;; how close are we to merging this project?
;; next week sounds reasonable.

;; make the guard rails block stuff we don't handle
;; (hard when implicit joins?)

(api.macros/defendpoint :post "/check-replace-source" :- ::check-replace-source-response
  "Check whether a source entity can be replaced by a target entity. Returns compatibility
  errors describing column mismatches, type mismatches, primary key mismatches, and foreign
  key mismatches."
  [_route-params
   _query-params
   {:keys [source_entity_id source_entity_type target_entity_id target_entity_type]}
   :- [:map
       [:source_entity_id   ms/PositiveInt]
       [:source_entity_type entity-type-enum]
       [:target_entity_id   ms/PositiveInt]
       [:target_entity_type entity-type-enum]]]
  (api/check-superuser)
  (replacement.source/check-replace-source
   [source_entity_type source_entity_id]
   [target_entity_type target_entity_id]))

(api.macros/defendpoint :post "/replace-source" :- [:map
                                                    [:status [:= 202]] ;; throws to return 409
                                                    [:body [:map {:closed true}
                                                            [:run_id pos-int?]]]]
  "Replace all usages of a source entity with a target entity asynchronously.
   Returns 202 with a run_id for polling. Returns 409 if a replacement is already running."
  [_route-params
   _query-params
   {:keys [source_entity_id source_entity_type target_entity_id target_entity_type]}
   :- [:map
       [:source_entity_id   ms/PositiveInt]
       [:source_entity_type entity-type-enum]
       [:target_entity_id   ms/PositiveInt]
       [:target_entity_type entity-type-enum]]]
  (api/check-superuser)
  (let [result (replacement.source/check-replace-source
                [source_entity_type source_entity_id]
                [target_entity_type target_entity_id])]
    (when-not (:success result)
      (throw (ex-info "Sources are not replaceable" {:status-code 400
                                                     :errors      (:errors result)}))))
  (let [user-id  api/*current-user-id*
        work-fn  (fn [progress]
                   (replacement.runner/run-swap
                    [source_entity_type source_entity_id]
                    [target_entity_type target_entity_id]
                    progress))
        job-row  (replacement-run/create-run!
                  source_entity_type source_entity_id
                  target_entity_type target_entity_id user-id)
        progress (replacement-run/run-row->progress job-row)
        _run     (replacement.execute/execute-async! work-fn progress)]
    (-> (response/response {:run_id (:id job-row)})
        (assoc :status 202))))

(api.macros/defendpoint :get "/runs/:id"
  "Get the status of a source replacement run."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (or (t2/select-one :model/ReplacementRun :id id)
      (throw (ex-info "Run not found" {:status-code 404}))))

(api.macros/defendpoint :post "/runs/:id/cancel"
  "Cancel a running source replacement."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
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
