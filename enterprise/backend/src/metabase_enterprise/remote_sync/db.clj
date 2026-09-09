(ns metabase-enterprise.remote-sync.db
  "Application database queries for the remote-sync module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [malli.util :as mut]
   [metabase-enterprise.remote-sync.schema :as remote-sync.schema]
   [metabase.collections.core :as collections]
   [metabase.collections.schema :as collections.schema]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.native-query-snippets.schema :as native-query-snippets.schema]
   [metabase.queries.schema :as queries.schema]
   [metabase.users.schema :as users.schema]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(def ^:private Conditions
  "A map of column to value (possibly nil) or Toucan 2 operator-vector value, or nil for none."
  [:maybe [:map-of :keyword [:maybe [:or :string :int :boolean :keyword sequential?]]]])

(def ^:private RemovalOpts
  "The `:scope-key`, `:synced-collection-ids`, `:entity-ids`, and `:removal-conditions` describing which rows an
  import removes (see [[removal-exprs]])."
  [:map {:closed true}
   [:scope-key             [:maybe :keyword]]
   [:synced-collection-ids [:maybe [:or [:set ::lib.schema.id/collection] [:sequential ::lib.schema.id/collection]]]]
   [:entity-ids            [:maybe [:or [:set :string] [:sequential :string]]]]
   [:removal-conditions    Conditions]])

(def ^:private ModelId
  "A `:model_id`: the primary key of the referenced entity, or the `-1` sentinel
  (`metabase-enterprise.remote-sync.settings/transforms-root-id`) standing in for the virtual Transforms root
  Collection."
  [:or ms/PositiveInt [:= -1]])

(def ^:private Path
  "A `{:db_name :schema :table_name :field_name}` path used to locate a Table or Field."
  [:map
   [:db_name    :string]
   [:schema     {:optional true} [:maybe :string]]
   [:table_name :string]
   [:field_name {:optional true} :string]])

(mu/defn eligible-children :- [:sequential :map]
  "The instances of `model-key` whose `fk` column equals `model-id`, additionally matching `conditions` (a map of
  column to value or Toucan 2 operator-vector value, or nil for none)."
  [model-key   :- :keyword
   fk          :- :keyword
   model-id    :- ms/PositiveInt
   conditions  :- Conditions]
  (apply t2/select model-key fk model-id (mapcat identity conditions)))

(mu/defn ids-where :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the instances of `model-key` matching `conditions` (a map of column to value or Toucan 2
  operator-vector value, or nil for every instance)."
  [model-key  :- :keyword
   conditions :- Conditions]
  (apply t2/select-fn-set :id model-key (mapcat identity conditions)))

(mu/defn count-where :- ms/IntGreaterThanOrEqualToZero
  "The number of instances of `model-key` matching `conditions` (a map of column to value or Toucan 2
  operator-vector value, or nil for every instance)."
  [model-key  :- :keyword
   conditions :- Conditions]
  (apply t2/count model-key (mapcat identity conditions)))

(defn- removal-condition-exprs
  "Turns a spec's removal-conditions map into `:where` fragments: an `:entity_id` entry whose value is an
  `[op value]` pair becomes `[op :entity_id value]`; any other entry with a vector value becomes `[:in key value]`;
  a scalar value becomes `[:= key value]`."
  [removal-conditions]
  (for [[k v] removal-conditions]
    (cond
      (and (= k :entity_id) (vector? v)) (let [[op value] v] [op :entity_id value])
      (vector? v)                        [:in k v]
      :else                              [:= k v])))

(defn- removal-exprs
  "The `:where` fragments (see [[removal-condition-exprs]]) selecting the `model-key` rows an import removes:
  scoped to `synced-collection-ids` (when `scope-key` is given), excluding `entity-ids`, and matching
  `removal-conditions`. Returns nil for a scoped model with no synced collections (removes nothing)."
  [{:keys [scope-key synced-collection-ids entity-ids removal-conditions]}]
  (when-not (and scope-key (empty? synced-collection-ids))
    (cond-> []
      scope-key        (conj [:in scope-key synced-collection-ids])
      (seq entity-ids) (conj [:not-in :entity_id entity-ids])
      :always          (into (removal-condition-exprs removal-conditions)))))

