(ns metabase-enterprise.index-manager.api
  "Superuser CRUD over managed index requests, scoped to a transform. Mounted at `/api/ee/index-manager` behind the
  transforms premium feature."
  (:require
   [metabase-enterprise.index-manager.core :as index-manager]
   [metabase-enterprise.index-manager.models :as models]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private IndexRequest
  [:map
   [:id ms/PositiveInt]
   [:transform_id ms/PositiveInt]
   [:table_id [:maybe ms/PositiveInt]]
   [:index_name ms/NonBlankString]
   ;; The real structured schema (not a bare `:map`) so response coercion doesn't strip its keys.
   [:structured ::models/index-structured]
   [:status [:enum :pending :running :succeeded :failed :dropped]]
   [:error_message [:maybe :string]]
   [:created_at :any]
   [:updated_at :any]
   [:last_executed_at [:maybe :any]]])

(defn- present [req]
  (select-keys req [:id :transform_id :table_id :index_name :structured :status :error_message
                    :created_at :updated_at :last_executed_at]))

(api.macros/defendpoint :get "/" :- [:map [:data [:sequential IndexRequest]]]
  "List the managed index requests for a transform."
  [_route-params
   {:keys [transform-id]} :- [:map [:transform-id ms/PositiveInt]]]
  (api/check-superuser)
  {:data (mapv present (index-manager/requests-for-transform transform-id))})

(api.macros/defendpoint :post "/" :- IndexRequest
  "Create a managed index request on a transform's target table."
  [_route-params
   _query-params
   {:keys [transform_id structured]} :- [:map
                                         [:transform_id ms/PositiveInt]
                                         [:structured :map]]]
  (api/check-superuser)
  (present (index-manager/create-request! transform_id structured :created-by api/*current-user-id*)))

(api.macros/defendpoint :put "/:id" :- IndexRequest
  "Replace the structured definition of a managed index request."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [structured]} :- [:map [:structured :map]]]
  (api/check-superuser)
  (api/check-404 (present (index-manager/update-request! id structured))))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a managed index request."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (index-manager/delete-request! id))
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Index Manager API."
  (api.macros/ns-handler *ns* +auth))
