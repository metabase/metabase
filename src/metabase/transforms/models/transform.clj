(ns metabase.transforms.models.transform
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.audit-app.core :as audit]
   [metabase.collection-items.spec :as collection-items]
   [metabase.collections.models.collection :as collection]
   [metabase.dependencies.core :as dependencies]
   [metabase.eid-translation.spec :as eid-translation]
   [metabase.events.core :as events]
   [metabase.indexes.models.table-index :as table-index]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.replacement.spec :as replacement]
   [metabase.revisions.core :as revisions]
   [metabase.search.core :as search]
   [metabase.serialization.core :as serialization]
   [metabase.staleness.core :as staleness]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.ordering :as transforms-base.ordering]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.audit :as transforms.audit]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.dependencies :as transforms.dependencies]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.models.transform-transform-tag :as transform-transform-tag]
   [metabase.transforms.replacement :as transforms.replacement]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.search :as transforms.search]
   [metabase.transforms.serialization :as transforms.serialization]
   [metabase.transforms.staleness :as transforms.staleness]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [metabase.warehouses.models.database :as database]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/Transform [_model] :transform)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped?]]
  (derive :model/Transform trait))

(mu/defn transform-source-out :- ::transforms.schema/transform-source
  "Deserialize a transform source map from JSON storage format, normalized to its schema."
  [m :- [:or :string [:fn map?]]]
  (lib/normalize ::transforms.schema/transform-source (cond-> m (string? m) mi/json-out-without-keywordization)))

(mu/defn transform-source-in :- :string
  "Serialize a transform source map for JSON storage."
  [m :- ::transforms.schema/transform-source]
  (-> m
      (m/update-existing :query (comp lib/prepare-for-serialization lib-be/normalize-query))
      mi/json-in))

