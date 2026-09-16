(ns metabase-enterprise.data-apps.db
  "Application database queries for the data-apps module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(def ^:private non-blob-columns
  "Columns to select for normal data-app metadata reads, excluding the raw bundle blob."
  [:model/DataApp :id :name :display_name :description :version :bundle_path :enabled :allowed_hosts
   :resource_collection_id :table_ids :draft
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

(defn- read-scope-clause
  [scope]
  (if (= scope :all)
    [:= 1 1]
    [:in :id ^:allow-subquery
     {:select [:dag.data_app_id]
      :from [[:data_app_group :dag]]
      :join [[:permissions_group_membership :pgm] [:= :pgm.group_id :dag.permission_group_id]
             [:core_user :u] [:= :u.id :pgm.user_id]]
      :where [:and [:= :u.id (:user-id scope)] [:= :u.tenant_id nil]]}]))

(mu/defn non-blob-data-apps
  "DataApps in the read scope without bundles, ordered by display name. Optionally restrict to enabled, error-free apps."
  [scope :- [:or [:= :all] [:map [:user-id [:maybe ms/PositiveInt]]]]
   available? :- [:maybe :boolean]]
  (t2/select non-blob-columns
             {:order-by [[:display_name :asc]]
              :where (cond-> [:and (read-scope-clause scope)]
                       available? (conj [:= :enabled true] [:= :sync_error nil]))}))

(defn readable-data-app?
  "Whether the app exists in the read scope."
  [scope app-id]
  (t2/exists? :model/DataApp :id app-id {:where (read-scope-clause scope)}))

(mu/defn data-app-bundle
  "The bundle bytes of the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one-fn :bundle :model/DataApp :id data-app-id))

(mu/defn data-apps-sync-info
  "The sync-relevant columns of every DataApp."
  []
  (t2/select [:model/DataApp :name :display_name :description :version :allowed_hosts :bundle_path
              :bundle_hash :sync_error]))

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

(defn app-assignments
  "Assignments for the requested apps."
  [app-ids]
  (if (seq app-ids)
    (t2/select :model/DataAppGroup :data_app_id [:in app-ids])
    []))

(defn assigned-groups
  "Groups assigned to an app, ordered by name."
  [app-id]
  (t2/select :model/PermissionsGroup
             {:join [[:data_app_group :dag] [:= :dag.permission_group_id :permissions_group.id]]
              :where [:= :dag.data_app_id app-id]
              :order-by [:%lower.name]}))

(defn insert-assignments!
  "Assign groups to an app. The unique constraint rejects concurrent duplicates."
  [app-id group-ids]
  (t2/insert! :model/DataAppGroup
              (mapv (fn [group-id] {:data_app_id app-id :permission_group_id group-id}) group-ids)))

(defn delete-assignment!
  "Remove one group assignment."
  [app-id group-id]
  (t2/delete! :model/DataAppGroup :data_app_id app-id :permission_group_id group-id))

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

(defn group-sandboxes
  "Sandbox policies for the requested groups and tables."
  [group-ids table-ids]
  (t2/select [:model/Sandbox :group_id :table_id]
             :group_id [:in group-ids] :table_id [:in table-ids]))

(defn group-impersonations
  "Connection impersonation policies for the requested groups and databases."
  [group-ids database-ids]
  (t2/select [:model/ConnectionImpersonation :group_id :db_id]
             :group_id [:in group-ids] :db_id [:in database-ids]))
