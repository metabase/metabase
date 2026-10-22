(ns metabase-enterprise.data-apps.db
  "Application database queries for the data-apps module. Every function here is a direct Toucan 2 call with no
  additional logic, so the rest of the module only touches `toucan2.core` for model definitions and hydration methods."
  (:require
   [metabase-enterprise.data-apps.schema :as data-apps.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouse-schema-overlay.core :as warehouse-schema-overlay]
   [toucan2.core :as t2]))

(def non-blob-columns
  "Every DataApp column except the raw bundle blob."
  [:id :entity_id :name :display_name :description :version :bundle_path :enabled :allowed_hosts
   :resource_collection_id :bundle_hash :created_at :updated_at])

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

(mu/defn data-app-exists?
  "Whether a DataApp named `slug` exists."
  [slug :- :string]
  (t2/exists? :model/DataApp :name slug))

(mu/defn data-app-entity-id-named
  "The `:entity_id` of the DataApp named `slug`, or nil."
  [slug :- :string]
  (t2/select-one-fn :entity_id :model/DataApp :name slug))

(mu/defn resource-collection?
  "Whether the Collection with `collection-id` is the resource collection of a DataApp."
  [collection-id :- pos-int?]
  (t2/exists? :model/DataApp :resource_collection_id collection-id))

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

(defn resource-collection-ids
  "The IDs of the resource collections owned by data apps."
  []
  (t2/select-fn-set :resource_collection_id :model/DataApp :resource_collection_id [:not= nil]))

(mu/defn resource-collection-id
  "The ID of the resource collection owned by the DataApp with `data-app-id`."
  [data-app-id :- ms/PositiveInt]
  (t2/select-one-fn :resource_collection_id :model/DataApp :id data-app-id))

(defn resource-collection-owned?
  "Whether a data app owns the collection with `collection-id`."
  [collection-id]
  (t2/exists? :model/DataApp :resource_collection_id collection-id))

(defn data-app-by-entity-id
  "The `:id`, `:entity_id`, and `:resource_collection_id` of the DataApp with `entity-id`, or nil."
  [entity-id]
  (t2/select-one [:model/DataApp :id :entity_id :resource_collection_id] :entity_id entity-id))

(defn active-table?
  "Whether the table with `table-id` is active."
  [table-id]
  (some? (t2/select-one-pk :model/Table :id table-id :active true
                           {:from [(warehouse-schema-overlay/table-query {:user-settings? false})]})))

(defn active-field?
  "Whether the field with `field-id` is active."
  [field-id]
  (some? (t2/select-one-pk :model/Field :id field-id :active true
                           {:from [(warehouse-schema-overlay/field-query {:user-settings? false})]})))

(defn collections-by-entity-ids
  "The `:id`, `:entity_id` and `:namespace` of the collections with `entity-ids`."
  [entity-ids]
  (if (seq entity-ids)
    (t2/query {:select [:id :entity_id :namespace] :from [:collection] :where [:in :entity_id entity-ids]})
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

(defn collection-card-ids
  "The IDs of the cards in the collection with `collection-id`."
  [collection-id]
  (t2/select-pks-vec :model/Card :collection_id collection-id))

(defn collection-action-ids
  "The IDs of the actions in the collection with `collection-id`."
  [collection-id]
  (t2/select-pks-vec :model/Action :collection_id collection-id))

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
    (t2/select :model/DataAppGroupAssignment :data_app_id [:in app-ids])
    []))

(defn insert-assignments!
  "Assign groups to an app. The unique constraint rejects concurrent duplicates."
  [app-id group-ids]
  (t2/insert! :model/DataAppGroupAssignment
              (mapv (fn [group-id] {:data_app_id app-id :permission_group_id group-id}) group-ids)))

(defn delete-assignments!
  "Remove the requested group assignments from an app."
  [app-id group-ids]
  (if (seq group-ids)
    (t2/delete! :model/DataAppGroupAssignment :data_app_id app-id :permission_group_id [:in group-ids])
    0))

(defn permissions-for-warnings
  "View-data permission rows for the warning tables and their databases."
  [group-ids database-ids table-ids]
  (if (and (seq group-ids) (seq database-ids) (seq table-ids))
    (t2/select [:model/DataPermissions :group_id :db_id :perm_type :table_id :perm_value]
               :group_id [:in group-ids]
               :db_id [:in database-ids]
               :perm_type :perms/view-data
               {:where [:or [:in :table_id table-ids] [:= :table_id nil]]})
    []))

(mu/defn active-tables
  "The active Tables with `table-ids`, in name then id order."
  [table-ids :- [:set ::lib.schema.id/table]]
  (if (seq table-ids)
    (t2/select :model/Table
               {:from     [(warehouse-schema-overlay/table-query)]
                :where    [:and [:= :active true] [:in :id table-ids]]
                :order-by [[:name :asc] [:id :asc]]})
    []))

(mu/defn resource-cards
  "The unarchived Cards in the collection with `collection-id`, in name then id order."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select :model/Card {:where    [:and [:= :collection_id collection-id] [:= :archived false]]
                          :order-by [[:name :asc] [:id :asc]]}))

(mu/defn resource-action-ids
  "The IDs of the unarchived Actions in the collection with `collection-id`, in name then id order."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-pks-vec :model/Action {:where    [:and [:= :collection_id collection-id] [:= :archived false]]
                                    :order-by [[:name :asc] [:id :asc]]}))