(mu/defn delete-removed-instances! :- [:maybe :int]
  "Deletes the `model-key` rows an import removes (see [[removal-exprs]]); a no-op for a scoped model with no
  synced collections, and a delete of every row when nothing restricts it."
  [model-key    :- :keyword
   removal-opts :- RemovalOpts]
  (when-let [exprs (removal-exprs removal-opts)]
    (if (seq exprs)
      (t2/delete! model-key {:where (if (= 1 (count exprs)) (first exprs) (into [:and] exprs))})
      (t2/delete! model-key))))

(defn- unsynced-anti-join-expr
  "A `[:not [:exists ...]]` fragment keeping only rows with no RemoteSyncObject of `model-type` in 'synced'
  status — i.e. unsynced local work (an already-synced entity's removal is a normal reconcile, not data loss).
  `id-column` is the qualified id column of the model's own table."
  [model-type id-column]
  [:not [:exists ^:allow-subquery {:select [1]
                                   :from   [:remote_sync_object]
                                   :where  [:and
                                            [:= :remote_sync_object.model_type model-type]
                                            [:= :remote_sync_object.model_id id-column]
                                            [:= :remote_sync_object.status "synced"]]}]])

(defn- unsynced-instance-expr
  [model-key model-type removal-opts]
  (let [id-column (keyword (str (name (t2/table-name model-key)) ".id"))]
    (into [:and (unsynced-anti-join-expr model-type id-column)] (removal-exprs removal-opts))))

(mu/defn unsynced-instance-count :- ms/IntGreaterThanOrEqualToZero
  "The number of `model-key` rows [[delete-removed-instances!]] would remove (see [[removal-exprs]]) that also
  have no RemoteSyncObject of `model-type` in synced status — unsynced local work an import would otherwise wipe
  out."
  [model-key    :- :keyword
   model-type   :- :string
   removal-opts :- RemovalOpts]
  (t2/count model-key {:where (unsynced-instance-expr model-key model-type removal-opts)}))

(mu/defn unsynced-instance-names :- [:maybe [:sequential :string]]
  "Up to `limit` names of the rows [[unsynced-instance-count]] counts."
  [model-key    :- :keyword
   model-type   :- :string
   removal-opts :- RemovalOpts
   limit        :- ms/PositiveInt]
  (t2/select-fn-vec :name model-key {:where (unsynced-instance-expr model-key model-type removal-opts)
                                     :limit limit}))

(mu/defn instance :- [:maybe :map]
  "The instance of `model` with `id`, or nil."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one model :id id))

(mu/defn instance-with-columns :- [:maybe :map]
  "The `columns` of the instance of `model` with `id`, or nil."
  [model   :- :keyword
   columns :- [:sequential :keyword]
   id      :- ms/PositiveInt]
  (t2/select-one (into [model] columns) :id id))

(mu/defn instance-names :- [:sequential :map]
  "The `:id` and `:name` of the instances of `model` with `ids`."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/select [model :id :name] :id [:in ids]))

(mu/defn instances-in-collections :- [:sequential :map]
  "The instances of `model` in the Collections with `collection-ids`, excluding those archived under the optional
  `archived-key` column."
  [model          :- :keyword
   collection-ids :- [:sequential ::lib.schema.id/collection]
   archived-key   :- [:maybe :keyword]]
  (t2/select model {:where [:and
                            [:in :collection_id collection-ids]
                            (when archived-key [:= archived-key false])]}))

(mu/defn instances-with-columns-by-entity-ids :- [:sequential :map]
  "The `columns` of the instances of `model` with `entity-ids`."
  [model      :- :keyword
   columns    :- [:sequential :keyword]
   entity-ids :- [:set :string]]
  (t2/select (into [model] columns) :entity_id [:in entity-ids]))

(mu/defn delete-instances! :- :int
  "Delete the instances of `model` with `ids`."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/delete! model :id [:in ids]))

(defn- tracking-select-parts
  "The SELECT/FROM/JOIN joining a `model-key` instance (Field, Segment, or Measure) to its Table for sync tracking,
  plus the `alias` its own table is joined under (so callers can address its `:id` and `:entity_id` columns).
  Segment and Measure share alias \"s\" — both are looked up the same way by [[tracking-details-by-entity-ids]]."
  [model-key]
  (case model-key
    :model/Field   {:alias  "f"
                    :select [:f.name :f.table_id [:t.collection_id :collection_id] [:t.name :table_name]]
                    :from   [[:metabase_field :f]]
                    :join   [[:metabase_table :t] [:= :f.table_id :t.id]]}
    :model/Segment {:alias  "s"
                    :select [:s.name :s.table_id [:t.collection_id :collection_id] [:t.name :table_name]]
                    :from   [[:segment :s]]
                    :join   [[:metabase_table :t] [:= :s.table_id :t.id]]}
    :model/Measure {:alias  "s"
                    :select [:s.name :s.table_id [:t.collection_id :collection_id] [:t.name :table_name]]
                    :from   [[:measure :s]]
                    :join   [[:metabase_table :t] [:= :s.table_id :t.id]]}))

