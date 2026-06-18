(ns metabase.indexes.api
  "CRUD over managed table indexes, mounted at `/api/indexes`. A managed index belongs to a transform's output, so
  reads require read access to that transform and mutations require write access to it -- the same permission editing
  the transform itself uses. Validation and the `:status` default live in the model's hooks; these endpoints use
  toucan2 directly."
  (:require
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.indexes.reconcile :as reconcile]
   [metabase.indexes.schema :as schema]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private TableIndex
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

(def ^:private MergedIndex
  [:map
   [:name              [:maybe ms/NonBlankString]]
   [:kind              :keyword]
   [:access-method     [:maybe :string]]
   [:is-unique         :boolean]
   [:is-primary        :boolean]
   [:is-valid          :boolean]
   [:key-columns       [:sequential [:maybe :string]]]
   [:include-columns   [:sequential [:maybe :string]]]
   [:partial-predicate [:maybe :string]]
   [:definition        [:maybe :string]]
   [:metabase_managed     :boolean]
   [:present_in_warehouse :boolean]
   ;; lifecycle -- present only on managed entries
   [:id               {:optional true} ms/PositiveInt]
   [:transform_id     {:optional true} ms/PositiveInt]
   [:structured       {:optional true} ::schema/index-structured]
   [:status           {:optional true} [:enum :pending :running :succeeded :failed :dropped]]
   [:error_message    {:optional true} [:maybe :string]]
   [:created_by       {:optional true} [:maybe ms/PositiveInt]]
   [:created_at       {:optional true} :any]
   [:updated_at       {:optional true} :any]
   [:last_executed_at {:optional true} [:maybe :any]]])

(defn- index-name
  "Physical index name for a structured index: a named kind's own `:name`, else a stable name from its `:kind` (so a
  transform holds at most one sortkey/order-by/etc, enforced by the unique constraint)."
  [structured]
  (or (:name structured) (name (:kind structured))))

(defn- read-check-owner!
  "Read-check the transform a managed index belongs to -- the permission viewing that transform uses."
  [{:keys [transform_id]}]
  (api/read-check :model/Transform transform_id))

(defn- write-check-owner!
  "Write-check the transform a managed index belongs to -- the permission editing that transform uses."
  [{:keys [transform_id]}]
  (api/write-check :model/Transform transform_id))

(api.macros/defendpoint :get "/" :- [:map [:data [:sequential MergedIndex]]]
  "List a transform's index hints: Metabase-managed indexes merged with the indexes physically present in the
  warehouse. Each entry is flagged `:metabase_managed` and `:present_in_warehouse`."
  [_route-params
   {:keys [transform-id]} :- [:map [:transform-id ms/PositiveInt]]]
  (api/read-check :model/Transform transform-id)
  (let [transform (t2/select-one :model/Transform transform-id)
        {:keys [database schema] table-name :name} (:target transform)
        managed   (t2/select :model/TableIndex :transform_id transform-id {:order-by [[:id :asc]]})
        warehouse (when database
                    (reconcile/fetch-warehouse-indexes
                     (t2/select-one :model/Database database) schema table-name))]
    {:data (reconcile/merge-indexes managed (or warehouse []))}))

(api.macros/defendpoint :get "/:id" :- TableIndex
  "Fetch a single managed index (e.g. to poll its status)."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (doto (api/check-404 (t2/select-one :model/TableIndex :id id))
    (read-check-owner!)))

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
    (t2/insert-returning-instance! :model/TableIndex
                                   {:transform_id transform_id
                                    :index_name   idx-name
                                    :structured   structured
                                    :created_by   api/*current-user-id*})))

(api.macros/defendpoint :put "/:id" :- TableIndex
  "Replace the structured definition of a managed index, resetting it to pending."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]
   _query-params
   {:keys [structured]} :- [:map [:structured :map]]]
  (write-check-owner! (api/check-404 (t2/select-one :model/TableIndex :id id)))
  ;; toucan2 has no instance-returning update, so re-select; in a tx so we return exactly what we wrote.
  (t2/with-transaction [_conn]
    (t2/update! :model/TableIndex id {:structured    structured
                                      :index_name    (index-name structured)
                                      :status        :pending
                                      :error_message nil})
    (t2/select-one :model/TableIndex :id id)))

#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a managed index."
  [{:keys [id]} :- [:map [:id ms/PositiveInt]]]
  (write-check-owner! (api/check-404 (t2/select-one :model/TableIndex :id id)))
  (t2/delete! :model/TableIndex :id id)
  api/generic-204-no-content)
