(ns metabase.indexes.api
  "CRUD over managed table indexes, mounted at `/api/indexes`. A managed index belongs to a transform's output, so
  reads require read access to that transform (or table) and mutations require write access to it -- the same
  permission editing the transform itself uses. Validation and the `:status` default live in the model's hooks;
  these endpoints use toucan2 directly."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.indexes.schema :as schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private TableIndex
  [:map
   [:id ms/PositiveInt]
   [:transform_id [:maybe ms/PositiveInt]]
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

(defn- read-check-owner!
  "Read-check the transform a request belongs to (its target's owner). Falls back to the table for a request not
  bound to a transform."
  [{:keys [transform_id table_id]}]
  (if transform_id
    (api/read-check :model/Transform transform_id)
    (api/read-check :model/Table table_id)))

(defn- write-check-owner!
  "Write-check the transform a request belongs to -- the permission editing that transform uses."
  [{:keys [transform_id]}]
  (api/write-check :model/Transform transform_id))

(api.macros/defendpoint :get "/" :- [:map [:data [:sequential TableIndex]]]
  "List the managed indexes for a transform or a table. At least one of `transform-id` / `table-id` is required."
  [_route-params
   {:keys [transform-id table-id]} :- [:map
                                       [:transform-id {:optional true} [:maybe ms/PositiveInt]]
                                       [:table-id {:optional true} [:maybe ms/PositiveInt]]]]
  (api/check-400 (or transform-id table-id) (tru "transform_id or table_id is required."))
  (if transform-id
    (api/read-check :model/Transform transform-id)
    (api/read-check :model/Table table-id))
  (let [where (cond-> [:and]
                transform-id (conj [:= :transform_id transform-id])
                table-id     (conj [:= :table_id table-id]))]
    {:data (mapv present (t2/select :model/TableIndex {:where where, :order-by [[:id :asc]]}))}))

(api.macros/defendpoint :get "/:id" :- TableIndex
  "Fetch a single managed index (e.g. to poll its status)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (let [req (api/check-404 (t2/select-one :model/TableIndex :id id))]
    (read-check-owner! req)
    (present req)))

(api.macros/defendpoint :post "/" :- TableIndex
  "Create a managed index on a transform's target table. Requires write access to the transform."
  [_route-params
   _query-params
   {:keys [transform_id structured]} :- [:map
                                         [:transform_id ms/PositiveInt]
                                         [:structured :map]]]
  (api/write-check :model/Transform transform_id)
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
  "Replace the structured definition of a managed index, resetting it to pending."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [structured]} :- [:map [:structured :map]]]
  (write-check-owner! (api/check-404 (t2/select-one :model/TableIndex :id id)))
  (t2/update! :model/TableIndex id {:structured    structured
                                    :index_name    (index-name structured)
                                    :status        :pending
                                    :error_message nil})
  (present (t2/select-one :model/TableIndex :id id)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a managed index."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (write-check-owner! (api/check-404 (t2/select-one :model/TableIndex :id id)))
  (t2/delete! :model/TableIndex :id id)
  api/generic-204-no-content)