(mu/defn tracking-details-by-id :- [:maybe :map]
  "The name, table id, collection id, and table name of the `model-key` (Field, Segment, or Measure) instance with
  `model-id`, or nil."
  [model-key :- :keyword
   model-id  :- ms/PositiveInt]
  (let [{:keys [alias select from join]} (tracking-select-parts model-key)]
    (first (t2/query {:select select :from from :join join :where [:= (keyword alias "id") model-id]}))))

(mu/defn tracking-details-by-entity-ids :- [:sequential :map]
  "The `:id`, name, table id, collection id, and table name of the `model-key` (Segment or Measure) instances with
  `entity-ids`."
  [model-key  :- :keyword
   entity-ids :- [:sequential :string]]
  (let [{:keys [alias select from join]} (tracking-select-parts model-key)
        id-column (keyword alias "id")]
    (t2/query {:select (into [id-column] select)
               :from   from
               :join   join
               :where  [:in (keyword alias "entity_id") entity-ids]})))

(mu/defn entity-id :- [:maybe :string]
  "The entity ID of the instance of `model` with `id`."
  [model :- :keyword
   id    :- ms/PositiveInt]
  (t2/select-one-fn :entity_id model :id id))

(mu/defn entity-ids-by-id :- [:map-of ms/PositiveInt :string]
  "A map of ID to entity ID for the instances of `model` with `ids`."
  [model :- :keyword
   ids   :- [:sequential ms/PositiveInt]]
  (t2/select-pk->fn :entity_id model :id [:in ids]))

(mu/defn existing-entity-ids :- [:maybe [:set :string]]
  "The subset of `entity-ids` that instances of `model` have."
  [model      :- :keyword
   entity-ids :- [:sequential :string]]
  (t2/select-fn-set :entity_id model :entity_id [:in entity-ids]))

(mu/defn ids-by-entity-ids :- [:maybe [:sequential ms/PositiveInt]]
  "The IDs of the instances of `model` with `entity-ids`."
  [model      :- :keyword
   entity-ids :- [:set :string]]
  (t2/select-pks-vec model :entity_id [:in entity-ids]))

(defn- path-expr
  "Matches the Tables (aliased `t` in a Database aliased `db`) at `paths`, and their Fields (aliased `f`) when
  `has-field?`."
  [paths has-field?]
  (into [:or]
        (for [path paths]
          (let [{:keys [db_name schema table_name field_name]} path]
            (cond-> [:and
                     [:= :db.name db_name]
                     (if schema [:= :t.schema schema] [:is :t.schema nil])
                     [:= :t.name table_name]]
              (and has-field? field_name)
              (conj [:= :f.name field_name]))))))

(mu/defn tables-at-paths :- [:sequential [:map {:closed true} [:id ms/PositiveInt] [:name :string] [:collection_id [:maybe ::lib.schema.id/collection]]]]
  "The `:id`, `:name`, and `:collection_id` rows of the Tables at `paths` (`{:db_name :schema :table_name}`)."
  [paths :- [:sequential Path]]
  (t2/query {:select [:t.id :t.name :t.collection_id]
             :from   [[:metabase_table :t]]
             :join   [[:metabase_database :db] [:= :db.id :t.db_id]]
             :where  (path-expr paths false)}))

(def ^:private FieldsAtPath
  "Rows returned by [[fields-at-paths]]."
  [:map {:closed true}
   [:id ms/PositiveInt]
   [:name :string]
   [:table_id ::lib.schema.id/table]
   [:collection_id [:maybe ::lib.schema.id/collection]]
   [:table_name :string]])