(t2/deftransforms :model/Transform
  {:source_type        mi/transform-keyword
   :source             {:out transform-source-out, :in transform-source-in}
   :target             mi/transform-json
   ;; nil round-trips as NULL
   :table_dependencies {:in #(some-> % mi/json-in), :out mi/json-out-with-keywordization}
   :run_trigger        mi/transform-keyword})

(defmethod collection/allowed-namespaces :model/Transform
  [_]
  #{:transforms})

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(defn- source-database-id
  "The Database id the source of `transform` names, or nil when it names none, as a Python source without a
  `:source-database` does."
  [transform]
  (transforms-base.i/source-db-id (dissoc transform :target_db_id)))

(defn- derived-columns
  "The columns of `transform` computed from its source and target, whatever values it came with: `source_database_id`
  only when the source names a Database, else it is the caller's."
  [{:keys [source] :as transform}]
  (let [transform (dissoc transform :target_db_id)]
    (cond-> {:source_type  (transforms-base.u/transform-source-type source)
             :target_db_id (transforms-base.i/target-db-id transform)}
      (source-database-id transform) (assoc :source_database_id (source-database-id transform)))))

(defn check-incremental-table-tag
  "Throws a 400 when `transform` writes an incremental table from a native query that has no table variable for the
  incremental range filter, a variable of the table of its checkpoint Field when there is one."
  [{:keys [source target]}]
  (let [transform {:source source :target target}]
    (when (and (transforms-base.u/incremental-target? transform)
               (transforms-base.u/native-query-transform? transform))
      (let [field-id (get-in source [:source-incremental-strategy :checkpoint-filter-field-id])]
        (when-not (transforms-base.u/table-template-tag-name (:query source)
                                                             (some-> field-id transforms.db/field :table_id))
          (throw (ex-info (tru "Incremental transform with a native query requires a table variable. Please add a table variable to the query and update the checkpoint field.")
                          {:status-code 400})))))))

(t2/define-before-insert :model/Transform
  [transform]
  (let [transform (merge transform (derived-columns transform))]
    (assoc-in transform [:target :database] (:target_db_id transform))))

(defn- definition-changed?
  "Whether the pending changes of `transform` change its source or its target."
  [transform]
  (let [changes (t2/changes transform)]
    (or (contains? changes :source) (contains? changes :target))))

(defn- checkpoint-field-changed?
  "Whether `transform` had an incremental checkpoint Field that its pending changes replace."
  [transform]
  (let [old-field-id (get-in (t2/original transform) [:source :source-incremental-strategy :checkpoint-filter-field-id])
        new-field-id (get-in transform [:source :source-incremental-strategy :checkpoint-filter-field-id])]
    (and old-field-id (not= old-field-id new-field-id))))

(t2/define-before-update :model/Transform
  [transform]
  (let [changes    (t2/changes transform)
        definition (when (definition-changed? transform) (merge transform (derived-columns transform)))]
    (when (and (or (contains? changes :source_type)
                   (and (contains? changes :source_database_id) (source-database-id transform)))
               (not (contains? changes :source)))
      (throw (ex-info (tru "source_type and source_database_id follow the source; change the source instead.")
                      {:status-code 400})))
    (when (and (contains? changes :target_db_id) (not definition))
      (throw (ex-info (tru "target_db_id follows the source and the target; change them instead.")
                      {:status-code 400})))
    (cond-> transform
      definition
      (merge (select-keys definition [:source_type :source_database_id :target_db_id]))

      (contains? changes :source)
      (assoc :table_dependencies nil)

      (checkpoint-field-changed? transform)
      (assoc :last_checkpoint_value nil))))

(t2/define-after-select :model/Transform
  [{:keys [source] :as transform}]
  (if source
    (assoc transform :source_type (transforms-base.u/transform-source-type source))
    transform))

;;; -------------------------------------------------- Operations --------------------------------------------------

(mu/defn update-transform-tags! :- :nil
  "Update the tags associated with a transform using smart diff logic. Only modifies what has changed: deletes removed
  tags, updates positions for moved tags, and inserts new tags. Duplicate tag IDs are automatically deduplicated."
  [transform-id :- [:maybe ::lib.schema.id/transform]
   tag-ids      :- [:sequential ms/PositiveInt]]
  (when transform-id
    (t2/with-transaction [_conn]
      (let [;; Deduplicate while preserving order of first occurrence
            deduped-tag-ids      (vec (distinct tag-ids))
            ;; Get current associations
            current-associations (transforms.db/transform-tag-links [transform-id])
            current-tag-ids      (mapv :tag_id current-associations)
            ;; Validate that new tag IDs exist
            valid-tag-ids        (when (seq deduped-tag-ids)
                                   (into #{} (transforms.db/existing-tag-ids deduped-tag-ids)))
            ;; Filter to only valid tags, preserving order
            new-tag-ids          (if valid-tag-ids
                                   (filterv valid-tag-ids deduped-tag-ids)
                                   [])
            ;; Calculate what needs to change
            current-set          (set current-tag-ids)
            new-set              (set new-tag-ids)
            to-delete            (set/difference current-set new-set)
            to-insert            (set/difference new-set current-set)
            ;; Build position map for new ordering
            new-positions        (zipmap new-tag-ids (range))]
        ;; Delete removed associations
        (when (seq to-delete)
          (transform-transform-tag/delete-transform-transform-tags! transform-id to-delete))
        ;; Update positions for existing tags that moved
        (transform-transform-tag/update-transform-transform-tags! transform-id (select-keys new-positions current-set))
        ;; Insert new associations with correct positions
        (when (seq to-insert)
          (transform-transform-tag/create-transform-transform-tags!
           (for [tag-id to-insert]
             {:transform_id transform-id
              :tag_id       tag-id
              :position     (get new-positions tag-id)})))))
    nil))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(mr/def ::instance
  "A Transform as the permission checks see it: a stored row, a hydrated one, one with pending changes merged in, a
  create request, or the snapshot of a Revision."
  [:or
   ::transforms.schema/transform
   ::transforms.u/create-body
   ::transforms.schema/transform.revision])

(mu/defn- transform-readable? :- :boolean
  "Whether the current user can read `instance`, with its source looked up in `models-cache` when given."
  ([instance :- ::instance]
   (transform-readable? instance nil))
  ([instance     :- ::instance
    models-cache :- [:maybe ::transforms.u/source-models]]
   (transforms.u/source-readable? (transforms.u/->definition instance) models-cache)))

(mu/defn- native-transform-write-allowed? :- [:maybe :boolean]
  [instance     :- ::instance
   source-db-id :- [:maybe ::lib.schema.id/database]]
  (or (not (transforms-base.u/native-query-transform? instance))
      (and source-db-id
           (= :query-builder-and-native
              (get (perms/every-table-in-database-permissions-for-user (perms/user-info api/*current-user-id*) :perms/create-queries [source-db-id]) source-db-id)))))

(mu/defn- transform-database-permissions? :- :boolean
  [instance :- ::instance]
  (let [source-db-id (or (transforms-base.i/source-db-id instance) (:source_database_id instance))
        target-db-id (transforms-base.i/target-db-id instance)]
    (every? #(perms/user-has-transforms-permission-for-database? (perms/user-info api/*current-user-id*) %)
            (distinct (keep identity [source-db-id target-db-id])))))

(mu/defn- transform-writable? :- [:maybe :boolean]
  "Whether the current user can write `instance`, with its source looked up in `models-cache` when given."
  ([instance :- ::instance]
   (transform-writable? instance nil))
  ([instance     :- ::instance
    models-cache :- [:maybe ::transforms.u/source-models]]
   (and (transforms.u/check-feature-enabled (transforms.u/->definition instance))
        (or api/*is-superuser?*
            (and (transform-readable? instance models-cache)
                 (transform-database-permissions? instance)
                 (native-transform-write-allowed? instance (:source_database_id instance)))))))

(defn- transform-deletable?
  "Whether the current user can write `instance` as a whole, which nobody can when a read-only instance syncs it."
  ([instance]
   (transform-deletable? instance nil))
  ([instance models-cache]
   (and (not (remote-sync/read-only?))
        (transform-writable? instance models-cache))))

(methodical/defmethod t2/batched-hydrate [:model/Transform :can_query]
  "Whether the current user can query each of `transforms`, which is whether they can read it."
  [_model k transforms]
  (for [transform (t2/hydrate transforms :can_read)]
    (when transform
      (assoc transform k (boolean (mi/can-read? transform))))))

(defn- unsynced-change-writable?
  "Whether the current user can apply `changes` that touch no synced column of `instance`, which a read-only instance
  still accepts."
  [instance changes]
  (and (not (remote-sync/synced-changes? :model/Transform instance changes))
       (transform-writable? instance)))

(defmethod mi/can-update? :model/Transform
  [instance changes]
  (and (or (mi/can-write? instance)
           (unsynced-change-writable? instance changes))
       (transform-writable? (merge instance changes))))

(defmethod mi/can-create? :model/Transform
  [_model instance]
  ;; Inline can-write? logic since instance is a plain map without model metadata.
  ;; can-write? requires: not a read-only remote sync instance, can-read? and user-has-transforms-permission-for-database?
  ;; can-read? requires: is-superuser? OR (entitled-data-analyst? AND source-tables-readable?)
  (and (not (remote-sync/read-only?))
       (transforms.u/check-feature-enabled (transforms.u/->definition instance))
       (or api/*is-superuser?*
           (let [source-db-id (or (:source_database_id instance) (transforms-base.i/source-db-id instance))]
             (and (api/entitled-data-analyst?)
                  (transforms.u/source-tables-readable? (transforms.u/->definition instance))
                  (transform-database-permissions? instance)
                  (native-transform-write-allowed? instance source-db-id))))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mu/defn- hydrate-permission
  "Batched-hydrate helper: attach a permission under `k` to each transform by calling `pred`
   (`transform-readable?`/`transform-writable?`) with a `models-cache` prefetched once for the whole
   list, so checking N transforms doesn't issue a query per transform."
  [k          :- :keyword
   transforms :- [:sequential ::instance]
   pred       :- [:=> [:cat ::instance ::transforms.u/source-models] [:maybe :boolean]]]
  (let [models-cache (transforms.u/prefetch-source-models (into [] (remove nil?) transforms))]
    (for [transform transforms]
      (when transform
        (assoc transform k (boolean (pred transform models-cache)))))))

(methodical/defmethod t2/batched-hydrate [:model/Transform :can_read]
  "Add can_read to transforms."
  [_model k transforms]
  (for [transform (hydrate-permission k transforms transform-readable?)]
    (when transform
      (vary-meta transform assoc k (boolean (get transform k))))))

(methodical/defmethod t2/batched-hydrate [:model/Transform :can_write]
  "Add can_write to transforms."
  [_model k transforms]
  (hydrate-permission k transforms transform-deletable?))

(methodical/defmethod t2/batched-hydrate [:model/Transform :can_execute]
  "Add can_execute to transforms. Executing a transform requires write permission."
  [_model k transforms]
  (hydrate-permission k transforms transform-writable?))

(methodical/defmethod t2/batched-hydrate [:model/TransformRun :transform]
  "Add transform to a TransformRun. For orphaned runs (where transform was deleted),
   returns a map with :name from the denormalized transform_name and :deleted true."
  [_model _k runs]
  (if-not (seq runs)
    runs
    (let [transform-ids (into #{} (keep :transform_id) runs)
          id->transform (when (seq transform-ids)
                          (transforms.db/transform-summaries-by-id transform-ids))]
      (for [run runs]
        (assoc run :transform
               (if-let [transform-id (:transform_id run)]
                 (get id->transform transform-id)
                 ;; Orphaned run - use denormalized transform_name
                 (when-let [name (:transform_name run)]
                   (t2.instance/instance :model/Transform {:name name :deleted true}))))))))

(methodical/defmethod t2/batched-hydrate [:model/Transform :last_run]
  "Add last_run to a transform"
  [_model _k transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids (into #{} (map :id) transforms)
          last-runs (m/index-by :transform_id (transform-run/latest-runs transform-ids))]
      (for [{transform-id :id :as transform} transforms]
        (let [{:keys [status checkpoint_hi_value] :as last-run} (get last-runs transform-id)
              transform (assoc transform :last_run (dissoc last-run :last_heartbeat))]
          (if (and (= status :succeeded) checkpoint_hi_value)
            ;; ensure consistency of last_checkpoint_value with last_run
            (if (:last_checkpoint_value transform)
              (assoc transform :last_checkpoint_value checkpoint_hi_value)
              ;; latest transform value wins, could be reset
              (assoc transform :last_checkpoint_value
                     (transforms.db/transform-last-checkpoint-value transform-id)))
            transform))))))

(methodical/defmethod t2/batched-hydrate [:model/Transform :transform_tag_ids]
  "Add tag_ids to a transform, preserving the order defined by position"
  [_model _k transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids (into #{} (map :id) transforms)
          tag-associations (transforms.db/transform-tag-links transform-ids)
          transform-id->tag-ids (reduce
                                 (fn [acc {:keys [transform_id tag_id]}]
                                   (update acc transform_id (fnil conj []) tag_id))
                                 {}
                                 tag-associations)]
      (for [transform transforms] (assoc transform :tag_ids (vec (get transform-id->tag-ids (:id transform) [])))))))

(methodical/defmethod t2/batched-hydrate [:model/Transform :creator]
  "Add creator (user) to a transform"
  [_model _k transforms]
  (if-not (seq transforms)
    transforms
    (let [creator-ids (into #{} (map :creator_id) transforms)
          id->creator (transforms.db/user-summaries-by-id creator-ids)]
      (for [transform transforms]
        (assoc transform :creator (get id->creator (:creator_id transform)))))))

(methodical/defmethod t2/batched-hydrate [:model/Transform :owner]
  "Add owner (user) to a transform. If owner_user_id is set, fetches the user.
   If owner_email is set instead, returns a map with just the email."
  [_model _k transforms]
  (if-not (seq transforms)
    transforms
    (let [owner-user-ids (into #{} (keep :owner_user_id) transforms)
          id->owner (when (seq owner-user-ids)
                      (transforms.db/user-summaries-by-id owner-user-ids))]
      (for [transform transforms]
        (assoc transform :owner
               (cond
                 (:owner_user_id transform)
                 (get id->owner (:owner_user_id transform))

                 (:owner_email transform)
                 {:email (:owner_email transform)}))))))

(mi/define-batched-hydration-method tags
  :tags
  "Fetch tags"
  [transforms]
  (when (seq transforms)
    (let [transform-ids (into #{} (map u/the-id) transforms)
          tag-mappings  (group-by :transform_id
                                  (transforms.db/transform-tag-links transform-ids))]
      (for [transform transforms]
        (assoc transform :tags (get tag-mappings (u/the-id transform) []))))))

(mi/define-batched-hydration-method indexes
  :indexes
  "Fetch the table indexes that belong to each transform"
  [transforms]
  (when (seq transforms)
    (let [transform-ids (into #{} (map u/the-id) transforms)
          idx-mappings  (group-by :transform_id
                                  (filter table-index/applicable?
                                          (transforms.db/table-indexes-for-transforms transform-ids)))]
      (for [transform transforms]
        (assoc transform :indexes (get idx-mappings (u/the-id transform) []))))))

(mi/define-batched-hydration-method table-with-db-and-fields
  :table-with-db-and-fields
  "Fetch tables with their fields. The tables show up under the `:table` property."
  [transforms]
  (let [table-ids (into #{} (keep :target_table_id) transforms)
        id->table (when (seq table-ids)
                    (m/index-by :id (-> (transforms.db/tables table-ids)
                                        (t2/hydrate :db :fields))))]
    (for [transform transforms]
      (assoc transform :table
             (get id->table (:target_table_id transform))))))

;;; ----------------------------------------------------- Writes -----------------------------------------------------

(defenterprise delete-transform-tests!
  "Deletes the tests of the transforms with `transform-ids` through their model, which publishes a delete event for each
  and sets the test id of their runs to nil, as a database cascade would not; a no-op in OSS."
  metabase-enterprise.data-testing.models
  [_transform-ids]
  nil)

(defn- check-collections!
  "Throws unless each Collection with `collection-ids` can hold Transforms."
  [collection-ids]
  (when-let [collection-ids (not-empty (into [] (comp (remove nil?) (distinct)) collection-ids))]
    (let [collections (u/index-by :id (transforms.db/collections-for-content-checks collection-ids))]
      (doseq [collection-id collection-ids
              :let [collection (or (collections collection-id) (collection/content-parent collection-id))]]
        (collection/check-collection-namespace :model/Transform collection)
        (collection/check-allowed-content :model/Transform collection)))))

(defn- check-target-databases!
  "Throws a 400 unless each Database with `database-ids` can hold the tables of a transform."
  [database-ids]
  (let [database-ids (into [] (comp (remove nil?) (distinct)) database-ids)
        id->database (u/index-by :id (when (seq database-ids) (transforms.db/databases-by-ids database-ids)))]
    (doseq [database-id database-ids
            :let        [database (id->database database-id)]]
      (when-not database
        (throw (ex-info (tru "The target database cannot be found.") {:status-code 400})))
      (when (:is_sample database)
        (throw (ex-info (tru "Cannot run transforms on the sample database.") {:status-code 400})))
      (when (:is_audit database)
        (throw (ex-info (tru "Cannot run transforms on audit databases.") {:status-code 400})))
      (when (:router_database_id database)
        (throw (ex-info (tru "Cannot run transforms on a destination database of database routing.") {:status-code 400}))))))

(defn- check-cycles!
  "Throws a 400 for the first of the query transforms among `transforms` that has become part of a cycle of transforms
  feeding one another."
  [transforms]
  (when-let [queries (not-empty (filterv transforms-base.u/query-transform? transforms))]
    (when-let [{:keys [cycle-str]} (some identity (transforms-base.ordering/get-transform-cycles queries))]
      (throw (ex-info (str "Cyclic transform definitions detected: " cycle-str)
                      {:status-code 400})))))

(defn- unresolved-merge-key-table-id
  "The ID of the target Table of `transform` when its merge unique key still has columns known by name only, or nil."
  [{:keys [source target target_table_id]}]
  (when (and target_table_id
             (transforms-base.u/merge-target? {:source source :target target})
             (some #(nil? (:field-id %)) (get-in target [:target-incremental-strategy :unique-key])))
    target_table_id))

(defn- with-resolved-merge-key
  "`target`, the target of a transform, with the `:field-id` of the columns of its merge unique key filled from
  `name->id`, a map from the name of an active Field of its target table to its id."
  [target name->id]
  (update-in target [:target-incremental-strategy :unique-key]
             (fn [unique-key]
               (mapv (fn [e] (cond-> e (:name e) (assoc :field-id (name->id (:name e)))))
                     unique-key))))

(defn- definition-columns-changed?
  "Whether `changes` give the `source` or the `target` of the stored `transform` another value."
  [transform changes]
  (boolean (some (fn [k] (and (contains? changes k) (not= (get transform k) (get changes k))))
                 [:source :target])))

(defn- with-resolved-merge-keys
  "`changes-by-id`, a map from the id of a Transform to its changes, with the `:target` of each Transform whose merge
  unique key would still have columns known by name only, once the changes apply to its row in `stored`, replaced by
  one whose columns have their Field ids, the Fields of all their target tables read at once."
  [changes-by-id stored]
  (let [table-ids (into #{}
                        (keep (fn [[id changes]] (unresolved-merge-key-table-id (merge (stored id) changes))))
                        changes-by-id)
        fields    (when (seq table-ids) (transforms.db/active-field-ids-by-names (vec table-ids)))]
    (into {}
          (map (fn [[id changes]]
                 (let [merged (merge (stored id) changes)]
                   [id (if-let [table-id (unresolved-merge-key-table-id merged)]
                         (assoc changes :target (with-resolved-merge-key (:target merged) (get fields table-id {})))
                         changes)])))
          changes-by-id)))

(mu/defn create-transforms! :- [:sequential ::transforms.schema/transform]
  "Insert the Transform `rows` in one transaction, publishing their create event, and return the inserted transforms.
  Throws unless the Collection of each can hold Transforms and its target Database can hold the tables of a transform."
  [rows :- [:sequential ::transforms.schema/transform.create]]
  (if (seq rows)
    (do (check-collections! (map :collection_id rows))
        (check-target-databases! (map (comp :target_db_id derived-columns) rows))
        (t2/with-transaction [_conn]
          (let [transforms (transforms.db/insert-transforms! rows)]
            (events/publish-event! :event/transform-create (events/create-event transforms))
            transforms)))
    []))

(defn- check-update-group!
  "Run the checks of an update that gives the Transforms with `ids`, whose stored rows are in `stored` and whose
  requested changes are in `requested`, the changes `changes`, before it is written: the new Collection and the target
  Database can hold Transforms, the new definition of a query transform causes no cycle, and the index requests of a
  changed definition are marked for revalidation."
  [ids stored requested changes]
  (when (and (contains? changes :collection_id)
             (some #(not= (:collection_id (stored %)) (:collection_id changes)) ids))
    (check-collections! [(:collection_id changes)]))
  (when-let [changed (not-empty (filterv #(definition-columns-changed? (stored %) (requested %)) ids))]
    (let [definitions (mapv #(let [merged (merge (stored %) changes)] (merge merged (derived-columns merged))) changed)]
      (check-target-databases! (map :target_db_id definitions))
      (check-cycles! definitions)
      (table-index/mark-for-revalidation! changed))))

(defn- updated-transform
  "The Transform `stored` as the update `changes` leaves it, with the columns that the hooks derive from them."
  [stored changes]
  (let [merged (merge stored changes)]
    (cond-> (merge stored changes)
      (contains? changes :source)
      (assoc :source (transform-source-out (:source changes)))

      (definition-columns-changed? stored changes)
      (merge (select-keys (derived-columns merged) [:source_type :source_database_id :target_db_id]))

      (and (contains? changes :source) (not= (:source stored) (:source changes)))
      (assoc :table_dependencies nil)

      (let [old-field-id (get-in stored [:source :source-incremental-strategy :checkpoint-filter-field-id])
            new-field-id (get-in merged [:source :source-incremental-strategy :checkpoint-filter-field-id])]
        (and (definition-columns-changed? stored changes) old-field-id (not= old-field-id new-field-id)))
      (assoc :last_checkpoint_value nil))))

(mu/defn update-transforms! :- [:sequential ::transforms.schema/transform.update]
  "Apply the changes in each of `rows`, the id of a Transform and the columns to change, in one transaction, with one
  statement per distinct change set, publishing their update event. Before each statement, throws unless the new
  Collection and target Database can hold Transforms and the new definition of a query transform causes no cycle,
  marks the index requests of a changed definition for revalidation, and fills the Field ids of a merge unique key once
  its target table exists. Returns `rows`."
  ([rows :- [:sequential ::transforms.schema/transform.update]]
   (update-transforms! rows nil))
  ([rows :- [:sequential ::transforms.schema/transform.update]
    opts :- ::transforms.schema/write-opts]
   (when (seq rows)
     (t2/with-transaction [_conn]
       (let [stored    (u/index-by :id (transforms.db/transforms (mapv :id rows)))
             requested (into {} (comp (filter (comp stored :id)) (map (juxt :id #(dissoc % :id)))) rows)
             resolved  (with-resolved-merge-keys requested stored)]
         (doseq [[changes ids] (update-vals (group-by resolved (keys requested)) vec)
                 :when         (seq changes)]
           (check-update-group! ids stored requested changes)
           (transforms.db/update-transforms! ids changes))
         (events/publish-event! :event/transform-update
                                (events/update-event stored
                                                     (mapv (fn [id] (assoc (resolved id) :id id)) (keys requested))
                                                     (assoc opts :objects (into {}
                                                                                (map (fn [id] [id (updated-transform (stored id) (resolved id))]))
                                                                                (keys requested))))))))
   (vec rows)))

(mu/defn delete-transforms! :- :nil
  "Delete the Transforms with `transform-ids`, and their tests, in one transaction, publishing their delete event."
  [transform-ids :- [:sequential ::lib.schema.id/transform]]
  (when (seq transform-ids)
    (t2/with-transaction [_conn]
      (let [transforms (vec (transforms.db/transforms (vec transform-ids)))]
        (delete-transform-tests! (vec transform-ids))
        (events/publish-event! :event/transform-delete (events/delete-event transforms))
        (transforms.db/delete-transforms! (vec transform-ids)))))
  nil)

(defmethod transforms-base.u/record-run-changes! :model/Transform
  [_model transform-id changes]
  (update-transforms! [(assoc changes :id transform-id)])
  nil)

(mu/defn set-table-dependencies! :- :int
  "Store `dependencies-json` as the cached table dependencies of the Transform with `transform-id`, a cache no rule
  reads and no event reports, in one plain statement."
  [transform-id      :- ::lib.schema.id/transform
   dependencies-json :- :string]
  (transforms.db/set-table-dependencies! transform-id dependencies-json))

(defmethod database/delete-for-databases! :model/Transform
  [_model databases]
  (delete-transforms! (transforms.db/transform-ids-for-source-databases (mapv :id databases))))

(defn- revert-transform!
  "Return the Transform with `id` to the `snapshot` of a Transform that a Revision recorded."
  [id _user-id snapshot]
  (update-transforms! [(assoc snapshot :id id)] {:writer :revert}))

(def ^:private revision-columns
  "The columns a revision of a Transform records and a revert restores."
  [:name :description :collection_id :owner_email :owner_user_id :source :source_database_id :source_type
   :target :target_db_id])

;;; ----------------------------------------------------- Specs ------------------------------------------------------

(defmethod app-db-copy/spec :model/Transform [_model]
  {:skip? false})

(defmethod serialization/spec :model/Transform [_]
  {:schema              ::transforms.schema/external-transform
   :copy                [:name :description :entity_id :owner_email]
   :skip                [:source_type :target_db_id :target_table_id :last_checkpoint_value :table_dependencies]
   :transform           {:creator_id         serialization/user-transform
                         :owner_user_id      serialization/user-transform
                         :collection_id      (serialization/fk-transform :model/Collection)
                         :source_database_id serialization/database-transform
                         :source             transforms.serialization/source-transform
                         :target             transforms.serialization/target-transform}
   :insert!             create-transforms!
   :update!             #(update-transforms! % {:writer :import})
   :delete!             delete-transforms!
   :children            {:tags    :model/TransformTransformTag
                         :indexes :model/TableIndex}
   :storage-paths       transforms.serialization/transform-storage-paths
   :import-dependencies transforms.serialization/transform-import-dependencies
   :loaded-entities     transforms.serialization/transform-loaded-entities})

(defmethod remote-sync/spec :model/Transform
  [_model]
  {:synced-items transforms.db/synced-transform-items})

(defmethod revisions/spec :model/Transform [_model]
  {:track     revision-columns
   :skip      [:creator_id :entity_id :last_checkpoint_value :table_dependencies :target_table_id]
   :schema    ::transforms.schema/transform.revision
   :authorize :snapshot
   :revert!   revert-transform!})

(defmethod audit/spec :model/Transform [_model]
  {:track          [:name :description :target]
   :track-redacted [:collection_id :creator_id :owner_email :owner_user_id :source :source_database_id :source_type
                    :target_db_id]
   :skip           [:entity_id :last_checkpoint_value :table_dependencies :target_table_id]
   :details        transforms.audit/details
   :topics         {:create :transform-create
                    :update :update-transform
                    :delete :transform-delete}})

(defmethod search/spec :model/Transform
  [_model]
  {"transform"
   {:visibility   :superuser
    :attrs        {:archived      false
                   :collection-id false
                   :creator-id    false
                   :created-at    true
                   :updated-at    true
                   :view-count    false
                   :native-query  {:fn transforms.search/maybe-extract-transform-query-text
                                   :fields [:source :source_type]}
                   :database-id   :source_database_id
                   :source-type   true}
    :search-terms [:name :description]
    :render-terms {:transform-name :name
                   :transform-id   :id}}})

(defmethod dependencies/spec :model/Transform [_model]
  {:type  :transform
   :items transforms.db/dependency-transform-items

   :hydrate            transforms.dependencies/hydrate
   :dependencies       transforms.dependencies/dependencies
   :analysis           transforms.dependencies/analysis
   :after-dependencies transforms.dependencies/after-dependencies

   :dependency-columns #{:source :target}
   :analysis-columns   #{:source :target}})

(defmethod replacement/spec :model/Transform [_model]
  {:upgrade-field-refs transforms.replacement/upgrade-field-refs
   :swap-source        transforms.replacement/swap-source
   :update!            update-transforms!})

(defmethod collection-items/spec :model/Transform [_model]
  {"transform" {:items transforms.db/collection-transform-items}})

(defmethod staleness/spec :model/Transform [_model]
  {:candidates transforms.staleness/stale-transform-candidates})

(defmethod eid-translation/spec :model/Transform [_model]
  {:names [:transform]})
