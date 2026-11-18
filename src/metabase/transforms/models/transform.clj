(ns metabase.transforms.models.transform
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.indexes.models.table-index :as table-index]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.permissions.core :as perms]
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.revisions.core :as revisions]
   [metabase.search.core :as search.core]
   [metabase.search.spec :as search.spec]
   [metabase.serialization.core :as serialization]
   [metabase.staleness.core :as staleness]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.ordering :as transforms-base.ordering]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.freshness :as freshness]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.serialization :as transforms.serialization]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]))

(set! *warn-on-reflection* true)

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/Transform [_model] :transform)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped? :hook/events]]
  (derive :model/Transform trait))

(defmethod events/spec :model/Transform
  [_model]
  {:create :event/transform-create
   :update :event/transform-update
   :delete :event/transform-delete})

(defmethod revisions/spec :model/Transform [_model]
  {:track     [:name :description :collection_id :owner_email :owner_user_id :source :source_database_id :source_type
               :target :target_db_id]
   :skip      [:creator_id :entity_id :last_checkpoint_value :table_dependencies :target_table_id]
   :authorize :snapshot})

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

(defn- check-collection
  "Throws unless the Collection of `transform`, if any, can hold Transforms."
  [{:keys [collection_id]}]
  (when collection_id
    (collection/check-collection-namespace :model/Transform collection_id)
    (collection/check-allowed-content :model/Transform collection_id)))

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

(defn- check-target-database
  "Throws a 400 unless the target Database of `transform` can hold the tables of a transform."
  [{:keys [target_db_id]}]
  (when target_db_id
    (let [database (transforms.db/database target_db_id)]
      (when-not database
        (throw (ex-info (tru "The target database cannot be found.") {:status-code 400})))
      (when (:is_sample database)
        (throw (ex-info (tru "Cannot run transforms on the sample database.") {:status-code 400})))
      (when (:is_audit database)
        (throw (ex-info (tru "Cannot run transforms on audit databases.") {:status-code 400})))
      (when (:router_database_id database)
        (throw (ex-info (tru "Cannot run transforms on a destination database of database routing.") {:status-code 400}))))))

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

(defn- check-and-derive-definition
  "`transform`, whose source or target is being written, with the columns computed from them, after checking that the
  target Database can hold them."
  [transform]
  (let [transform (merge transform (derived-columns transform))]
    (check-target-database transform)
    transform))

(t2/define-before-insert :model/Transform
  [transform]
  (check-collection transform)
  (let [transform (check-and-derive-definition transform)]
    (assoc-in transform [:target :database] (:target_db_id transform))))

(defn- definition-changed?
  "Whether the pending changes of `transform` change its source or its target."
  [transform]
  (let [changes (t2/changes transform)]
    (or (contains? changes :source) (contains? changes :target))))

(defn- check-cycle
  "Throws a 400 when the query transform `transform` has become part of a cycle of transforms feeding one another."
  [transform]
  (when (transforms-base.u/query-transform? transform)
    (when-let [{:keys [cycle-str]} (transforms-base.ordering/get-transform-cycle transform)]
      (throw (ex-info (str "Cyclic transform definitions detected: " cycle-str)
                      {:status-code 400})))))

(defn- unresolved-merge-key-table-id
  "The ID of the target Table of `transform` when its merge unique key still has columns known by name only, or nil."
  [{:keys [source target target_table_id]}]
  (when (and target_table_id
             (transforms-base.u/merge-target? {:source source :target target})
             (some #(nil? (:field-id %)) (get-in target [:target-incremental-strategy :unique-key])))
    target_table_id))

(defn- resolve-merge-key-field-ids
  "`transform` with the `:field-id` of the columns of its merge unique key filled from the active Fields of its target
  table, once that table exists and any are still by-name only."
  [transform]
  (if-let [table-id (unresolved-merge-key-table-id transform)]
    (let [name->id (transforms.db/active-field-ids-by-name table-id)]
      (update-in transform [:target :target-incremental-strategy :unique-key]
                 (fn [unique-key]
                   (mapv (fn [e] (cond-> e (:name e) (assoc :field-id (name->id (:name e)))))
                         unique-key))))
    transform))

(defn- checkpoint-field-changed?
  "Whether `transform` had an incremental checkpoint Field that its pending changes replace."
  [transform]
  (let [old-field-id (get-in (t2/original transform) [:source :source-incremental-strategy :checkpoint-filter-field-id])
        new-field-id (get-in transform [:source :source-incremental-strategy :checkpoint-filter-field-id])]
    (and old-field-id (not= old-field-id new-field-id))))

(t2/define-before-update :model/Transform
  [transform]
  (let [changes    (t2/changes transform)
        _          (when (contains? changes :collection_id) (check-collection transform))
        definition (when (definition-changed? transform) (check-and-derive-definition transform))]
    (when (and (or (contains? changes :source_type)
                   (and (contains? changes :source_database_id) (source-database-id transform)))
               (not (contains? changes :source)))
      (throw (ex-info (tru "source_type and source_database_id follow the source; change the source instead.")
                      {:status-code 400})))
    (when (and (contains? changes :target_db_id) (not definition))
      (throw (ex-info (tru "target_db_id follows the source and the target; change them instead.")
                      {:status-code 400})))
    (when definition
      (check-cycle definition)
      (table-index/mark-for-revalidation! (:id transform)))
    (cond-> transform
      definition
      (merge (select-keys definition [:source_type :source_database_id :target_db_id]))

      (contains? changes :source)
      (assoc :table_dependencies nil)

      (checkpoint-field-changed? transform)
      (assoc :last_checkpoint_value nil)

      true
      resolve-merge-key-field-ids)))

(t2/define-after-select :model/Transform
  [{:keys [source] :as transform}]
  (if source
    (assoc transform :source_type (transforms-base.u/transform-source-type source))
    transform))

(defenterprise delete-transform-tests!
  "Deletes the tests of the transform `transform-id` through their model and publishes a delete event for each, which a
  database cascade would not; a no-op in OSS."
  metabase-enterprise.data-testing.models
  [_transform-id]
  nil)

(t2/define-before-delete :model/Transform [transform]
  (delete-transform-tests! (:id transform))
  transform)

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
          (transforms.db/delete-transform-tag-links! transform-id to-delete))
        ;; Update positions for existing tags that moved
        (doseq [tag-id (filter current-set new-tag-ids)]
          (let [new-pos (get new-positions tag-id)]
            (transforms.db/set-transform-tag-position! transform-id tag-id new-pos)))
        ;; Insert new associations with correct positions
        (when (seq to-insert)
          (transforms.db/insert-transform-tag-links! (for [tag-id to-insert]
                                                       {:transform_id transform-id
                                                        :tag_id       tag-id
                                                        :position     (get new-positions tag-id)})))))
    nil))

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(mr/def ::instance
  "A Transform as the permission checks see it: a stored row, a hydrated one, one with pending changes merged in, or
  a create request."
  [:or
   ::transforms.schema/transform
   ::transforms.schema/transform.create])

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