(mu/defn fields-at-paths :- [:sequential
                             FieldsAtPath]
  "The `:id`, `:name`, `:table_id`, `:collection_id`, and `:table_name` rows of the Fields at `paths`
  (`{:db_name :schema :table_name :field_name}`)."
  [paths :- [:sequential Path]]
  (t2/query {:select [:f.id :f.name :f.table_id [:t.collection_id :collection_id] [:t.name :table_name]]
             :from   [[:metabase_field :f]]
             :join   [[:metabase_table :t] [:= :t.id :f.table_id]
                      [:metabase_database :db] [:= :db.id :t.db_id]]
             :where  (path-expr paths true)}))

(def ^:private CardType
  "Rows returned by [[card-types]]."
  (mut/select-keys ::queries.schema/card.row [:id :type :card_schema]))

(mu/defn card-types :- [:sequential CardType]
  "The `:id`, `:type`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids :- [:sequential ::lib.schema.id/card]]
  (t2/select [:model/Card :id :type :card_schema] :id [:in card-ids]))

(mu/defn field-user-settings-exist? :- :boolean
  "Whether the Field with `field-id` has FieldUserSettings."
  [field-id :- ::lib.schema.id/field]
  (t2/exists? :model/FieldUserSettings :field_id field-id))

(def ^:private Snippet
  "Rows returned by [[snippets]]."
  (mut/select-keys ::native-query-snippets.schema/native-query-snippet.row [:id :name :collection_id]))

(mu/defn snippets :- [:sequential Snippet]
  "The `:id`, `:name`, and `:collection_id` of every NativeQuerySnippet."
  []
  (t2/select [:model/NativeQuerySnippet :id :name :collection_id]))

(defn- subtree-expr
  "Matches `collections` and all of their descendants."
  [collections]
  (into [:or [:in :id (map :id collections)]]
        (for [collection collections]
          [:like :location (str (collections/location-path collection) "%")])))

(mu/defn collections :- [:sequential ::collections.schema/collection]
  "The Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select :model/Collection :id [:in collection-ids]))

(def ^:private CollectionsById
  "Rows returned by [[collections-by-id]]."
  (mut/select-keys ::collections.schema/collection [:id :name :location :personal_owner_id]))

(mu/defn collections-by-id :- [:map-of ::lib.schema.id/collection CollectionsById]
  "A map of ID to the ID, name, location, and personal owner of the Collections with `collection-ids`."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/select-pk->fn identity [:model/Collection :id :name :location :personal_owner_id] :id [:in collection-ids]))

(def ^:private CollectionSyncState
  "Rows returned by [[collection-sync-states]]."
  (mut/select-keys ::collections.schema/collection [:id :is_remote_synced]))

(mu/defn collection-sync-states :- [:sequential CollectionSyncState]
  "The `:id` and `:is_remote_synced` of the Collections with `collection-ids`."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select [:model/Collection :id :is_remote_synced] :id [:in collection-ids]))

(def ^:private CollectionNameAndId
  "Rows returned by [[collection-name-and-id]]."
  (mut/merge (mut/select-keys ::collections.schema/collection [:name])
             [:map [:collection_id [:maybe ms/PositiveInt]]]))

(mu/defn collection-name-and-id :- [:maybe CollectionNameAndId]
  "The `:name` and `:collection_id` (its own ID) of the Collection with `collection-id`, or nil."
  [collection-id :- ::lib.schema.id/collection]
  (t2/select-one [:model/Collection :name [:id :collection_id]] :id collection-id))

(mu/defn library-collection :- [:maybe ::collections.schema/collection]
  "The Library Collection of `library-type`, or nil."
  [library-type :- :string]
  (t2/select-one :model/Collection :type library-type))

(def ^:private SnippetCollection
  "Rows returned by [[snippet-collections]]."
  (mut/select-keys ::collections.schema/collection [:id :name]))

(mu/defn snippet-collections :- [:sequential SnippetCollection]
  "The `:id` and `:name` of the Collections of the snippets namespace."
  []
  (t2/select [:model/Collection :id :name] :namespace "snippets"))

(mu/defn snippet-collection-ids :- [:maybe [:set ::lib.schema.id/collection]]
  "The IDs of the Collections of the snippets namespace."
  []
  (t2/select-pks-set :model/Collection :namespace "snippets"))

(def ^:private CollectionsInNamespace
  "Rows returned by [[collections-in-namespace]]."
  (mut/select-keys ::collections.schema/collection [:id :entity_id]))

(mu/defn collections-in-namespace :- [:sequential CollectionsInNamespace]
  "The `:id` and `:entity_id` of the Collections of `namespace-name`."
  [namespace-name :- :string]
  (t2/select [:model/Collection :id :entity_id] :namespace namespace-name))

