(ns metabase-enterprise.data-apps.db
  "Application database queries for the data-apps module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase.util :as u]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(def non-blob-columns
  "Every DataApp column except the raw bundle blob."
  [:id :entity_id :name :display_name :description :version :bundle_path :enabled :allowed_hosts
   :resource_collection_id :permission_group_id :table_ids :bundle_hash :created_at :updated_at])

(def ^:private non-blob-model
  (into [:model/DataApp] non-blob-columns))

(mu/defn data-app
  "The DataApp with `data-app-id` without its bundle, or nil."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one non-blob-model :id data-app-id))

(mu/defn data-app-by-slug
  "The DataApp named `slug` without its bundle, or nil."
  [slug :- :string]
  (t2/select-one non-blob-model :name slug))

(mu/defn enabled-data-app-by-slug
  "The enabled DataApp named `slug` without its bundle, or nil."
  [slug :- :string]
  (t2/select-one non-blob-model :name slug :enabled true))

(mu/defn data-apps
  "Every DataApp without its bundle, ordered by display name; only the enabled ones when `available?`."
  [available? :- [:maybe :boolean]]
  (t2/select non-blob-model
             (cond-> {:order-by [[:display_name :asc]]}
               available? (assoc :where [:= :enabled true]))))

(mu/defn data-app-bundle
  "The bundle bytes of the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one-fn :bundle [:model/DataApp :bundle] :id data-app-id))

(mu/defn reducible-data-apps-with-bundles
  "A reducible of the DataApp rows, bundles included, whose `filter-column` is one of `filter-ids` (every row when
  `filter-column` is nil), ordered ascending by `order-columns`."
  [filter-column :- [:maybe :keyword]
   filter-ids    :- [:maybe [:sequential [:maybe [:or :int :string]]]]
   order-columns :- [:maybe [:sequential :keyword]]]
  (t2/reducible-select [:model/DataApp :*]
                       (cond-> {}
                         filter-column       (assoc :where [:in filter-column filter-ids])
                         (seq order-columns) (assoc :order-by (mapv (fn [column] [column :asc]) order-columns)))))

(defn users-for-permission-warnings
  "The fields needed to calculate permission warnings for Users with `user-ids`."
  [user-ids]
  (t2/select [:model/User :id :is_superuser :is_active :tenant_id] :id [:in user-ids]))

(mu/defn data-app-exists?
  "Whether a DataApp named `slug` exists."
  [slug :- :string]
  (t2/exists? :model/DataApp :name slug))

(mu/defn insert-data-app!
  "Insert the DataApp `row`."
  [row :- ::data-apps.schema/data-app.update]
  (t2/insert! :model/DataApp row))

(mu/defn insert-data-app-returning-pk! :- ms/PositiveInt
  "Insert the DataApp `row`, returning its ID."
  [row :- ::data-apps.schema/data-app.update]
  (t2/insert-returning-pk! :model/DataApp row))

(mu/defn update-data-app!
  "Apply `changes` to the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt
   changes     :- ::data-apps.schema/data-app.update]
  (t2/update! :model/DataApp :id data-app-id changes))

(mu/defn delete-data-app!
  "Delete the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt]
  (t2/delete! :model/DataApp :id data-app-id))

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

(defn resource-collection-ids
  "The IDs of the resource collections owned by data apps."
  []
  (t2/select-fn-set :resource_collection_id :model/DataApp))

(mu/defn resource-collection-id
  "The ID of the resource collection owned by the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one-fn :resource_collection_id :model/DataApp :id data-app-id))

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

(defn unarchived-resource-collection-ids
  "The IDs of every data app's resource collection that isn't archived."
  []
  (mapv :id (t2/query {:select [:c.id]
                       :from   [[:collection :c]]
                       :join   [[:data_app :d] [:= :d.resource_collection_id :c.id]]
                       :where  [:= :c.archived false]})))

(defn resource-collection?
  "Whether the collection with `collection-id` is a data app's resource collection."
  [collection-id]
  (t2/exists? :model/DataApp :resource_collection_id collection-id))

(defn data-app-by-entity-id
  "The `:id`, `:entity_id`, and `:resource_collection_id` of the DataApp with `entity-id`, or nil."
  [entity-id]
  (t2/select-one [:model/DataApp :id :entity_id :resource_collection_id] :entity_id entity-id))

(defn data-apps-with-resource-collections
  "The `:id` and `:resource_collection_id` of every DataApp that has a resource collection."
  []
  (t2/select [:model/DataApp :id :resource_collection_id] :resource_collection_id [:not= nil]))

(defn collections-by-entity-ids
  "The `:id` and `:entity_id` of the collections with `entity-ids`."
  [entity-ids]
  (if (seq entity-ids)
    (t2/query {:select [:id :entity_id] :from [:collection] :where [:in :entity_id entity-ids]})
    []))

(defn cards-by-entity-ids
  "The `:entity_id` and `:collection_id` of the cards with `entity-ids`."
  [entity-ids]
  (if (seq entity-ids)
    (t2/query {:select [:entity_id :collection_id] :from [:report_card] :where [:in :entity_id entity-ids]})
    []))

(defn actions-by-entity-ids
  "The `:entity_id` and `:collection_id` of the actions with `entity-ids`."
  [entity-ids]
  (if (seq entity-ids)
    (t2/select [:model/Action :entity_id :collection_id] :entity_id [:in entity-ids])
    []))

(defn table-ids-named
  "The IDs of the active tables in the database with `database-id` that `refs` (maps of `:schema` and `:table`)
  name: by name, and by schema when the reference has one, ignoring case."
  [database-id refs]
  (if (seq refs)
    (let [lower  #(some-> % u/lower-case-en)
          tables (t2/select [:model/Table :id :schema :name] :db_id database-id :active true
                            {:from  [(warehouse-schema-overlay/table-query {:user-settings? false})]
                             :where [:in [:lower :name] (into [] (keep (comp lower :table)) refs)]})]
      (into (sorted-set)
            (for [{:keys [schema table]} refs
                  {:keys [id] :as named} tables
                  :when (and (= (lower table) (lower (:name named)))
                             (or (nil? schema) (= (lower schema) (lower (:schema named)))))]
              id)))
    #{}))

(defn collection-dataset-queries
  "The queries of the cards and of the query actions in the collection with `collection-id`."
  [collection-id]
  (into (t2/select-fn-vec :dataset_query :model/Card :collection_id collection-id)
        (t2/select-fn-vec :dataset_query :model/QueryAction
                          {:select [:qa.*]
                           :from   [[:query_action :qa]]
                           :join   [[:action :a] [:= :a.id :qa.action_id]]
                           :where  [:= :a.collection_id collection-id]})))

(defn resource-collection
  "The resource collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one :model/Collection :id collection-id))

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

(defn table
  "The active Table with `table-id`, or nil. The typed schema lists only active tables."
  [table-id]
  (t2/select-one :model/Table :id table-id :active true {:from [(warehouse-schema-overlay/table-query)]}))

(defn destination-database-ids
  "The IDs among `database-ids` of the databases that are routing destinations."
  [database-ids]
  (if (seq database-ids)
    (t2/select-fn-set :id :model/Database :id [:in database-ids] :router_database_id [:not= nil])
    #{}))

(defn cards-by-ids
  "The Cards with `card-ids`."
  [card-ids]
  (if (seq card-ids)
    (t2/select :model/Card :id [:in card-ids])
    []))

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