;;; ------------------------------------------------- Serialization --------------------------------------------------

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
   :children            {:tags    :model/TransformTransformTag
                         :indexes :model/TableIndex}
   :storage-paths       transforms.serialization/transform-storage-paths
   :import-dependencies transforms.serialization/transform-import-dependencies
   :loaded-entities     transforms.serialization/transform-loaded-entities})

;;; ------------------------------------------------- Remote sync ----------------------------------------------------

(defmethod remote-sync/spec :model/Transform
  [_model]
  {:synced-items transforms.db/synced-transform-items})

;;; ---------------------------------------------------- Search ------------------------------------------------------

(mu/defn- maybe-extract-transform-query-text :- [:maybe :string]
  "Return the query text (truncated to `max-searchable-value-length`) from transform source; else nil.
  Extracts SQL from query-type transforms and Python code from python-type transforms."
  [{transform-source-type :source_type source :source}
   :- [:map {:closed true}
       [:source_type [:maybe [:or :keyword :string]]]
       [:source      [:or :string [:fn map?]]]]]
  (let [source-data (transform-source-out source)
        ;; Use the top-level :source_type field since it differentiates between MBQL vs native transforms
        query-text (case (keyword transform-source-type)
                     :native (lib/raw-native-query (:query source-data))
                     :python (:body source-data)
                     nil)]
    (when query-text
      (subs query-text 0 (min (count query-text) search.core/max-searchable-value-length)))))

(search.spec/define-spec "transform"
  {:model        :model/Transform
   :visibility   :superuser
   :attrs        {:archived      false
                  :collection-id false
                  :creator-id    false
                  :created-at    true
                  :updated-at    true
                  :view-count    false
                  :native-query  {:fn maybe-extract-transform-query-text
                                  :fields [:source :source_type]}
                  :database-id   :source_database_id
                  :source-type   true}
   :search-terms [:name :description]
   :render-terms {:transform-name :name
                  :transform-id   :id}})

;;; ------------------------------------------------- Staleness ------------------------------------------------

(defmethod staleness/find-stale-query :model/Transform
  [_model args]
  ;; Run-based: a transform is stale when it has never run and was created on/before the cutoff,
  ;; or when its most recent run started on/before the cutoff (failed runs still count). Transforms
  ;; between fires of a slower-than-threshold schedule are not stale.
  (let [schedule-fresh-ids (freshness/schedule-fresh-transform-ids (java.time.Instant/now))]
    ^:allow-subquery
    {:select    [:transform.id
                 [(h2x/literal "Transform") :model]
                 [:transform.name :name]
                 [:latest_run.last_start :last_used_at]
                 :transform.collection_id]
     :from      :transform
     :left-join [[(transforms.db/latest-run-start-times-query) :latest_run]
                 [:= :latest_run.transform_id :transform.id]]
     :where     [:and
                 [:or
                  [:and
                   [:= :latest_run.last_start nil]
                   [:<= :transform.created_at (:cutoff-date args)]]
                  [:<= :latest_run.last_start (:cutoff-date args)]]
                 (when (seq schedule-fresh-ids)
                   [:not [:in :transform.id schedule-fresh-ids]])
                 (staleness/collection-filter :transform.collection_id args)]}))