(mu/defn collection-ids-in-namespace :- [:maybe [:sequential ::lib.schema.id/collection]]
  "The IDs of the Collections of `namespace-name`."
  [namespace-name :- :string]
  (t2/select-pks-vec :model/Collection :namespace namespace-name))

(mu/defn remote-synced-collection-ids :- [:maybe [:sequential ::lib.schema.id/collection]]
  "The IDs of the remote-synced Collections."
  []
  (t2/select-pks-vec :model/Collection :is_remote_synced true))

(mu/defn unarchived-remote-synced-root-collection-ids :- [:maybe [:set ::lib.schema.id/collection]]
  "The IDs of the unarchived remote-synced root Collections."
  []
  (t2/select-fn-set :id :model/Collection
                    {:where [:and
                             [:= :is_remote_synced true]
                             [:= :location "/"]
                             [:not :archived]]}))

(mu/defn unarchived-root-collection-ids-in-namespace :- [:maybe [:set ::lib.schema.id/collection]]
  "The IDs of the unarchived root Collections of `namespace-name`."
  [namespace-name :- :string]
  (t2/select-fn-set :id :model/Collection
                    {:where [:and
                             [:= :namespace namespace-name]
                             [:= :location "/"]
                             [:not :archived]]}))

(mu/defn subtree-collection-ids :- [:maybe [:set ::lib.schema.id/collection]]
  "The IDs of `collections` and all of their descendants."
  [collections :- [:sequential ::collections.schema/collection]]
  (t2/select-pks-set :model/Collection {:where (subtree-expr collections)}))

(mu/defn remote-synced-subtree-collection-ids :- [:maybe [:set ::lib.schema.id/collection]]
  "The IDs of the remote-synced Collections among `collections` and their descendants."
  [collections :- [:sequential ::collections.schema/collection]]
  (t2/select-pks-set :model/Collection
                     {:where [:and
                              [:= :is_remote_synced true]
                              (subtree-expr collections)]}))

(mu/defn mark-subtree-remote-synced! :- [:sequential :int]
  "Mark `collections` and all of their descendants as remote-synced."
  [collections :- [:sequential ::collections.schema/collection]]
  (t2/query {:update (t2/table-name :model/Collection)
             :set    {:is_remote_synced true}
             :where  [:and
                      [:= :is_remote_synced false]
                      (subtree-expr collections)]}))

(mu/defn unmark-collections-remote-synced! :- [:sequential :int]
  "Mark the Collections with `collection-ids` as not remote-synced."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/query {:update (t2/table-name :model/Collection)
             :set    {:is_remote_synced false}
             :where  [:in :id collection-ids]}))

(defn- contents-rso-expr
  "Matches the RemoteSyncObject rows of `collection-ids` and of their contents."
  [collection-ids]
  [:or
   [:and [:= :model_type "Collection"] [:in :model_id collection-ids]]
   [:in :model_collection_id collection-ids]])

(defn- rso-keys-expr
  "Matches the RemoteSyncObject rows of the `[{:model_type :model_id}]` `rows`."
  [rows]
  (into [:or] (map (fn [{:keys [model_type model_id]}]
                     [:and [:= :model_type model_type] [:= :model_id model_id]]))
        rows))

(mu/defn rso :- [:maybe ::remote-sync.schema/remote-sync-object]
  "The RemoteSyncObject of the entity `model-type` `model-id`, or nil."
  [model-type :- :string
   model-id   :- ModelId]
  (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id))

(mu/defn lock-rso :- [:maybe ::remote-sync.schema/remote-sync-object]
  "The RemoteSyncObject of the entity `model-type` `model-id`, locked for update, or nil."
  [model-type :- :string
   model-id   :- ModelId]
  (t2/select-one :model/RemoteSyncObject
                 {:where [:and [:= :model_type model-type] [:= :model_id model-id]]
                  :for   :update}))

(mu/defn rso-by-file-path :- [:maybe ::remote-sync.schema/remote-sync-object]
  "The RemoteSyncObject at `file-path`, or nil."
  [file-path :- :string]
  (t2/select-one :model/RemoteSyncObject :file_path file-path))

(mu/defn rso-exists? :- :boolean
  "Whether the entity `model-type` `model-id` has a RemoteSyncObject."
  [model-type :- :string
   model-id   :- ModelId]
  (t2/exists? :model/RemoteSyncObject :model_type model-type :model_id model-id))

