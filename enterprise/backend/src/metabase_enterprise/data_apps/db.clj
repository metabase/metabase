(ns metabase-enterprise.data-apps.db
  "Application database queries for `:model/DataApp`. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration
  methods.

  The queries below follow [[::data-app-opts]]; queries that do not fit it, and queries returning other modules'
  models, live in the data-apps-only section at the bottom of this namespace."
  (:require
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase.permissions.db :as permissions.db]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.util.query :as u.query]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(mr/def ::data-app-filters
  "Which DataApps a query applies to. Keys mirror the columns of `data_app`: a scalar matches that value and a set
  matches any of its values."
  [:map {:closed true}
   [:id         {:optional true} [:or ms/PositiveInt [:set ms/PositiveInt]]]
   [:name       {:optional true} [:or :string [:set :string]]]
   [:enabled    {:optional true} :boolean]
   [:draft      {:optional true} :boolean]
   [:sync_error {:optional true} [:maybe :string]]])

(mr/def ::data-app-opts
  "The filters above plus the columns to select and the order to return them in."
  [:merge
   ::data-app-filters
   [:map {:closed true}
    [:columns  {:optional true} [:sequential ::data-apps.schema/data-app.column]]
    [:order-by {:optional true} [:sequential [:or
                                              ::data-apps.schema/data-app.column
                                              [:tuple ::data-apps.schema/data-app.column [:enum :asc :desc]]]]]]])

(def ^:private non-blob-columns
  "Columns to select for normal data-app metadata reads, excluding the raw bundle blob."
  [:id :name :display_name :description :bundle_path :enabled :allowed_hosts
   :resource_collection_id :permission_group_id :table_ids :draft
   :bundle_hash :last_synced_sha :last_synced_at :sync_error
   :created_at :updated_at])

(defn- ->model
  [columns]
  (u.query/model-with-columns :model/DataApp columns))

(defn- ->args
  [opts]
  (u.query/opts->args opts))

(defn- ->kv-args
  [opts]
  (u.query/opts->kv-args opts))

;;; ------------------------------------------------- Reads -------------------------------------------------

(mu/defn select-data-apps :- [:sequential ::data-apps.schema/data-app.partial]
  "The DataApps matching `opts`."
  ([]
   (select-data-apps nil))
  ([{:keys [columns] :as opts} :- [:maybe ::data-app-opts]]
   (apply t2/select (->model columns) (->args opts))))

(mu/defn select-one-data-app :- [:maybe ::data-apps.schema/data-app.partial]
  "The first DataApp matching `opts`, or nil."
  ([]
   (select-one-data-app nil))
  ([{:keys [columns] :as opts} :- [:maybe ::data-app-opts]]
   (apply t2/select-one (->model columns) (->args opts))))

(mu/defn data-app-exists? :- :boolean
  "Whether a DataApp matching `opts` exists."
  [opts :- [:maybe ::data-app-opts]]
  (apply t2/exists? :model/DataApp (->args opts)))

;;; ------------------------------------------------ Writes -------------------------------------------------

(mu/defn insert-data-app! :- :int
  "Insert the DataApp `row`, returning the number of rows inserted."
  [row :- ::data-apps.schema/data-app.create]
  (t2/insert! :model/DataApp row))

(mu/defn update-data-apps! :- :int
  "Apply `changes` to every DataApp matching `opts`, returning the number updated."
  [opts    :- [:maybe ::data-app-opts]
   changes :- ::data-apps.schema/data-app.update]
  (apply t2/update! :model/DataApp (conj (->kv-args opts) changes)))

(mu/defn delete-data-apps! :- :int
  "Delete every DataApp matching `opts`, returning the number deleted."
  [opts :- [:maybe ::data-app-opts]]
  (apply t2/delete! :model/DataApp (->args opts)))

;;; ------------------------------- Queries used only by the data-apps module -------------------------------

(mu/defn select-one-non-blob-data-app :- [:maybe ::data-apps.schema/data-app.partial]
  "The DataApp with `data-app-id` without its bundle, or nil."
  [data-app-id :- ms/PositiveInt]
  (select-one-data-app {:id data-app-id :columns non-blob-columns}))

