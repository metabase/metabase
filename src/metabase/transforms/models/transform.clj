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
   [metabase.search.core :as search.core]
   [metabase.search.spec :as search.spec]
   [metabase.serialization.core :as serialization]
   [metabase.staleness.core :as staleness]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.freshness :as freshness]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Transform [_model] :transform)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped? :hook/dependencies]]
  (derive :model/Transform trait))

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
              (perms/full-database-permission-for-user api/*current-user-id* :perms/create-queries source-db-id)))))

(mu/defn- transform-database-permissions? :- :boolean
  [instance :- ::instance]
  (let [source-db-id (or (transforms-base.i/source-db-id instance) (:source_database_id instance))
        target-db-id (transforms-base.i/target-db-id instance)]
    (every? #(perms/has-db-transforms-permission? api/*current-user-id* %)
            (distinct (keep identity [source-db-id target-db-id])))))

(mu/defn- transform-writable? :- [:maybe :boolean]
  "Whether the current user can write `instance`, with its source looked up in `models-cache` when given."
  ([instance :- ::instance]
   (transform-writable? instance nil))
  ([instance     :- ::instance
    models-cache :- [:maybe ::transforms.u/source-models]]
   (and (remote-sync/transforms-editable?)
        (transforms.u/check-feature-enabled (transforms.u/->definition instance))
        (or api/*is-superuser?*
            (and (transform-readable? instance models-cache)
                 (transform-database-permissions? instance)
                 (native-transform-write-allowed? instance (:source_database_id instance)))))))

(defmethod mi/can-read? :model/Transform
  ([instance]
   (transform-readable? instance))
  ([_model pk]
   (when-let [transform (transforms.db/transform pk)]
     (mi/can-read? transform))))

(defmethod mi/can-write? :model/Transform
  ([instance]
   (transform-writable? instance))
  ([_model pk]
   (when-let [transform (transforms.db/transform pk)]
     (mi/can-write? transform))))

;; Users who can read the transform can also query it. This is a duplicate, but keeps things explicit.
(defmethod mi/can-query? :model/Transform
  ([instance]
   (mi/can-read? instance))
  ([model pk]
   (mi/can-read? model pk)))

(defmethod mi/can-update? :model/Transform
  [instance changes]
  (and (mi/can-write? instance)
       (mi/can-write? (merge instance changes))))

(defmethod mi/can-create? :model/Transform
  [_model instance]
  ;; Inline can-write? logic since instance is a plain map without model metadata.
  ;; can-write? requires: can-read?, has-db-transforms-permission?, and transforms-editable?
  ;; can-read? requires: is-superuser? OR (entitled-data-analyst? AND source-tables-readable?)
  (and (remote-sync/transforms-editable?)
       (transforms.u/check-feature-enabled (transforms.u/->definition instance))
       (or api/*is-superuser?*
           (let [source-db-id (or (:source_database_id instance) (transforms-base.i/source-db-id instance))]
             (and (api/entitled-data-analyst?)
                  (transforms.u/source-tables-readable? (transforms.u/->definition instance))
                  (transform-database-permissions? instance)
                  (native-transform-write-allowed? instance source-db-id))))))

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

(t2/define-before-insert :model/Transform
  [transform]
  (let [{:keys [source collection_id source_database_id]} transform]
    (collection/check-collection-namespace :model/Transform collection_id)
    (when collection_id
      (collection/check-allowed-content :model/Transform collection_id))
    (let [target-db-id (transforms-base.i/target-db-id transform)
          valid-db-id? (and target-db-id (transforms.db/database-exists? target-db-id))]
      (when (and target-db-id (not valid-db-id?))
        (log/warnf "Invalid target database id (%s) ignored for new transform" target-db-id))
      (-> transform
          (assoc-in [:target :database] target-db-id)
          (assoc
           :source_type (transforms-base.u/transform-source-type source)
           :target_db_id (when valid-db-id? target-db-id)
           :source_database_id (or source_database_id (transforms-base.i/source-db-id transform)))))))

(mu/defn- resolve-merge-key-field-ids :- ::transforms.schema/transform
  "Fill `:field-id` on a merge target's unique-key columns from the synced target table's fields, once
  the table exists and any are still by-name only."
  [transform :- ::transforms.schema/transform]
  (let [target     (or (:target transform) (:target (t2/original transform)))
        table-id   (or (:target_table_id transform) (:target_table_id (t2/original transform)))
        unique-key (get-in target [:target-incremental-strategy :unique-key])]
    (if (and (transforms-base.u/merge-target? (assoc transform :target target))
             table-id
             (some #(nil? (:field-id %)) unique-key))
      (let [name->id (transforms.db/active-field-ids-by-name table-id)]
        (assoc transform :target
               (assoc-in target [:target-incremental-strategy :unique-key]
                         (mapv (fn [e] (cond-> e (:name e) (assoc :field-id (name->id (:name e)))))
                               unique-key))))
      transform)))

(t2/define-before-update :model/Transform
  [transform]
  (let [{:keys [source source_database_id]} transform]
    (when-let [new-collection (:collection_id (t2/changes transform))]
      (collection/check-collection-namespace :model/Transform new-collection)
      (collection/check-allowed-content :model/Transform new-collection))
    ;; The target db is recomputed when source changes because for MBQL transforms,
    ;; the source query's :database is the source of truth for the target database.
    (let [target-changed? (or (:source (t2/changes transform)) (:target (t2/changes transform)))
          target-db-id    (when target-changed?
                            ;; No database existence check added here, unlike for insert.
                            ;; Just allow updates for an invalid target to fail.
                            (transforms-base.i/target-db-id transform))]
      ;; A source or target edit may change the output columns, and we can't cheaply tell, so invalidate conservatively:
      ;; the next run re-applies the managed indexes against the new schema and fails if a column is gone.
      (when (and target-changed? (not mi/*deserializing?*))
        (table-index/mark-for-revalidation! (:id transform)))
      (cond-> transform
        source
        (assoc :source_type (transforms-base.u/transform-source-type source)
               :source_database_id (or source_database_id (transforms-base.i/source-db-id transform)))

        ;; Invalidate cached deps when the source changes
        (:source (t2/changes transform))
        (assoc :table_dependencies nil)

        target-changed?
        (assoc :target_db_id target-db-id)

        ;; Reset checkpoint when the incremental filter field changes
        (let [old-field-id (get-in (t2/original transform) [:source :source-incremental-strategy :checkpoint-filter-field-id])
              new-field-id (get-in transform [:source :source-incremental-strategy :checkpoint-filter-field-id])]
          (and old-field-id (not= old-field-id new-field-id)))
        (assoc :last_checkpoint_value nil)

        true
        resolve-merge-key-field-ids))))

(t2/define-after-select :model/Transform
  [{:keys [source] :as transform}]
  (if source
    (assoc transform :source_type (transforms-base.u/transform-source-type source))
    transform))

(mu/defn- hydrate-permission :- [:sequential ::instance]
  "Batched-hydrate helper: attach a permission under `k` to each transform by calling `pred`
   (`transform-readable?`/`transform-writable?`) with a `models-cache` prefetched once for the whole
   list, so checking N transforms doesn't issue a query per transform."
  [k          :- :keyword
   transforms :- [:sequential ::instance]
   pred       :- [:=> [:cat ::instance ::transforms.u/source-models] [:maybe :boolean]]]
  (let [models-cache (transforms.u/prefetch-source-models transforms)]
    (mi/instances-with-hydrated-data
     transforms k
     #(into {}
            (map (fn [{:keys [id] :as transform}]
                   [id (pred transform models-cache)]))
            transforms)
     :id
     {:default false})))

(methodical/defmethod t2/batched-hydrate [:model/Transform :can_read]
  "Add can_read to transforms."
  [_model k transforms]
  (hydrate-permission k transforms transform-readable?))

(methodical/defmethod t2/batched-hydrate [:model/Transform :can_write]
  "Add can_write to transforms."
  [_model k transforms]
  (hydrate-permission k transforms transform-writable?))

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

(t2/define-after-insert :model/Transform [transform]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/create-transform {:object transform}))
  transform)

(t2/define-after-update :model/Transform [transform]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/update-transform {:object transform}))
  transform)

(defenterprise delete-transform-tests!
  "Hook called from the `:model/Transform` before-delete: delete the tests of the transform `transform-id` through
  Toucan, so that each one's own delete hook runs. The database would take them with the transform either way -- the
  `transform_test.transform_id` FK is `ON DELETE CASCADE` -- but a cascade runs no hook, and remote sync learns a
  test is gone only from the event that hook publishes, so it would go on serving a test whose transform no longer
  exists. OSS is a no-op (no transform-testing module)."
  metabase-enterprise.transform-testing.models
  [_transform-id]
  nil)

(t2/define-before-delete :model/Transform [transform]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/delete-transform {:id (:id transform)}))
  (delete-transform-tests! (:id transform))
  (search.core/delete! :model/Transform [(str (:id transform))])
  transform)

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

;;; ------------------------------------------------- Serialization ------------------------------------------------

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

(defn- drop-merge-key-field-ids
  "`target` without the `:field-id`s of its merge unique key. The merge reads only the column names, and
  [[resolve-merge-key-field-ids]] fills the ids from the target table once it syncs, so a reference would only make
  the import stub out a table the transform has yet to create."
  [target]
  (m/update-existing-in target [:target-incremental-strategy :unique-key]
                        (fn [unique-key] (mapv #(dissoc % :field-id) unique-key))))

(defn- walk-export-source
  "The exported `source` of a transform, its ids replaced by the references `visit` resolves them to. A checkpoint
  field that no longer exists is dropped, since a local id names nothing on another instance."
  [visit source]
  (let [database #(serialization/visit-some :model/Database % visit)]
    (-> source
        (m/update-existing :query #(serialization/walk-export visit %))
        (m/update-existing :source-database database)
        (m/update-existing :source-tables
                           (fn [entries]
                             (mapv #(-> %
                                        (m/update-existing :table_id
                                                           (fn [id] (serialization/visit-some :model/Table id visit)))
                                        (m/update-existing :database_id database))
                                   (transforms-base.u/normalize-source-tables entries))))
        (m/update-existing :source-incremental-strategy
                           (fn [{field-id :checkpoint-filter-field-id :as strategy}]
                             (if-let [field-ref (when field-id
                                                  (serialization/found-or-nil #(visit :model/Field field-id)))]
                               (assoc strategy :checkpoint-filter-field-id field-ref)
                               (dissoc strategy :checkpoint-filter-field-id)))))))

(defn- walk-import-source
  "The `source` of an exported transform with its references replaced by the ids `visit` resolves them to, keeping the
  raw numeric ids of older exports."
  [visit source]
  (let [ref-or-id (fn [model] (fn [v] (if (or (nil? v) (pos-int? v)) v (visit model v))))
        entry     #(-> %
                       (m/update-existing :table_id (ref-or-id :model/Table))
                       (m/update-existing :database_id (ref-or-id :model/Database)))]
    (cond->> (-> source
                 (m/update-existing :query #(serialization/walk-import visit %))
                 (m/update-existing :source-database (ref-or-id :model/Database))
                 (m/update-existing :source-tables
                                    (fn [entries]
                                      (if (map? entries)
                                        (update-vals entries #(if (map? %) (entry %) ((ref-or-id :model/Table) %)))
                                        (mapv entry entries))))
                 (m/update-existing-in [:source-incremental-strategy :checkpoint-filter-field-id]
                                       (ref-or-id :model/Field)))
      (not (serialization/collecting? visit)) (lib/normalize ::transforms.schema/transform-source))))

(defmethod serialization/spec :model/Transform [_]
  {:schema    ::transforms.schema/external-transform
   :copy      [:name :description :entity_id :owner_email]
   :skip      [:source_type :target_db_id :target_table_id :last_checkpoint_value :table_dependencies]
   :transform {:creator_id         serialization/user-transform
               :owner_user_id      serialization/user-transform
               :collection_id      (serialization/fk-transform :model/Collection)
               :source_database_id serialization/database-transform
               :source             {:export (fn [store _ sources _]
                                              (serialization/export-in-bulk store sources walk-export-source))
                                    :import (fn [store _ sources opts]
                                              (serialization/import-in-bulk
                                               store
                                               sources
                                               opts
                                               (fn [visit source]
                                                 (cond->> source
                                                   (not (:serdes/unresolved source)) (walk-import-source visit)))))}
               :target             {:export (fn [store _ targets _]
                                              (serialization/export-mbql
                                               store (map #(drop-merge-key-field-ids (dissoc % :table_id)) targets)))
                                    :import (fn [store _ targets opts]
                                              (serialization/import-mbql store (map drop-merge-key-field-ids targets)
                                                                         opts))}}
   :children  {:tags    :model/TransformTransformTag
               :indexes :model/TableIndex}})

(defmethod serialization/storage-paths :model/Transform [_ entities ctx]
  (mapv (fn [transform]
          (serialization/storage-default-collection-path transform ctx "transforms"))
        entities))

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

(mu/defn transforms-with-tags :- [:sequential ::transforms.schema/transform]
  "Returns all transforms associated with the given tag IDs.
  Return empty list if no tag IDs are provided or no transforms are associated with the tags."
  [tag-ids :- [:maybe [:or [:set ms/PositiveInt] [:sequential ms/PositiveInt]]]]
  (or (when (seq tag-ids)
        (when-let [transform-ids (transforms.db/transform-ids-with-tags tag-ids)]
          (transforms.db/transforms transform-ids)))
      []))

;;; ------------------------------------------------- Search ---------------------------------------------------

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

(defmethod serialization/import-dependencies :model/Transform [_ entities]
  (mapv (fn [{:keys [collection_id source tags]}]
          (set (concat (when collection_id [[:model/Collection collection_id]])
                       (for [{tag-id :tag_id} tags] [:model/TransformTag tag-id])
                       (when-not (:serdes/unresolved source)
                         (serialization/import-mbql-dependencies source)))))
        entities))

;;; ------------------------------------------------- SerDes loading ----------------------------------------------------

(defmethod serialization/before-load :model/Transform [_ items]
  (let [{unresolved true resolved false} (group-by #(boolean (get-in % [:entity :source :serdes/unresolved])) items)]
    (doseq [{{:keys [entity_id]} :entity} unresolved]
      (log/warnf "Skipping transform %s, since an export from before 66 left it without its deleted source database"
                 entity_id))
    (vec resolved)))