(mu/defn rso-of-type-exists? :- :boolean
  "Whether any entity of `model-type` has a RemoteSyncObject."
  [model-type :- :string]
  (t2/exists? :model/RemoteSyncObject :model_type model-type))

(mu/defn rso-count-of-type :- ms/IntGreaterThanOrEqualToZero
  "The number of RemoteSyncObjects of `model-type`."
  [model-type :- :string]
  (t2/count :model/RemoteSyncObject :model_type model-type))

(def ^:private RsoKey
  "Rows returned by [[rso-keys]]."
  (mut/select-keys ::remote-sync.schema/remote-sync-object [:id :model_type :model_id]))

(mu/defn rso-keys :- [:sequential RsoKey]
  "The `:id`, `:model_type`, and `:model_id` of every RemoteSyncObject."
  []
  (t2/select [:model/RemoteSyncObject :id :model_type :model_id]))

(def ^:private DepartedRsoKey
  "Rows returned by [[departed-rso-keys]]."
  (mut/select-keys ::remote-sync.schema/remote-sync-object [:id :model_type :model_id]))

(mu/defn departed-rso-keys :- [:sequential DepartedRsoKey]
  "The `:id`, `:model_type`, and `:model_id` of the RemoteSyncObjects pending removal or deletion."
  []
  (t2/select [:model/RemoteSyncObject :id :model_type :model_id] :status [:in ["removed" "delete"]]))

(mu/defn all-rso-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of every RemoteSyncObject."
  []
  (t2/select-pks-set :model/RemoteSyncObject))

(mu/defn unsynced-rsos :- [:sequential ::remote-sync.schema/remote-sync-object]
  "The RemoteSyncObjects whose status is not synced."
  []
  (t2/select :model/RemoteSyncObject {:where [:not= :status "synced"]}))

(mu/defn dirty-rso-exists? :- :boolean
  "Whether a RemoteSyncObject of a model type other than `excluded-model-types` is not synced."
  [excluded-model-types :- [:set :string]]
  (t2/exists? :model/RemoteSyncObject
              {:where [:and
                       [:not= :status "synced"]
                       (when (seq excluded-model-types)
                         [:not-in :model_type excluded-model-types])]}))

(mu/defn dirty-rsos :- [:sequential ::remote-sync.schema/remote-sync-object]
  "The RemoteSyncObjects of model types other than `excluded-model-types` that are not synced."
  [excluded-model-types :- [:set :string]]
  (t2/select :model/RemoteSyncObject
             {:where [:and
                      [:not= :status "synced"]
                      (when (seq excluded-model-types)
                        [:not-in :model_type excluded-model-types])]}))

(mu/defn tracked-model-ids :- [:maybe [:set ms/PositiveInt]]
  "The model IDs of the RemoteSyncObjects of `model-type`."
  [model-type :- :string]
  (t2/select-fn-set :model_id :model/RemoteSyncObject :model_type model-type))

(mu/defn rsos-of-models :- [:sequential ::remote-sync.schema/remote-sync-object]
  "The RemoteSyncObjects of the entities of `model-type` with `model-ids`."
  [model-type :- :string
   model-ids  :- [:sequential ms/PositiveInt]]
  (t2/select :model/RemoteSyncObject :model_type model-type :model_id [:in model-ids]))

(mu/defn active-child-rsos :- [:sequential ::remote-sync.schema/remote-sync-object]
  "The RemoteSyncObjects of `model-type` under the Table with `table-id` that are not pending removal or deletion."
  [model-type :- :string
   table-id   :- ::lib.schema.id/table]
  (t2/select :model/RemoteSyncObject
             :model_type model-type
             :model_table_id table-id
             :status [:not-in ["removed" "delete"]]))

(def ^:private ContentRsoStatuse
  "Rows returned by [[content-rso-statuses]]."
  (mut/select-keys ::remote-sync.schema/remote-sync-object [:id :status]))

(mu/defn content-rso-statuses :- [:sequential ContentRsoStatuse]
  "The `:id` and `:status` of the RemoteSyncObjects of the Collections with `collection-ids` and their contents."
  [collection-ids :- [:set ::lib.schema.id/collection]]
  (t2/select [:model/RemoteSyncObject :id :status] {:where (contents-rso-expr collection-ids)}))