(mu/defn select-one-non-blob-data-app-by-slug :- [:maybe ::data-apps.schema/data-app.partial]
  "The DataApp named `slug` without its bundle, or nil."
  [slug :- :string]
  (select-one-data-app {:name slug :columns non-blob-columns}))

(mu/defn select-one-enabled-non-blob-data-app-by-slug :- [:maybe ::data-apps.schema/data-app.partial]
  "The enabled DataApp named `slug` without its bundle, or nil."
  [slug :- :string]
  (select-one-data-app {:name slug :enabled true :columns non-blob-columns}))

(mu/defn select-non-blob-data-apps :- [:sequential ::data-apps.schema/data-app.partial]
  "Every DataApp without its bundle, ordered by display name; only the enabled, error-free ones when `available?`."
  [available? :- [:maybe :boolean]]
  (select-data-apps (cond-> {:columns non-blob-columns, :order-by [:display_name]}
                      available? (assoc :enabled true, :sync_error nil))))

(mu/defn select-data-apps-sync-info :- [:sequential ::data-apps.schema/data-app.partial]
  "The sync-relevant columns of every DataApp."
  []
  (select-data-apps {:columns [:name :display_name :description :allowed_hosts :bundle_path :bundle_hash
                               :sync_error]}))

(mu/defn update-data-app-by-id! :- :int
  "Apply `changes` to the DataApp with `data-app-id`, returning the number updated."
  [data-app-id :- ms/PositiveInt
   changes     :- ::data-apps.schema/data-app.update]
  (update-data-apps! {:id data-app-id} changes))

(mu/defn update-data-app-by-slug! :- :int
  "Apply `changes` to the DataApp named `slug`, returning the number updated."
  [slug    :- :string
   changes :- ::data-apps.schema/data-app.update]
  (update-data-apps! {:name slug} changes))

(mu/defn delete-data-app-by-slug! :- :int
  "Delete the DataApp named `slug`, returning the number deleted."
  [slug :- :string]
  (delete-data-apps! {:name slug}))

(mu/defn delete-data-apps-not-named! :- :int
  "Delete non-draft DataApps whose name is not one of `slugs`, returning the number deleted."
  [slugs :- [:set :string]]
  (t2/delete! :model/DataApp :name [:not-in slugs] :draft false))

(mu/defn publish-data-app-drafts! :- :int
  "Mark drafts named by `slugs` as published, returning the number updated."
  [slugs :- [:sequential :string]]
  (update-data-apps! {:name (set slugs), :draft true} {:draft false}))

(defn table-database-id
  "The database ID for the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one-fn :db_id :model/Table :id table-id
                    {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]}))

