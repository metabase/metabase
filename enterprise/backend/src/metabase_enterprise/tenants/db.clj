(ns metabase-enterprise.tenants.db
  "Application database queries for `:model/Tenant`. The queries below follow [[::opts]]; queries that do not fit it,
  including ones returning other modules' models, live in the tenants-only section at the bottom of this namespace."
  (:require
   [metabase-enterprise.tenants.schema :as tenants.schema]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.users.db :as users.db]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [toucan2.core :as t2]))

(mr/def ::filters
  "Which Tenants a query applies to. Keys mirror the columns of `:tenant`: a scalar matches that value and a set
  matches any of its values."
  [:map {:closed true}
   [:id                   {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:slug                 {:optional true} [:or :string [:set :string]]]
   [:name                 {:optional true} [:or :string [:set :string]]]
   [:is_active            {:optional true} :boolean]
   [:tenant_collection_id {:optional true} [:or ::lib.schema.id/collection [:set ::lib.schema.id/collection]]]])

(mr/def ::opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::tenants.schema/tenant.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::tenants.schema/tenant.column
                                              [:tuple ::tenants.schema/tenant.column [:enum :asc :desc]]]]]
    [:limit    {:optional true} ms/PositiveInt]
    [:offset   {:optional true} ms/IntGreaterThanOrEqualToZero]]])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/Tenant columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-tenants :- [:sequential ::tenants.schema/tenant.partial]
  "The Tenants matching `opts`."
  ([]
   (select-tenants nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-tenant :- [:maybe ::tenants.schema/tenant.partial]
  "The first Tenant matching `opts`, or nil."
  ([]
   (select-one-tenant nil))
  ([{:keys [columns] :as opts} :- [:maybe ::opts]]
   (apply t2/select-one (->model columns) (->args opts))))

(mu/defn tenant-exists? :- :boolean
  "Whether a Tenant matching `opts` exists."
  [opts :- [:maybe ::opts]]
  (apply t2/exists? :model/Tenant (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-tenant! :- ::tenants.schema/tenant
  "Insert the Tenant `row` and return the inserted instance."
  [row :- ::tenants.schema/tenant.create]
  (t2/insert-returning-instance! :model/Tenant row))

(mu/defn update-tenants! :- :int
  "Apply `changes` to every Tenant matching `opts`, returning the number updated."
  [opts    :- [:maybe ::opts]
   changes :- ::tenants.schema/tenant.update]
  (apply t2/update! :model/Tenant (conj (->kv-args opts) changes)))

;;; ------------------------------- Queries used only by the tenants module -------------------------------

(mu/defn reducible-select-tenant-attributes
  "Reducible attribute maps of the Tenants that have attributes."
  []
  (t2/select-fn-reducible :attributes [:model/Tenant :attributes]
                          {:where [:and
                                   [:not= :attributes nil]
                                   [:not= :attributes "{}"]]}))

(mu/defn select-tenant-names-and-ids-by-collection
  "A map of root Collection ID to `[name id]` for the Tenants owning `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-fn->fn :tenant_collection_id (juxt :name :id) :model/Tenant :tenant_collection_id [:in collection-ids]))

(mu/defn tenant-name-or-slug-exists?
  "Whether a Tenant named `tenant-name` or with `slug` exists."
  [tenant-name :- :string
   slug        :- :string]
  (t2/exists? :model/Tenant {:where [:or
                                     [:= :slug slug]
                                     [:= :name tenant-name]]}))

(mu/defn other-tenant-named?
  "Whether a Tenant other than `tenant-id` is named `tenant-name`."
  [tenant-name :- :string
   tenant-id   :- ms/PositiveInt]
  (t2/exists? :model/Tenant :name tenant-name :id [:not= tenant-id]))

(mu/defn count-active-tenant-members
  "Rows of `:tenant_id` and `:count` of active personal Users for `tenant-ids`."
  [tenant-ids :- [:sequential ms/PositiveInt]]
  (t2/query {:select   [[:tenant_id] [[:count :*] :count]]
             :from     [(t2/table-name :model/User)]
             :where    [:and
                        [:in :tenant_id tenant-ids]
                        [:= :type "personal"]
                        :is_active]
             :group-by [:tenant_id]}))

(mu/defn update-tenant-users-deactivated!
  "Deactivate the active Users of the Tenant with `tenant-id`, marking them as deactivated with it, returning the
  number updated."
  [tenant-id :- ms/PositiveInt]
  (users.db/update-users! {:is_active true :tenant_id tenant-id} {:is_active false :deactivated_with_tenant true}))

(mu/defn update-tenant-users-reactivated!
  "Reactivate the Users of the Tenant with `tenant-id` that were deactivated with it, returning the number updated."
  [tenant-id :- ms/PositiveInt]
  (users.db/update-users! {:is_active false :tenant_id tenant-id :deactivated_with_tenant true}
                          {:is_active true :deactivated_with_tenant nil}))

(mu/defn select-user-tenant-id
  "The Tenant ID of the User with `user-id`."
  [user-id :- ::lib.schema.id/user]
  (:tenant_id (users.db/select-one-user {:id user-id :columns [:tenant_id]})))

(mu/defn collection-with-archived-state
  "The Collection with `collection-id` if its archived flag is `archived?`, or nil."
  [collection-id :- ::lib.schema.id/collection
   archived?     :- :boolean]
  (t2/select-one :model/Collection :id collection-id :archived archived?))

(mu/defn descendant-collection-ids
  "The IDs of the Collections under the Collection with `collection-id`."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-pks-set :model/Collection :location [:like (str "/" collection-id "/%")]))

(mu/defn insert-collection!
  "Insert `collection` and return its ID."
  [collection :- ::collections.schema/collection.create]
  (t2/insert-returning-pk! :model/Collection collection))

(mu/defn delete-permissions-with-objects!
  "Delete the Permissions rows for `objects`, returning the number deleted."
  [objects :- [:sequential :string]]
  (t2/query-one {:delete-from :permissions
                 :where       [:in :object objects]}))