(mu/defn removed-content-rso-ids :- [:maybe [:set ms/PositiveInt]]
  "The IDs of the RemoteSyncObjects pending removal among those of the Collections with `collection-ids` and their
  contents."
  [collection-ids :- [:sequential ::lib.schema.id/collection]]
  (t2/select-pks-set :model/RemoteSyncObject
                     {:where [:and
                              [:= :status "removed"]
                              (contents-rso-expr collection-ids)]}))

(mu/defn insert-rso! :- :int
  "Insert the RemoteSyncObject `row`."
  [row :- ::remote-sync.schema/remote-sync-object.update]
  (t2/insert! :model/RemoteSyncObject row))

(mu/defn insert-rsos! :- :int
  "Insert the RemoteSyncObject `rows`."
  [rows :- [:sequential ::remote-sync.schema/remote-sync-object.update]]
  (t2/insert! :model/RemoteSyncObject rows))

(mu/defn update-rso! :- :int
  "Apply `changes` to the RemoteSyncObject with `rso-id`."
  [rso-id  :- ms/PositiveInt
   changes :- ::remote-sync.schema/remote-sync-object.update]
  (t2/update! :model/RemoteSyncObject rso-id changes))

(mu/defn set-rsos-status! :- :int
  "Set the status of the RemoteSyncObjects with `rso-ids` to `status` as of `timestamp`."
  [rso-ids   :- [:sequential ms/PositiveInt]
   status    :- :string
   timestamp :- ms/TemporalInstant]
  (t2/update! :model/RemoteSyncObject :id [:in rso-ids] {:status status :status_changed_at timestamp}))

(mu/defn mark-all-rsos-synced! :- :int
  "Mark every RemoteSyncObject as synced as of `timestamp`."
  [timestamp :- ms/TemporalInstant]
  (t2/update! :model/RemoteSyncObject {:status "synced" :status_changed_at timestamp}))

(mu/defn mark-rsos-synced! :- :int
  "Mark the RemoteSyncObjects with `rso-ids` as synced as of `timestamp`, writing the `:file_path` and
  `:content_hash` of those in `metadata-by-id` and keeping the existing values of the others."
  [rso-ids        :- [:sequential ms/PositiveInt]
   metadata-by-id :- [:map-of ms/PositiveInt
                      [:map {:closed true}
                       [:id           {:optional true} ms/PositiveInt]
                       [:file_path    {:optional true} [:maybe :string]]
                       [:content_hash {:optional true} [:maybe :string]]]]
   timestamp      :- ms/TemporalInstant]
  (t2/update! :model/RemoteSyncObject
              {:id [:in (vec rso-ids)]}
              (cond-> {:status "synced" :status_changed_at timestamp}
                (seq metadata-by-id)
                (assoc :file_path    (into [:case]
                                           (concat
                                            (mapcat (fn [[id {:keys [file_path]}]]
                                                      [[:= :id id] file_path])
                                                    metadata-by-id)
                                            [:else :file_path]))
                       :content_hash (into [:case]
                                           (concat
                                            (mapcat (fn [[id {:keys [content_hash]}]]
                                                      [[:= :id id] content_hash])
                                                    metadata-by-id)
                                            [:else :content_hash]))))))

(mu/defn delete-rso! :- :int
  "Delete the RemoteSyncObject with `rso-id`."
  [rso-id :- ms/PositiveInt]
  (t2/delete! :model/RemoteSyncObject rso-id))

(mu/defn delete-rsos! :- :int
  "Delete the RemoteSyncObjects with `rso-ids`."
  [rso-ids :- [:sequential ms/PositiveInt]]
  (t2/delete! :model/RemoteSyncObject :id [:in rso-ids]))

(mu/defn delete-rso-of! :- :int
  "Delete the RemoteSyncObject of the entity `model-type` `model-id`."
  [model-type :- :string
   model-id   :- ModelId]
  (t2/delete! :model/RemoteSyncObject :model_type model-type :model_id model-id))

(mu/defn delete-rsos-of-type! :- :int
  "Delete the RemoteSyncObjects of `model-type`."
  [model-type :- :string]
  (t2/delete! :model/RemoteSyncObject :model_type model-type))

(mu/defn delete-rsos-of-models! :- :int
  "Delete the RemoteSyncObjects of the entities of `model-type` with `model-ids`."
  [model-type :- :string
   model-ids  :- [:set ms/PositiveInt]]
  (t2/delete! :model/RemoteSyncObject :model_type model-type :model_id [:in model-ids]))

