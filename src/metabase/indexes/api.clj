(ns metabase.indexes.api
  "Table-index endpoints, mounted at `/api/indexes`. Two concepts: `GET /` is a transform's merged index reality
  (warehouse indexes plus managed requests); `/request/:id` is CRUD over a single index request. An index
  belongs to a transform's output, so reads require read access to that transform and mutations require write access
  -- the same permission editing the transform itself uses. Validation and the `:status` default live in the model's
  hooks; these endpoints use toucan2 directly."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.indexes.reconcile :as reconcile]
   [metabase.indexes.schema :as schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private RequestIndex
  "A single index request -- one `metabase_table_indexes` row, the `/request/:id` resource."
  [:map
   [:id ms/PositiveInt]
   [:transform_id ms/PositiveInt]
   [:index_name ms/NonBlankString]
   ;; The real structured schema (not a bare `:map`) so response coercion doesn't strip its keys.
   [:structured ::schema/index-structured]
   [:status [:enum :pending :running :succeeded :failed :dropped]]
   [:error_message [:maybe :string]]
   [:created_by [:maybe ms/PositiveInt]]
   [:created_at :any]
   [:updated_at :any]
   [:last_executed_at [:maybe :any]]])

(def ^:private Index
  "An index on a transform's target: as observed in the warehouse, plus a `:request` when Metabase manages it. Built
  by [[metabase.indexes.reconcile/merge-indexes]]."
  [:map
   [:metabase_managed     :boolean]
   [:present_in_warehouse :boolean]
   [:name                 [:maybe :string]]
   [:kind                 :keyword]
   [:key_columns          [:sequential :string]]
   [:include_columns      [:sequential [:maybe :string]]]
   [:is_unique            :boolean]
   [:is_primary           :boolean]
   [:is_valid             :boolean]
   [:partial_predicate    [:maybe :string]]
   [:access_method        [:maybe :string]]
   [:request {:optional true} RequestIndex]])

(defn- read-check-owner!
  "Read-check the transform an index request belongs to -- the permission viewing that transform uses."
  [{:keys [transform_id]}]
  (api/read-check :model/Transform transform_id))

(defn- write-check-owner!
  "Write-check the transform an index request belongs to -- the permission editing that transform uses."
  [{:keys [transform_id]}]
  (api/write-check :model/Transform transform_id))

(api.macros/defendpoint :get "/" :- [:map [:data [:sequential Index]]]
  "A transform's indexes: those physically in the warehouse, merged with its managed requests. Each entry is flagged
  `:metabase_managed`; managed ones also carry `:request` (status + definition)."
  [_route-params
   {:keys [transform-id]} :- [:map [:transform-id ms/PositiveInt]]]
  (api/read-check :model/Transform transform-id)
  (let [{:keys [database schema] table-name :name} (:target (t2/select-one :model/Transform transform-id))
        managed   (t2/select :model/TableIndex :transform_id transform-id {:order-by [[:id :asc]]})
        warehouse (reconcile/fetch-warehouse-indexes (t2/select-one :model/Database database) schema table-name)]
    {:data (reconcile/merge-indexes managed warehouse)}))

(api.macros/defendpoint :get "/request/:id" :- RequestIndex
  "Fetch a single index request (e.g. to poll its status)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (doto (api/check-404 (t2/select-one :model/TableIndex :id id))
    (read-check-owner!)))

(api.macros/defendpoint :post "/request" :- RequestIndex
  "Create an index request on a transform's target table. Requires write access to the transform. Listed via `GET /`,
  not under `/request`."
  [_route-params
   _query-params
   {:keys [transform_id structured]} :- [:map
                                         [:transform_id ms/PositiveInt]
                                         [:structured :map]]]
  (api/write-check :model/Transform transform_id)
  (let [idx-name (reconcile/index-name structured)]
    ;; (transform_id, index_name) is unique; reject a duplicate cleanly instead of hitting the constraint.
    (api/check-400 (not (t2/exists? :model/TableIndex :transform_id transform_id :index_name idx-name))
                   (tru "An index named \"{0}\" already exists for this transform." idx-name))
    (t2/insert-returning-instance! :model/TableIndex
                                   {:transform_id transform_id
                                    :index_name   idx-name
                                    :structured   structured
                                    :created_by   api/*current-user-id*})))

(api.macros/defendpoint :put "/request/:id" :- RequestIndex
  "Replace the structured definition of an index request, resetting it to pending."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [structured]} :- [:map [:structured :map]]]
  (write-check-owner! (api/check-404 (t2/select-one :model/TableIndex :id id)))
  ;; toucan2 has no instance-returning update, so re-select; in a tx so we return exactly what we wrote.
  (t2/with-transaction [_conn]
    (t2/update! :model/TableIndex id {:structured    structured
                                      :index_name    (reconcile/index-name structured)
                                      :status        :pending
                                      :error_message nil})
    (t2/select-one :model/TableIndex :id id)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/request/:id"
  "Delete an index request."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (write-check-owner! (api/check-404 (t2/select-one :model/TableIndex :id id)))
  (t2/delete! :model/TableIndex :id id)
  api/generic-204-no-content)
