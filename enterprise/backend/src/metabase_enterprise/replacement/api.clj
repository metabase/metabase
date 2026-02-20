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

(mr/def ::table-info
  [:map
   [:id           pos-int?]
   [:name         :string]
   [:display_name :string]
   [:schema       [:maybe :string]]])

(mr/def ::field-info
  [:map
   [:id           [:maybe pos-int?]]
   [:name         :string]
   [:display_name :string]
   [:table        {:optional true} ::table-info]])

(mr/def ::column
  [:map
   [:id                 [:maybe pos-int?]]
   [:name               :string]
   [:display_name       :string]
   [:database_type      [:maybe :string]]
   [:fk_target_field_id [:maybe pos-int?]]
   [:target             {:optional true} ::field-info]])

(def ^:private error-type-enum
  [:enum :missing-column :column-type-mismatch :missing-primary-key :extra-primary-key :missing-foreign-key :foreign-key-mismatch])

(mr/def ::column-mapping
  [:map
   [:source {:optional true} ::column]
   [:target {:optional true} ::column]
   [:errors {:optional true} [:sequential error-type-enum]]])

(mr/def ::check-replace-source-response
  [:map
   [:success         :boolean]
   [:column_mappings [:sequential ::column-mapping]]])

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
  (let [result (replacement.source/check-replace-source
                [source_entity_type source_entity_id]
                [target_entity_type target_entity_id])]
    (when-not (:success result)
      (throw (ex-info "Sources are not replaceable" {:status-code 400
                                                     :column_mappings (:column_mappings result)}))))
  (let [user-id api/*current-user-id*
        work-fn (fn [runner]
                  (replacement.runner/run-swap
                   [source_entity_type source_entity_id]
                   [target_entity_type target_entity_id]
                   runner))
        run     (replacement.execute/execute-async!
                 {:source-type source_entity_type
                  :source-id   source_entity_id
                  :target-type target_entity_type
                  :target-id   target_entity_id
                  :user-id     user-id}
                 work-fn)]
    (-> (response/response {:run_id (:id run)})
        (assoc :status 202))))

(api.macros/defendpoint :get "/runs/:id"
  "Get the status of a source replacement run."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (or (t2/select-one :model/ReplacementRun :id id)
      (throw (ex-info "Run not found" {:status-code 404}))))

(api.macros/defendpoint :post "/runs/:id/cancel"
  "Cancel a running source replacement."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
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