(mu/defn delete-rsos-of-keys! :- :int
  "Delete the RemoteSyncObjects of the `[{:model_type :model_id}]` `rows`."
  [rows :- [:sequential [:map {:closed true} [:model_type :string] [:model_id ms/PositiveInt]]]]
  (t2/delete! :model/RemoteSyncObject {:where (rso-keys-expr rows)}))

(mu/defn delete-all-rsos! :- :int
  "Delete every RemoteSyncObject."
  []
  (t2/delete! :model/RemoteSyncObject))

(mu/defn task :- [:maybe ::remote-sync.schema/remote-sync-task]
  "The RemoteSyncTask with `task-id`, or nil."
  [task-id :- ms/PositiveInt]
  (t2/select-one :model/RemoteSyncTask task-id))

(mu/defn lock-task :- [:maybe ::remote-sync.schema/remote-sync-task]
  "The RemoteSyncTask with `task-id`, locked for update, or nil."
  [task-id :- ms/PositiveInt]
  (t2/select-one :model/RemoteSyncTask :id task-id {:for :update}))

(mu/defn task-cancelled? :- [:maybe :boolean]
  "The cancelled flag of the RemoteSyncTask with `task-id`."
  [task-id :- ms/PositiveInt]
  (t2/select-one-fn :cancelled :model/RemoteSyncTask :id task-id))

(mu/defn current-task :- [:maybe ::remote-sync.schema/remote-sync-task]
  "The newest started, unfinished RemoteSyncTask that reported progress after `progress-cutoff`, or nil."
  [progress-cutoff :- ms/TemporalInstant]
  (t2/select-one :model/RemoteSyncTask
                 {:where    [:and
                             [:<> :started_at nil]
                             [:= :ended_at nil]
                             [:< progress-cutoff :last_progress_report_at]]
                  :limit    1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(mu/defn most-recent-task :- [:maybe ::remote-sync.schema/remote-sync-task]
  "The newest started RemoteSyncTask, or nil."
  []
  (t2/select-one :model/RemoteSyncTask
                 {:where    [:and
                             [:<> :started_at nil]]
                  :limit    1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(mu/defn last-successful-task :- [:maybe ::remote-sync.schema/remote-sync-task]
  "The newest finished RemoteSyncTask that was neither cancelled nor failed and recorded a version, or nil."
  []
  (t2/select-one :model/RemoteSyncTask
                 {:where    [:and
                             [:<> nil :ended_at]
                             [:= false :cancelled]
                             [:= nil :error_message]
                             [:<> nil :version]]
                  :limit    1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(mu/defn insert-task! :- ::remote-sync.schema/remote-sync-task
  "Insert `task` and return the new instance."
  [task :- ::remote-sync.schema/remote-sync-task.update]
  (t2/insert-returning-instance! :model/RemoteSyncTask task))

(mu/defn update-task! :- :int
  "Apply `changes` to the RemoteSyncTask with `task-id`."
  [task-id :- ms/PositiveInt
   changes :- ::remote-sync.schema/remote-sync-task.update]
  (t2/update! :model/RemoteSyncTask task-id changes))

(mu/defn supersede-stale-tasks! :- [:sequential :int]
  "Cancel and end now the started, unfinished RemoteSyncTasks that last reported progress before `cutoff`."
  [cutoff :- ms/TemporalInstant]
  (t2/query {:update (t2/table-name :model/RemoteSyncTask)
             :set    {:cancelled     true
                      :ended_at      :%now
                      :error_message "Superseded after staleness timeout"}
             :where  [:and
                      [:<> :started_at nil]
                      [:= :ended_at nil]
                      [:< :last_progress_report_at cutoff]]}))

(mu/defn delete-tasks-started-before! :- :int
  "Delete the RemoteSyncTasks started before `cutoff`, returning the number deleted."
  [cutoff :- ms/TemporalInstant]
  (t2/delete! :model/RemoteSyncTask {:where [:< :started_at cutoff]}))

(mu/defn users-by-id :- [:map-of ::lib.schema.id/user ::users.schema/user]
  "A map of User ID to User for `user-ids`."
  [user-ids :- [:sequential [:maybe ::lib.schema.id/user]]]
  (t2/select-pk->fn identity :model/User :id [:in user-ids]))