(defn existing-table-ids
  "The IDs from `table-ids` that belong to existing Tables."
  [table-ids]
  (if (seq table-ids)
    (t2/select-pks-set :model/Table :id [:in table-ids]
                       {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]})
    #{}))

(defn users-for-permission-warnings
  "The fields needed to calculate permission warnings for Users with `user-ids`."
  [user-ids]
  (t2/select [:model/User :id :is_superuser :is_active :tenant_id] :id [:in user-ids]))

(defn metrics-by-ids
  "The metric Cards with `metric-ids`."
  [metric-ids]
  (if (seq metric-ids)
    (t2/select :model/Card :id [:in metric-ids] :type "metric")
    []))

(defn permission-group
  "The permission group with `group-id`, or nil."
  [group-id]
  (permissions.db/select-one-permissions-group {:id group-id}))

(defn insert-permission-group!
  "Insert a permission group and return it."
  [row]
  (permissions.db/insert-permissions-group! row))

(defn update-permission-group!
  "Apply `changes` to the permission group with `group-id`."
  [group-id changes]
  (permissions.db/update-permissions-groups! {:id group-id} changes))

(defn delete-permission-group!
  "Delete the permission group with `group-id`."
  [group-id]
  (permissions.db/delete-permissions-groups! {:id group-id}))

(defn data-app-group-ids
  "The IDs of permission groups owned by data apps."
  []
  (permissions.db/select-permissions-group-pks {:is_data_app_group true}))

(defn databases-with-legacy-permissions
  "Database IDs with legacy View Data permissions from groups not owned by apps."
  [database-ids]
  (if (seq database-ids)
    (t2/select-fn-set :db_id :model/DataPermissions
                      {:select [:p.db_id]
                       :from [[:data_permissions :p]]
                       :join [[:permissions_group :g] [:= :g.id :p.group_id]]
                       :where [:and
                               [:in :p.db_id database-ids]
                               [:= :p.perm_type "perms/view-data"]
                               [:= :p.perm_value "legacy-no-self-service"]
                               [:= :g.is_data_app_group false]]})
    #{}))

(defn resource-collection
  "The resource collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

(defn insert-resource-collection!
  "Insert a resource collection and return it."
  [row]
  (t2/insert-returning-instance! :model/Collection row))

(defn update-resource-collection!
  "Apply `changes` to the resource collection with `collection-id`."
  [collection-id changes]
  (t2/update! :model/Collection :id collection-id changes))

(defn delete-resource-collection!
  "Delete the resource collection with `collection-id`."
  [collection-id]
  (t2/delete! :model/Collection :id collection-id))

(defn permissions-for-paths-excluding-group
  "Permission grants for `paths`, excluding `group-id`."
  [paths group-id]
  (t2/select [:model/Permissions :group_id :object]
             :object [:in paths]
             :group_id [:not= group-id]))

(defn table-details
  "Table names and database details for `table-ids`."
  [table-ids]
  (t2/select :model/Table
             {:select [:t.id
                       [:t.display_name :name]
                       :t.schema
                       [:t.db_id :database_id]
                       [:d.name :database_name]]
              :from [(warehouse-schema-overlay/table-query {:alias :t})]
              :join [[:metabase_database :d] [:= :d.id :t.db_id]]
              :where [:in :t.id table-ids]
              :order-by [[:d.name :asc] [:t.schema :asc] [:t.display_name :asc]]}))

(defn sandboxed-user-table-access
  "Sandboxed table access from non-data-app groups for the requested users and tables."
  [user-ids table-ids]
  (t2/query {:select-distinct [[:pgm.user_id :user_id]
                               [:s.table_id :table_id]]
             :from [[:permissions_group_membership :pgm]]
             :join [[:sandboxes :s] [:= :s.group_id :pgm.group_id]
                    [:permissions_group :pg] [:= :pg.id :pgm.group_id]]
             :where [:and
                     [:in :pgm.user_id user-ids]
                     [:in :s.table_id table-ids]
                     [:not :pg.is_data_app_group]]}))

(defn unrestricted-user-table-access
  "Unrestricted table access from non-data-app groups for the requested users and tables."
  [user-ids table-ids]
  (t2/query {:select-distinct [[:pgm.user_id :user_id]
                               [:t.id :table_id]]
             :from [[:permissions_group_membership :pgm]]
             :join [[:data_permissions :dp] [:= :dp.group_id :pgm.group_id]
                    [:permissions_group :pg] [:= :pg.id :pgm.group_id]
                    (warehouse-schema-overlay/table-query {:alias :t, :user-settings? false})
                    [:and
                     [:= :t.db_id :dp.db_id]
                     [:or
                      [:= :dp.table_id nil]
                      [:= :dp.table_id :t.id]]]]
             :where [:and
                     [:in :pgm.user_id user-ids]
                     [:in :t.id table-ids]
                     [:not :pg.is_data_app_group]
                     [:= :dp.perm_type (u/qualified-name :perms/view-data)]
                     [:= :dp.perm_value "unrestricted"]]}))

(defn active-group-members
  "Active user memberships for `group-ids`, including API-key users."
  [group-ids]
  (t2/query {:select [[:pgm.group_id :group_id]
                      [:u.id :id]
                      :u.is_superuser
                      :u.email]
             :from [[:permissions_group_membership :pgm]]
             :join [[:core_user :u] [:= :u.id :pgm.user_id]]
             :where [:and
                     [:in :pgm.group_id group-ids]
                     [:= :u.is_active true]]}))
