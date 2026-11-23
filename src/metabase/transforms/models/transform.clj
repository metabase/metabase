(ns metabase.transforms.models.transform
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
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

(mr/def ::database-permissions
  "What the current user may do on the source and target Databases of some transforms, as
  [[prefetch-database-permissions]] answers it: whether they hold the transforms permission, and their level of
  `:perms/create-queries` on every table, for each Database."
  [:map {:closed true}
   [:transforms     [:map-of ::lib.schema.id/database :boolean]]
   [:create-queries [:map-of ::lib.schema.id/database [:or :keyword :string]]]])

(mu/defn- database-ids :- [:sequential ::lib.schema.id/database]
  "The ids of the source and target Databases of `instance`, as the permission checks read them."
  [instance :- ::instance]
  (into [] (distinct) (keep identity [(or (transforms-base.i/source-db-id instance) (:source_database_id instance))
                                      (transforms-base.i/target-db-id instance)])))

(mu/defn- prefetch-database-permissions :- ::database-permissions
  "What the current user may do on the Databases of `transforms`, each read once for all of them."
  [transforms :- [:sequential ::instance]]
  (let [db-ids (into [] (comp (mapcat database-ids) (distinct)) transforms)
        user   (perms/user-info api/*current-user-id*)]
    {:transforms     (into {} (map (fn [db-id] [db-id (perms/user-has-transforms-permission-for-database? user db-id)])) db-ids)
     :create-queries (if (seq db-ids)
                       (perms/every-table-in-database-permissions-for-user user :perms/create-queries db-ids)
                       {})}))

(mu/defn- native-transform-write-allowed? :- [:maybe :boolean]
  [instance     :- ::instance
   source-db-id :- [:maybe ::lib.schema.id/database]
   db-perms     :- [:maybe ::database-permissions]]
  (or (not (transforms-base.u/native-query-transform? instance))
      (and source-db-id
           (= :query-builder-and-native
              (get (or (:create-queries db-perms)
                       (perms/every-table-in-database-permissions-for-user (perms/user-info api/*current-user-id*) :perms/create-queries [source-db-id]))
                   source-db-id)))))

(mu/defn- transform-database-permissions? :- :boolean
  [instance :- ::instance
   db-perms :- [:maybe ::database-permissions]]
  (every? #(if-some [answer (get-in db-perms [:transforms %])]
             answer
             (perms/user-has-transforms-permission-for-database? (perms/user-info api/*current-user-id*) %))
          (database-ids instance)))

(mu/defn- transform-writable? :- [:maybe :boolean]
  "Whether the current user can write `instance`, with its source looked up in `models-cache` and the permissions on
  its Databases in `db-perms` when given."
  ([instance :- ::instance]
   (transform-writable? instance nil nil))
  ([instance     :- ::instance
    models-cache :- [:maybe ::transforms.u/source-models]
    db-perms     :- [:maybe ::database-permissions]]
   (and (transforms.u/check-feature-enabled (transforms.u/->definition instance))
        (or api/*is-superuser?*
            (and (transform-readable? instance models-cache)
                 (transform-database-permissions? instance db-perms)
                 (native-transform-write-allowed? instance (:source_database_id instance) db-perms))))))

(defn- transform-deletable?
  "Whether the current user can write `instance` as a whole, which nobody can when a read-only instance syncs it."
  ([instance]
   (transform-deletable? instance nil nil))
  ([instance models-cache db-perms]
   (and (not (remote-sync/read-only?))
        (transform-writable? instance models-cache db-perms))))

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
                  (transform-database-permissions? instance nil)
                  (native-transform-write-allowed? instance source-db-id nil))))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(mu/defn- hydrate-permission
  "Attach a permission under `k` to each of `transforms` by calling `pred` with `models-cache` and `db-perms`, both
  prefetched once for the whole list, so checking N transforms doesn't issue a query per transform."
  [k            :- :keyword
   transforms   :- [:sequential [:maybe ::instance]]
   models-cache :- ::transforms.u/source-models
   db-perms     :- ::database-permissions
   pred         :- [:=> [:cat ::instance ::transforms.u/source-models ::database-permissions] [:maybe :boolean]]]
  (mapv (fn [transform]
          (when transform
            (assoc transform k (boolean (pred transform models-cache db-perms)))))
        transforms))

(def ^:private permission-preds
  "The predicate each permission key of a transform is answered with."
  {:can_read    (fn [transform models-cache _db-perms] (transform-readable? transform models-cache))
   :can_write   transform-deletable?
   :can_execute transform-writable?})

(mu/defn assoc-permissions :- [:sequential [:maybe ::instance]]
  "Attach each of the permissions `ks` (`:can_read`, `:can_write`, `:can_execute`) to each of `transforms`, all
  answered from the source models of `models-cache`, as [[transforms.u/prefetch-source-models]] loads them, and the
  permissions on their Databases, read once."
  [transforms   :- [:sequential [:maybe ::instance]]
   models-cache :- ::transforms.u/source-models
   ks           :- [:sequential [:enum :can_read :can_write :can_execute]]]
  (let [db-perms (if (or api/*is-superuser?* (= [:can_read] ks))
                   {:transforms {} :create-queries {}}
                   (prefetch-database-permissions (into [] (remove nil?) transforms)))]
    (reduce (fn [acc k]
              (cond->> (hydrate-permission k acc models-cache db-perms (permission-preds k))
                (= k :can_read) (mapv #(when % (vary-meta % assoc k (boolean (get % k)))))))
            (vec transforms)
            ks)))

(mu/defn- hydrate-permissions :- [:sequential [:maybe ::instance]]
  "`transforms` with the permissions `ks` attached, the source models loaded once."
  [transforms :- [:sequential [:maybe ::instance]]
   ks         :- [:sequential [:enum :can_read :can_write :can_execute]]]
  (assoc-permissions transforms (transforms.u/prefetch-source-models (into [] (remove nil?) transforms)) ks))

(methodical/defmethod t2/batched-hydrate [:model/Transform :can_read]
  "Add can_read to transforms."
  [_model _k transforms]
  (hydrate-permissions transforms [:can_read]))

(methodical/defmethod t2/batched-hydrate [:model/Transform :can_write]
  "Add can_write to transforms."
  [_model _k transforms]
  (hydrate-permissions transforms [:can_write]))

(methodical/defmethod t2/batched-hydrate [:model/Transform :can_execute]
  "Add can_execute to transforms. Executing a transform requires write permission."
  [_model _k transforms]
  (hydrate-permissions transforms [:can_execute]))

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

(defenterprise delete-transform-tests-for-transforms!
  "Deletes the tests of the transforms with `transform-ids` through their model, which publishes a delete event for each
  and sets the test id of their runs to nil, as a database cascade would not; a no-op in OSS."
  metabase-enterprise.data-testing.models
  [_transform-ids]
  nil)

(defn- check-collections
  "Throw unless each Collection with `collection-ids` satisfies these rules, all read in one query and checked in the
  order of their first appearance (a missing one is a 404):

  - it is in the transforms namespace
  - it can hold the content of Transforms (not a Library or data-app Collection that refuses it)"
  [collection-ids]
  (when-let [collection-ids (not-empty (into [] (comp (remove nil?) (distinct)) collection-ids))]
    (let [collections (collection/collections-for-content-checks collection-ids)]
      (doseq [collection-id collection-ids
              :let [collection (or (collections collection-id) (collection/content-parent collection-id))]]
        (collection/check-collection-namespace :model/Transform collection)
        (collection/check-allowed-content :model/Transform collection)))))

(defn- check-target-databases
  "Throw a 400 unless each Database with `database-ids`, one that exists, satisfies these rules:

  - it is not the sample Database
  - it is not an audit Database
  - it is not a destination of database routing"
  [database-ids]
  (let [database-ids (into [] (comp (remove nil?) (distinct)) database-ids)
        id->database (u/index-by :id (when (seq database-ids) (transforms.db/databases-by-ids database-ids)))]
    (doseq [database-id database-ids
            :let        [database (id->database database-id)]
            :when       database]
      (when (:is_sample database)
        (throw (ex-info (tru "Cannot run transforms on the sample database.") {:status-code 400})))
      (when (:is_audit database)
        (throw (ex-info (tru "Cannot run transforms on audit databases.") {:status-code 400})))
      (when (:router_database_id database)
        (throw (ex-info (tru "Cannot run transforms on a destination database of database routing.") {:status-code 400}))))))

(defn- check-cycles
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

(defn- resolve-merge-key
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

(defn- resolve-merge-keys
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
                         (assoc changes :target (resolve-merge-key (:target merged) (get fields table-id {})))
                         changes)])))
          changes-by-id)))

(mu/defn- replace-tags! :- :boolean
  "Make the TransformTags linked to the Transform with `transform-id` those of `tag-ids`, in that order, deleting
  removed tags, updating positions for moved tags and inserting new tags, leaving out duplicate and unknown tag ids,
  and return whether the tags changed."
  [transform-id :- ::lib.schema.id/transform
   tag-ids      :- [:sequential ms/PositiveInt]]
  (let [deduped-tag-ids      (vec (distinct tag-ids))
        current-associations (transforms.db/transform-tag-links [transform-id])
        current-tag-ids      (mapv :tag_id current-associations)
        valid-tag-ids        (when (seq deduped-tag-ids)
                               (into #{} (transforms.db/existing-tag-ids deduped-tag-ids)))
        new-tag-ids          (if valid-tag-ids
                               (filterv valid-tag-ids deduped-tag-ids)
                               [])
        current-set          (set current-tag-ids)
        new-set              (set new-tag-ids)
        to-delete            (set/difference current-set new-set)
        to-insert            (set/difference new-set current-set)
        new-positions        (zipmap new-tag-ids (range))]
    (when (seq to-delete)
      (transform-transform-tag/delete-transform-transform-tags-for-transform! transform-id to-delete))
    (transform-transform-tag/update-transform-transform-tags-for-transform! transform-id (select-keys new-positions current-set))
    (when (seq to-insert)
      (transform-transform-tag/create-transform-transform-tags!
       (for [tag-id to-insert]
         {:transform_id transform-id
          :tag_id       tag-id
          :position     (get new-positions tag-id)})))
    (not= current-tag-ids new-tag-ids)))

(defn- link-new-tags!
  "Link each of the new `transforms` to the `:tag_ids` of its row of `rows`, in that order, leaving out duplicate and
  unknown tag ids, with one insert for all."
  [transforms rows]
  (let [tag-ids (into [] (comp (mapcat :tag_ids) (distinct)) rows)
        known   (if (seq tag-ids) (into #{} (transforms.db/existing-tag-ids tag-ids)) #{})
        links   (vec (mapcat (fn [transform {:keys [tag_ids]}]
                               (map-indexed (fn [position tag-id]
                                              {:transform_id (:id transform) :tag_id tag-id :position position})
                                            (filter known (distinct tag_ids))))
                             transforms rows))]
    (when (seq links)
      (transform-transform-tag/create-transform-transform-tags! links))))

(defn- check-new-transforms
  "Throw unless every Transform of `rows` satisfies the rules of [[check-collections]] for its Collection and of
  [[check-target-databases]] for its target Database."
  [rows]
  (check-collections (map :collection_id rows))
  (check-target-databases (map (comp :target_db_id derived-columns) rows)))

(defn- create-transform-batch!
  "Check and insert `rows`, one batch of a call, link their tags, and return the inserted Transforms."
  [rows]
  (check-new-transforms rows)
  (let [transforms (transforms.db/insert-transforms! (mapv #(dissoc % :tag_ids) rows))]
    (link-new-tags! transforms rows)
    transforms))

(mu/defn create-transforms! :- [:sequential ::transforms.schema/transform]
  "Insert the Transform `rows` in one transaction, linking the `:tag_ids` of each and publishing their create event,
  throwing unless the Collection of each can hold Transforms and its target Database can hold the tables of a
  transform, and return the inserted Transforms."
  [rows :- [:sequential ::transforms.schema/transform.create]]
  (t2/with-transaction [_conn]
    (let [created (into [] (mapcat (comp create-transform-batch! vec)) (partition-all mdb/create-partition-size rows))]
      (when (seq created)
        (events/publish-event! :event/transform-create (events/create-event created)))
      created)))

(defn- moved-collection-ids
  "The ids of the Collections that `id->changes` moves Transforms of `id->stored` into."
  [id->stored id->changes]
  (for [[id changes] id->changes
        :when        (and (contains? changes :collection_id)
                          (not= (:collection_id (id->stored id)) (:collection_id changes)))]
    (:collection_id changes)))

(defn- changed-definitions
  "The Transforms that `id->changes` gives another source or target, as a map from id to the stored row with the changes
  and its derived columns."
  [id->stored id->changes]
  (into {}
        (keep (fn [[id changes]]
                (when (definition-columns-changed? (id->stored id) changes)
                  (let [merged (merge (id->stored id) changes)]
                    [id (merge merged (derived-columns merged))]))))
        id->changes))

(defn- id->changes-of
  "A map from id to the changes of each of `updates`, the id of a Transform and its columns to change, for the Transforms
  in `id->stored`."
  [updates id->stored]
  (into {} (comp (filter (comp id->stored :id)) (map (juxt :id #(dissoc % :id)))) updates))

(defn- check-transform-updates
  "Throw unless these rules hold for the Transforms of `id->stored` that `updates` change:

  - the Collection that a Transform moves to can hold Transforms
  - the target Database of a changed definition can hold the tables of a transform
  - the new definition of a query transform causes no cycle"
  [updates id->stored]
  (let [id->changes    (id->changes-of updates id->stored)
        id->definition (changed-definitions id->stored id->changes)]
    (check-collections (moved-collection-ids id->stored id->changes))
    (check-target-databases (map :target_db_id (vals id->definition)))
    (check-cycles (vals id->definition))))

(defn- mark-changed-definitions!
  "Mark the index requests of the Transforms of `id->stored` that `id->changes` gives another source or target for
  revalidation."
  [id->stored id->changes]
  (when-let [ids (not-empty (filterv #(definition-columns-changed? (id->stored %) (id->changes %)) (keys id->changes)))]
    (table-index/mark-for-revalidation! ids)))

(defn- prepare-transform-updates
  "The `updates` of the Transforms of `id->stored` with the Field ids of each merge unique key filled once its target
  table exists, after marking the index requests of a changed definition for revalidation."
  [updates id->stored]
  (let [id->changes  (id->changes-of updates id->stored)
        id->resolved (resolve-merge-keys id->changes id->stored)]
    (mark-changed-definitions! id->stored id->changes)
    (into [] (comp (map :id) (filter id->resolved) (distinct) (map #(assoc (id->resolved %) :id %))) updates)))

(defn- check-and-prepare-transform-updates
  "Check `updates` against `id->stored` with [[check-transform-updates]] and return what [[prepare-transform-updates]]
  makes of them."
  [updates id->stored]
  (check-transform-updates updates id->stored)
  (prepare-transform-updates updates id->stored))

(defn- publish-transform-update!
  "Publish the update event of the Transforms of `id->stored` that `updates` change, with their rows `id->updated`."
  [opts updates id->stored id->updated]
  (events/publish-event! :event/transform-update
                         (events/update-event id->stored updates (assoc opts :objects id->updated))))

(mu/defn update-transforms! :- :nil
  "Apply `updates`, each the id of a Transform and the columns to change, in one transaction, publishing their update
  event, throwing unless the new Collections and target Databases can hold Transforms and the new definitions of query
  transforms cause no cycle, marking the index requests of a changed definition for revalidation, and filling the
  Field ids of a merge unique key once its target table exists."
  ([updates :- [:sequential ::transforms.schema/transform.update]]
   (update-transforms! updates nil))
  ([updates :- [:sequential ::transforms.schema/transform.update]
    opts    :- :metabase.events.schema/write-opts]
   (mdb/update-batched! :model/Transform updates
                        {:before-update check-and-prepare-transform-updates
                         :reread?       true
                         :after-update  #(publish-transform-update! opts %1 %2 %3)})))

(defn- update-transform-columns!
  "Check and write the `columns` to change of the Transform `stored`, and return the update event of the write, or nil
  when there are no columns."
  [stored columns opts]
  (when (seq columns)
    (let [id->stored {(:id stored) stored}
          updates    [(assoc columns :id (:id stored))]]
      (check-transform-updates updates id->stored)
      (let [updates (prepare-transform-updates updates id->stored)]
        (transforms.db/update-transforms! updates)
        (events/update-event id->stored updates
                             (assoc opts :objects (transforms.db/transforms-by-ids [(:id stored)])))))))

(mu/defn update-transform! :- :nil
  "Apply the `changes`, columns of the Transform with `id` and the `:tag_ids` it has afterwards, in one transaction,
  with the checks of [[update-transforms!]], publishing one update event: of its columns, or a touch when only its
  tags changed."
  ([id      :- ::lib.schema.id/transform
    changes :- ::transforms.schema/transform.update-with-tags]
   (update-transform! id changes nil))
  ([id      :- ::lib.schema.id/transform
    changes :- ::transforms.schema/transform.update-with-tags
    opts    :- :metabase.events.schema/write-opts]
   (t2/with-transaction [_conn]
     (when-let [stored (get (transforms.db/transforms-by-ids [id]) id)]
       (let [columns-event (update-transform-columns! stored (dissoc changes :tag_ids) opts)
             tags-changed? (and (contains? changes :tag_ids) (replace-tags! id (vec (:tag_ids changes))))]
         (cond
           columns-event (events/publish-event! :event/transform-update columns-event)
           tags-changed? (events/publish-event! :event/transform-update (events/touch-event [stored] opts))))))
   nil))

(defn- delete-tests-and-publish!
  "Delete the tests of `transforms`, then publish their delete event."
  [transforms]
  (delete-transform-tests-for-transforms! (mapv :id transforms))
  (events/publish-event! :event/transform-delete (events/delete-event transforms)))

(mu/defn delete-transforms! :- :nil
  "Delete the Transforms with `ids`, and their tests, in one transaction, publishing their delete event right before the
  statement."
  [ids :- [:sequential ::lib.schema.id/transform]]
  (mdb/delete-batched! :model/Transform ids {:before-delete delete-tests-and-publish!}))

(defmethod transforms-base.u/record-run-changes! :model/Transform
  [_model transform-id changes]
  (update-transforms! [(assoc changes :id transform-id)])
  nil)

(mu/defn set-table-dependencies! :- :int
  "Store each JSON string of `id->dependencies-json` as the cached table dependencies of the Transforms it is the value
  of, a cache no rule reads and no event reports."
  [id->dependencies-json :- [:map-of ::lib.schema.id/transform :string]]
  (transforms.db/set-table-dependencies! id->dependencies-json))

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
