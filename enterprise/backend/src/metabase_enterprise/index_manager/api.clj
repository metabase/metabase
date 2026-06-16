(ns metabase-enterprise.index-manager.api
  "Superuser CRUD over managed index requests, scoped to a transform. Mounted at `/api/ee/index-manager` behind the
  transforms premium feature. Validation and the `:status` default live in the model's hooks; these endpoints use
  toucan2 directly."
  (:require
   [metabase-enterprise.index-manager.schema :as schema]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.api.routes.common :refer [+auth]]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private TableIndex
  [:map
   [:id ms/PositiveInt]
   [:transform_id ms/PositiveInt]
   [:table_id [:maybe ms/PositiveInt]]
   [:index_name ms/NonBlankString]
   ;; The real structured schema (not a bare `:map`) so response coercion doesn't strip its keys.
   [:structured ::schema/index-structured]
   [:status [:enum :pending :running :succeeded :failed :dropped]]
   [:error_message [:maybe :string]]
   [:created_at :any]
   [:updated_at :any]
   [:last_executed_at [:maybe :any]]])

(defn- present [req]
  (select-keys req [:id :transform_id :table_id :index_name :structured :status :error_message
                    :created_at :updated_at :last_executed_at]))

(defn- index-name
  "Physical index name for a structured index: a named kind's own `:name`, else a stable name from its `:kind` (so a
  transform holds at most one sortkey/order-by/etc, enforced by the unique constraint)."
  [structured]
  (or (:name structured) (name (:kind structured))))

(api.macros/defendpoint :get "/" :- [:map [:data [:sequential TableIndex]]]
  "List the managed index requests for a transform."
  [_route-params
   {:keys [transform-id]} :- [:map [:transform-id ms/PositiveInt]]]
  (api/check-superuser)
  {:data (mapv present (t2/select :model/TableIndex :transform_id transform-id {:order-by [[:id :asc]]}))})

(api.macros/defendpoint :post "/" :- TableIndex
  "Create a managed index request on a transform's target table."
  [_route-params
   _query-params
   {:keys [transform_id structured]} :- [:map
                                         [:transform_id ms/PositiveInt]
                                         [:structured :map]]]
  (api/check-superuser)
  ;; A managed hint may only target a transform-owned table, so the transform must exist.
  (api/check-404 (t2/exists? :model/Transform :id transform_id))
  (let [idx-name (index-name structured)]
    ;; (transform_id, index_name) is unique; reject a duplicate cleanly instead of hitting the constraint.
    (api/check-400 (not (t2/exists? :model/TableIndex :transform_id transform_id :index_name idx-name))
                   (tru "An index named \"{0}\" already exists for this transform." idx-name))
    (present (t2/insert-returning-instance! :model/TableIndex
                                            {:transform_id transform_id
                                             :index_name   idx-name
                                             :structured   structured
                                             :created_by   api/*current-user-id*}))))

(api.macros/defendpoint :put "/:id" :- TableIndex
  "Replace the structured definition of a managed index request, resetting it to pending."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [structured]} :- [:map [:structured :map]]]
  (api/check-superuser)
  (api/check-404 (t2/exists? :model/TableIndex :id id))
  (t2/update! :model/TableIndex id {:structured    structured
                                      :index_name    (index-name structured)
                                      :status        :pending
                                      :error_message nil})
  (present (t2/select-one :model/TableIndex :id id)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a managed index request."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (api/check-superuser)
  (api/check-404 (pos? (t2/delete! :model/TableIndex :id id)))
  api/generic-204-no-content)

(def ^{:arglists '([request respond raise])} routes
  "Ring routes for the Index Manager API."
  (api.macros/ns-handler *ns* +auth))
