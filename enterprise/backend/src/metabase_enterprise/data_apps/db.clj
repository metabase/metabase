(ns metabase-enterprise.data-apps.db
  "Application database queries for the data-apps module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private non-blob-columns
  "Columns to select for normal data-app metadata reads, excluding the raw bundle blob."
  [:model/DataApp :id :name :display_name :description :bundle_path :enabled :allowed_hosts
   :resource_collection_id :permission_group_id :table_ids :draft
   :bundle_hash :last_synced_sha :last_synced_at :sync_error
   :created_at :updated_at])

(mu/defn non-blob-data-app
  "The DataApp with `data-app-id` without its bundle, or nil."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one non-blob-columns :id data-app-id))

(mu/defn non-blob-data-app-by-slug
  "The DataApp named `slug` without its bundle, or nil."
  [slug :- :string]
  (t2/select-one non-blob-columns :name slug))

(mu/defn enabled-non-blob-data-app-by-slug
  "The enabled DataApp named `slug` without its bundle, or nil."
  [slug :- :string]
  (t2/select-one non-blob-columns :name slug :enabled true))

(mu/defn non-blob-data-apps
  "Every DataApp without its bundle, ordered by display name; only the enabled, error-free ones when `available?`."
  [available? :- [:maybe :boolean]]
  (t2/select non-blob-columns
             (cond-> {:order-by [[:display_name :asc]]}
               available? (assoc :where [:and
                                         [:= :enabled true]
                                         [:= :sync_error nil]]))))

(mu/defn data-app-bundle
  "The bundle bytes of the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one-fn :bundle :model/DataApp :id data-app-id))

(mu/defn data-apps-sync-info
  "The sync-relevant columns of every DataApp."
  []
  (t2/select [:model/DataApp :name :display_name :description :allowed_hosts :bundle_path :bundle_hash :sync_error]))

(defn table-database-id
  "The database ID for the Table with `table-id`, or nil."
  [table-id]
  (t2/select-one-fn :db_id :model/Table :id table-id))

(defn existing-table-ids
  "The IDs from `table-ids` that belong to existing Tables."
  [table-ids]
  (if (seq table-ids)
    (t2/select-pks-set :model/Table :id [:in table-ids])
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

(mu/defn data-app-exists?
  "Whether a DataApp named `slug` exists."
  [slug :- :string]
  (t2/exists? :model/DataApp :name slug))

(mu/defn insert-data-app!
  "Insert the DataApp `row`."
  [row :- ::data-apps.schema/data-app.update]
  (t2/insert! :model/DataApp row))

(mu/defn update-data-app!
  "Apply `changes` to the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt
   changes     :- ::data-apps.schema/data-app.update]
  (t2/update! :model/DataApp :id data-app-id changes))

(mu/defn update-data-app-by-slug!
  "Apply `changes` to the DataApp named `slug`."
  [slug    :- :string
   changes :- ::data-apps.schema/data-app.update]
  (t2/update! :model/DataApp :name slug changes))

(mu/defn delete-data-app-by-slug!
  "Delete the DataApp named `slug`, returning the number deleted."
  [slug :- :string]
  (t2/delete! :model/DataApp :name slug))

(mu/defn delete-data-apps-not-named!
  "Delete non-draft DataApps whose name is not one of `slugs`, returning the number deleted."
  [slugs :- [:set :string]]
  (t2/delete! :model/DataApp :name [:not-in slugs] :draft false))

(mu/defn delete-all-data-apps!
  "Delete every non-draft DataApp, returning the number deleted."
  []
  (t2/delete! :model/DataApp :draft false))

(defn publish-data-app-drafts!
  "Mark drafts named by `slugs` as published."
  [slugs]
  (t2/update! :model/DataApp :name [:in slugs] :draft true {:draft false}))

(defn permission-group
  "The permission group with `group-id`, or nil."
  [group-id]
  (t2/select-one :model/PermissionsGroup :id group-id))

(defn insert-permission-group!
  "Insert a permission group and return it."
  [row]
  (t2/insert-returning-instance! :model/PermissionsGroup row))

(defn update-permission-group!
  "Apply `changes` to the permission group with `group-id`."
  [group-id changes]
  (t2/update! :model/PermissionsGroup :id group-id changes))

(defn delete-permission-group!
  "Delete the permission group with `group-id`."
  [group-id]
  (t2/delete! :model/PermissionsGroup :id group-id))

(defn data-app-group-ids
  "The IDs of permission groups owned by data apps."
  []
  (t2/select-pks-set :model/PermissionsGroup :is_data_app_group true))

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

(defn non-router-database-ids
  "The IDs of databases that are not routed through another database."
  []
  (t2/select-pks-set :model/Database :router_database_id nil))

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
              :from [[:metabase_table :t]]
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
                    [:metabase_table :t] [:and
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
