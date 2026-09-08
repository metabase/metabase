(ns metabase-enterprise.remote-sync.db
  "Application database queries for the remote-sync module. Every function here is a direct Toucan 2 call with no
  additional logic, so no other namespace in the module runs a query itself."
  (:require
   [toucan2.core :as t2]))

(defn eligible-children
  "The instances of `model-key` whose `fk` column equals `model-id`, additionally matching `conditions` (a map of
  column to value or Toucan 2 operator-vector value, or nil for none)."
  [model-key fk model-id conditions]
  (apply t2/select model-key fk model-id (mapcat identity conditions)))

(defn ids-where
  "The IDs of the instances of `model-key` matching `conditions` (a map of column to value or Toucan 2
  operator-vector value, or nil for every instance)."
  [model-key conditions]
  (apply t2/select-fn-set :id model-key (mapcat identity conditions)))

(defn count-where
  "The number of instances of `model-key` matching `conditions` (a map of column to value or Toucan 2
  operator-vector value, or nil for every instance)."
  [model-key conditions]
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

(defn delete-removed-instances!
  "Deletes the `model-key` rows an import removes (see [[removal-exprs]]); a no-op for a scoped model with no
  synced collections, and a delete of every row when nothing restricts it."
  [model-key removal-opts]
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

(defn unsynced-instance-count
  "The number of `model-key` rows [[delete-removed-instances!]] would remove (see [[removal-exprs]]) that also
  have no RemoteSyncObject of `model-type` in synced status — unsynced local work an import would otherwise wipe
  out."
  [model-key model-type removal-opts]
  (t2/count model-key {:where (unsynced-instance-expr model-key model-type removal-opts)}))

(defn unsynced-instance-names
  "Up to `limit` names of the rows [[unsynced-instance-count]] counts."
  [model-key model-type removal-opts limit]
  (t2/select-fn-vec :name model-key {:where (unsynced-instance-expr model-key model-type removal-opts)
                                     :limit limit}))

(defn instance
  "The instance of `model` with `id`, or nil."
  [model id]
  (t2/select-one model :id id))

(defn instance-with-columns
  "The `columns` of the instance of `model` with `id`, or nil."
  [model columns id]
  (t2/select-one (into [model] columns) :id id))

(defn instance-names
  "The `:id` and `:name` of the instances of `model` with `ids`."
  [model ids]
  (t2/select [model :id :name] :id [:in ids]))

(defn instances-in-collections
  "The instances of `model` in the Collections with `collection-ids`, excluding those archived under the optional
  `archived-key` column."
  [model collection-ids archived-key]
  (t2/select model {:where [:and
                            [:in :collection_id collection-ids]
                            (when archived-key [:= archived-key false])]}))

(defn instances-with-columns-by-entity-ids
  "The `columns` of the instances of `model` with `entity-ids`."
  [model columns entity-ids]
  (t2/select (into [model] columns) :entity_id [:in entity-ids]))

(defn delete-instances!
  "Delete the instances of `model` with `ids`."
  [model ids]
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

(defn tracking-details-by-id
  "The name, table id, collection id, and table name of the `model-key` (Field, Segment, or Measure) instance with
  `model-id`, or nil."
  [model-key model-id]
  (let [{:keys [alias select from join]} (tracking-select-parts model-key)]
    (first (t2/query {:select select :from from :join join :where [:= (keyword alias "id") model-id]}))))

(defn tracking-details-by-entity-ids
  "The `:id`, name, table id, collection id, and table name of the `model-key` (Segment or Measure) instances with
  `entity-ids`."
  [model-key entity-ids]
  (let [{:keys [alias select from join]} (tracking-select-parts model-key)
        id-column (keyword alias "id")]
    (t2/query {:select (into [id-column] select)
               :from   from
               :join   join
               :where  [:in (keyword alias "entity_id") entity-ids]})))

(defn entity-id
  "The entity ID of the instance of `model` with `id`."
  [model id]
  (t2/select-one-fn :entity_id model :id id))

(defn entity-ids-by-id
  "A map of ID to entity ID for the instances of `model` with `ids`."
  [model ids]
  (t2/select-pk->fn :entity_id model :id [:in ids]))

(defn existing-entity-ids
  "The subset of `entity-ids` that instances of `model` have."
  [model entity-ids]
  (t2/select-fn-set :entity_id model :entity_id [:in entity-ids]))

(defn ids-by-entity-ids
  "The IDs of the instances of `model` with `entity-ids`."
  [model entity-ids]
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

(defn tables-at-paths
  "The `:id`, `:name`, and `:collection_id` rows of the Tables at `paths` (`{:db_name :schema :table_name}`)."
  [paths]
  (t2/query {:select [:t.id :t.name :t.collection_id]
             :from   [[:metabase_table :t]]
             :join   [[:metabase_database :db] [:= :db.id :t.db_id]]
             :where  (path-expr paths false)}))

(defn fields-at-paths
  "The `:id`, `:name`, `:table_id`, `:collection_id`, and `:table_name` rows of the Fields at `paths`
  (`{:db_name :schema :table_name :field_name}`)."
  [paths]
  (t2/query {:select [:f.id :f.name :f.table_id [:t.collection_id :collection_id] [:t.name :table_name]]
             :from   [[:metabase_field :f]]
             :join   [[:metabase_table :t] [:= :t.id :f.table_id]
                      [:metabase_database :db] [:= :db.id :t.db_id]]
             :where  (path-expr paths true)}))

(defn card-types
  "The `:id`, `:type`, and `:card_schema` of the Cards with `card-ids`."
  [card-ids]
  (t2/select [:model/Card :id :type :card_schema] :id [:in card-ids]))

(defn field-user-settings-exist?
  "Whether the Field with `field-id` has FieldUserSettings."
  [field-id]
  (t2/exists? :model/FieldUserSettings :field_id field-id))

(defn snippets
  "The `:id`, `:name`, and `:collection_id` of every NativeQuerySnippet."
  []
  (t2/select [:model/NativeQuerySnippet :id :name :collection_id]))

(defn- subtree-expr
  "Matches `collections` and all of their descendants."
  [collections]
  (into [:or [:in :id (map :id collections)]]
        (for [{:keys [id location]} collections]
          [:like :location (str location id "/%")])))

(defn collections
  "The Collections with `collection-ids`."
  [collection-ids]
  (t2/select :model/Collection :id [:in collection-ids]))

(defn collections-by-id
  "A map of ID to the ID, name, location, and personal owner of the Collections with `collection-ids`."
  [collection-ids]
  (t2/select-pk->fn identity [:model/Collection :id :name :location :personal_owner_id] :id [:in collection-ids]))

(defn collection-sync-states
  "The `:id` and `:is_remote_synced` of the Collections with `collection-ids`."
  [collection-ids]
  (t2/select [:model/Collection :id :is_remote_synced] :id [:in collection-ids]))

(defn collection-name-and-id
  "The `:name` and `:collection_id` (its own ID) of the Collection with `collection-id`, or nil."
  [collection-id]
  (t2/select-one [:model/Collection :name [:id :collection_id]] :id collection-id))

(defn library-collection
  "The Library Collection of `library-type`, or nil."
  [library-type]
  (t2/select-one :model/Collection :type library-type))

(defn snippet-collections
  "The `:id` and `:name` of the Collections of the snippets namespace."
  []
  (t2/select [:model/Collection :id :name] :namespace "snippets"))

(defn snippet-collection-ids
  "The IDs of the Collections of the snippets namespace."
  []
  (t2/select-pks-set :model/Collection :namespace "snippets"))

(defn collections-in-namespace
  "The `:id` and `:entity_id` of the Collections of `namespace-name`."
  [namespace-name]
  (t2/select [:model/Collection :id :entity_id] :namespace namespace-name))

(defn collection-ids-in-namespace
  "The IDs of the Collections of `namespace-name`."
  [namespace-name]
  (t2/select-pks-vec :model/Collection :namespace namespace-name))

(defn remote-synced-collection-ids
  "The IDs of the remote-synced Collections."
  []
  (t2/select-pks-vec :model/Collection :is_remote_synced true))

(defn unarchived-remote-synced-root-collection-ids
  "The IDs of the unarchived remote-synced root Collections."
  []
  (t2/select-fn-set :id :model/Collection
                    {:where [:and
                             [:= :is_remote_synced true]
                             [:= :location "/"]
                             [:not :archived]]}))

(defn unarchived-root-collection-ids-in-namespace
  "The IDs of the unarchived root Collections of `namespace-name`."
  [namespace-name]
  (t2/select-fn-set :id :model/Collection
                    {:where [:and
                             [:= :namespace namespace-name]
                             [:= :location "/"]
                             [:not :archived]]}))

(defn subtree-collection-ids
  "The IDs of `collections` and all of their descendants."
  [collections]
  (t2/select-pks-set :model/Collection {:where (subtree-expr collections)}))

(defn remote-synced-subtree-collection-ids
  "The IDs of the remote-synced Collections among `collections` and their descendants."
  [collections]
  (t2/select-pks-set :model/Collection
                     {:where [:and
                              [:= :is_remote_synced true]
                              (subtree-expr collections)]}))

(defn mark-subtree-remote-synced!
  "Mark `collections` and all of their descendants as remote-synced."
  [collections]
  (t2/query {:update (t2/table-name :model/Collection)
             :set    {:is_remote_synced true}
             :where  [:and
                      [:= :is_remote_synced false]
                      (subtree-expr collections)]}))

(defn unmark-collections-remote-synced!
  "Mark the Collections with `collection-ids` as not remote-synced."
  [collection-ids]
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

(defn rso
  "The RemoteSyncObject of the entity `model-type` `model-id`, or nil."
  [model-type model-id]
  (t2/select-one :model/RemoteSyncObject :model_type model-type :model_id model-id))

(defn lock-rso
  "The RemoteSyncObject of the entity `model-type` `model-id`, locked for update, or nil."
  [model-type model-id]
  (t2/select-one :model/RemoteSyncObject
                 {:where [:and [:= :model_type model-type] [:= :model_id model-id]]
                  :for   :update}))

(defn rso-by-file-path
  "The RemoteSyncObject at `file-path`, or nil."
  [file-path]
  (t2/select-one :model/RemoteSyncObject :file_path file-path))

(defn rso-exists?
  "Whether the entity `model-type` `model-id` has a RemoteSyncObject."
  [model-type model-id]
  (t2/exists? :model/RemoteSyncObject :model_type model-type :model_id model-id))

(defn rso-of-type-exists?
  "Whether any entity of `model-type` has a RemoteSyncObject."
  [model-type]
  (t2/exists? :model/RemoteSyncObject :model_type model-type))

(defn rso-count-of-type
  "The number of RemoteSyncObjects of `model-type`."
  [model-type]
  (t2/count :model/RemoteSyncObject :model_type model-type))

(defn rso-keys
  "The `:id`, `:model_type`, and `:model_id` of every RemoteSyncObject."
  []
  (t2/select [:model/RemoteSyncObject :id :model_type :model_id]))

(defn departed-rso-keys
  "The `:id`, `:model_type`, and `:model_id` of the RemoteSyncObjects pending removal or deletion."
  []
  (t2/select [:model/RemoteSyncObject :id :model_type :model_id] :status [:in ["removed" "delete"]]))

(defn all-rso-ids
  "The IDs of every RemoteSyncObject."
  []
  (t2/select-pks-set :model/RemoteSyncObject))

(defn unsynced-rsos
  "The RemoteSyncObjects whose status is not synced."
  []
  (t2/select :model/RemoteSyncObject {:where [:not= :status "synced"]}))

(defn dirty-rso-exists?
  "Whether a RemoteSyncObject of a model type other than `excluded-model-types` is not synced."
  [excluded-model-types]
  (t2/exists? :model/RemoteSyncObject
              {:where [:and
                       [:not= :status "synced"]
                       (when (seq excluded-model-types)
                         [:not-in :model_type excluded-model-types])]}))

(defn dirty-rsos
  "The RemoteSyncObjects of model types other than `excluded-model-types` that are not synced."
  [excluded-model-types]
  (t2/select :model/RemoteSyncObject
             {:where [:and
                      [:not= :status "synced"]
                      (when (seq excluded-model-types)
                        [:not-in :model_type excluded-model-types])]}))

(defn tracked-model-ids
  "The model IDs of the RemoteSyncObjects of `model-type`."
  [model-type]
  (t2/select-fn-set :model_id :model/RemoteSyncObject :model_type model-type))

(defn rsos-of-models
  "The RemoteSyncObjects of the entities of `model-type` with `model-ids`."
  [model-type model-ids]
  (t2/select :model/RemoteSyncObject :model_type model-type :model_id [:in model-ids]))

(defn active-child-rsos
  "The RemoteSyncObjects of `model-type` under the Table with `table-id` that are not pending removal or deletion."
  [model-type table-id]
  (t2/select :model/RemoteSyncObject
             :model_type model-type
             :model_table_id table-id
             :status [:not-in ["removed" "delete"]]))

(defn content-rso-statuses
  "The `:id` and `:status` of the RemoteSyncObjects of the Collections with `collection-ids` and their contents."
  [collection-ids]
  (t2/select [:model/RemoteSyncObject :id :status] {:where (contents-rso-expr collection-ids)}))

(defn content-rsos
  "The `:id`, `:status`, `:model_type`, and `:model_id` of the RemoteSyncObjects of the Collections with
  `collection-ids` and their contents."
  [collection-ids]
  (t2/select [:model/RemoteSyncObject :id :status :model_type :model_id] {:where (contents-rso-expr collection-ids)}))

(defn unarchived-ids
  "The IDs among `ids` of the instances of `model` not archived under the `archived-key` column."
  [model ids archived-key]
  (t2/select-pks-set model :id [:in ids] archived-key false))

(defn removed-content-rso-ids
  "The IDs of the RemoteSyncObjects pending removal among those of the Collections with `collection-ids` and their
  contents."
  [collection-ids]
  (t2/select-pks-set :model/RemoteSyncObject
                     {:where [:and
                              [:= :status "removed"]
                              (contents-rso-expr collection-ids)]}))

(defn insert-rso!
  "Insert the RemoteSyncObject `row`."
  [row]
  (t2/insert! :model/RemoteSyncObject row))

(defn insert-rsos!
  "Insert the RemoteSyncObject `rows`."
  [rows]
  (t2/insert! :model/RemoteSyncObject rows))

(defn update-rso!
  "Apply `changes` to the RemoteSyncObject with `rso-id`."
  [rso-id changes]
  (t2/update! :model/RemoteSyncObject rso-id changes))

(defn set-rsos-status!
  "Set the status of the RemoteSyncObjects with `rso-ids` to `status` as of `timestamp`."
  [rso-ids status timestamp]
  (t2/update! :model/RemoteSyncObject :id [:in rso-ids] {:status status :status_changed_at timestamp}))

(defn mark-all-rsos-synced!
  "Mark every RemoteSyncObject as synced as of `timestamp`."
  [timestamp]
  (t2/update! :model/RemoteSyncObject {:status "synced" :status_changed_at timestamp}))

(defn mark-rsos-synced!
  "Mark the RemoteSyncObjects with `rso-ids` as synced as of `timestamp`, writing the `:file_path` and
  `:content_hash` of those in `metadata-by-id` and keeping the existing values of the others."
  [rso-ids metadata-by-id timestamp]
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

(defn delete-rso!
  "Delete the RemoteSyncObject with `rso-id`."
  [rso-id]
  (t2/delete! :model/RemoteSyncObject rso-id))

(defn delete-rsos!
  "Delete the RemoteSyncObjects with `rso-ids`."
  [rso-ids]
  (t2/delete! :model/RemoteSyncObject :id [:in rso-ids]))

(defn delete-rso-of!
  "Delete the RemoteSyncObject of the entity `model-type` `model-id`."
  [model-type model-id]
  (t2/delete! :model/RemoteSyncObject :model_type model-type :model_id model-id))

(defn delete-rsos-of-type!
  "Delete the RemoteSyncObjects of `model-type`."
  [model-type]
  (t2/delete! :model/RemoteSyncObject :model_type model-type))

(defn delete-rsos-of-models!
  "Delete the RemoteSyncObjects of the entities of `model-type` with `model-ids`."
  [model-type model-ids]
  (t2/delete! :model/RemoteSyncObject :model_type model-type :model_id [:in model-ids]))

(defn delete-rsos-of-keys!
  "Delete the RemoteSyncObjects of the `[{:model_type :model_id}]` `rows`."
  [rows]
  (t2/delete! :model/RemoteSyncObject {:where (rso-keys-expr rows)}))

(defn delete-all-rsos!
  "Delete every RemoteSyncObject."
  []
  (t2/delete! :model/RemoteSyncObject))

(defn task
  "The RemoteSyncTask with `task-id`, or nil."
  [task-id]
  (t2/select-one :model/RemoteSyncTask task-id))

(defn lock-task
  "The RemoteSyncTask with `task-id`, locked for update, or nil."
  [task-id]
  (t2/select-one :model/RemoteSyncTask :id task-id {:for :update}))

(defn task-cancelled?
  "The cancelled flag of the RemoteSyncTask with `task-id`."
  [task-id]
  (t2/select-one-fn :cancelled :model/RemoteSyncTask :id task-id))

(defn current-task
  "The newest started, unfinished RemoteSyncTask that reported progress after `progress-cutoff`, or nil."
  [progress-cutoff]
  (t2/select-one :model/RemoteSyncTask
                 {:where    [:and
                             [:<> :started_at nil]
                             [:= :ended_at nil]
                             [:< progress-cutoff :last_progress_report_at]]
                  :limit    1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(defn most-recent-task
  "The newest started RemoteSyncTask, or nil."
  []
  (t2/select-one :model/RemoteSyncTask
                 {:where    [:and
                             [:<> :started_at nil]]
                  :limit    1
                  :order-by [[:started_at :desc]
                             [:id :desc]]}))

(defn last-successful-task
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

(defn insert-task!
  "Insert `task` and return the new instance."
  [task]
  (t2/insert-returning-instance! :model/RemoteSyncTask task))

(defn update-task!
  "Apply `changes` to the RemoteSyncTask with `task-id`."
  [task-id changes]
  (t2/update! :model/RemoteSyncTask task-id changes))

(defn supersede-stale-tasks!
  "Cancel and end at `now` the started, unfinished RemoteSyncTasks that last reported progress before `cutoff`."
  [cutoff now]
  (t2/query {:update (t2/table-name :model/RemoteSyncTask)
             :set    {:cancelled     true
                      :ended_at      now
                      :error_message "Superseded after staleness timeout"}
             :where  [:and
                      [:<> :started_at nil]
                      [:= :ended_at nil]
                      [:< :last_progress_report_at cutoff]]}))

(defn delete-tasks-started-before!
  "Delete the RemoteSyncTasks started before `cutoff`, returning the number deleted."
  [cutoff]
  (t2/delete! :model/RemoteSyncTask {:where [:< :started_at cutoff]}))

(defn users-by-id
  "A map of User ID to User for `user-ids`."
  [user-ids]
  (t2/select-pk->fn identity :model/User :id [:in user-ids]))
