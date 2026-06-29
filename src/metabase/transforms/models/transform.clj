(ns metabase.transforms.models.transform
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.permissions.core :as perms]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.core :as search.core]
   [metabase.search.ingestion :as search]
   [metabase.search.spec :as search.spec]
   [metabase.transforms-base.interface :as transforms-base.i]
   [metabase.transforms-base.util :as transforms-base.u]
   [metabase.transforms.models.transform-run :as transform-run]
   [metabase.transforms.util :as transforms.u]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]
   [toucan2.instance :as t2.instance]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Transform [_model] :transform)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped?]]
  (derive :model/Transform trait))

(defn- transform-readable?
  "Whether the current user can read `instance`. Any extra `args` (an optional `models-cache`) are
  passed through to `transforms.u/source-tables-readable?`."
  [instance & args]
  (and (transforms.u/check-feature-enabled instance)
       (or api/*is-superuser?*
           (and (api/is-data-analyst?)
                (apply transforms.u/source-tables-readable? instance args)))))

(defn- transform-writable?
  "Whether the current user can write `instance`. Any extra `args` (an optional `models-cache`) are
  passed through to the source-readability check, as in `transform-readable?`."
  [instance & args]
  (and (remote-sync/transforms-editable?)
       (transforms.u/check-feature-enabled instance)
       (or api/*is-superuser?*
           (and (apply transform-readable? instance args)
                (perms/has-db-transforms-permission? api/*current-user-id* (:source_database_id instance))))))

(defmethod mi/can-read? :model/Transform
  ([instance]
   (transform-readable? instance))
  ([_model pk]
   (when-let [transform (t2/select-one :model/Transform :id pk)]
     (mi/can-read? transform))))

(defmethod mi/can-write? :model/Transform
  ([instance]
   (transform-writable? instance))
  ([_model pk]
   (when-let [transform (t2/select-one :model/Transform :id pk)]
     (mi/can-write? transform))))

;; Users who can read the transform can also query it. This is a duplicate, but keeps things explicit.
(defmethod mi/can-query? :model/Transform
  ([instance]
   (mi/can-read? instance))
  ([model pk]
   (mi/can-read? model pk)))

(defmethod mi/can-create? :model/Transform
  [_model instance]
  ;; Inline can-write? logic since instance is a plain map without model metadata.
  ;; can-write? requires: can-read?, has-db-transforms-permission?, and transforms-editable?
  ;; can-read? requires: is-superuser? OR (is-data-analyst? AND source-tables-readable?)
  (and (remote-sync/transforms-editable?)
       (transforms.u/check-feature-enabled instance)
       (or api/*is-superuser?*
           (let [source-db-id (or (:source_database_id instance) (transforms-base.i/source-db-id instance))]
             (and api/*is-data-analyst?*
                  (transforms.u/source-tables-readable? instance)
                  (perms/has-db-transforms-permission? api/*current-user-id* source-db-id))))))

(defn- orphan-query?
  "True when the query map has its `:database` key explicitly set to nil — the
  signature of a transform body whose source database has been deleted (e.g.
  imported from a serdes export of an orphan). We preserve such bodies verbatim
  rather than running them through MBQL normalization, which requires a database."
  [q]
  (or (and (contains? q :database) (nil? (:database q)))
      (and (contains? q "database") (nil? (get q "database")))))

(defn transform-source-out
  "Deserialize a transform source map from JSON storage format.
  Normalizes queries and keywordizes type fields."
  [m]
  (-> m
      mi/json-out-without-keywordization
      (update-keys keyword)
      (m/update-existing :query (fn [q] (if (orphan-query? q) q (lib-be/normalize-query q))))
      (m/update-existing :source-incremental-strategy #(update-keys % keyword))
      (m/update-existing :source-tables (fn [st] (mapv #(update-keys % keyword) st)))
      (m/update-existing :type keyword)))

(defn transform-source-in
  "Serialize a transform source map for JSON storage."
  [m]
  (-> m
      (m/update-existing :query (fn [q]
                                  (if (orphan-query? q)
                                    q
                                    ((comp lib/prepare-for-serialization lib-be/normalize-query) q))))
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
  [{:keys [source collection_id source_database_id] :as transform}]
  (collection/check-collection-namespace :model/Transform collection_id)
  (when collection_id
    (collection/check-allowed-content :model/Transform collection_id))
  (let [target-db-id (transforms-base.i/target-db-id transform)
        valid-db-id? (and target-db-id (t2/exists? :model/Database :id target-db-id))]
    ;; Don't warn when target-db-id is nil — that's an orphan source (e.g. a
    ;; serdes-imported transform whose source database is missing), not a
    ;; misconfiguration. Only warn when an id is supplied but invalid.
    (when (and target-db-id (not valid-db-id?))
      (log/warnf "Invalid target database id (%s) ignored for new transform (%s)" target-db-id (:name transform)))
    (-> transform
        (assoc-in [:target :database] target-db-id)
        (assoc
         :source_type (transforms-base.u/transform-source-type source)
         :target_db_id (when valid-db-id? target-db-id)
         :source_database_id (or source_database_id (transforms-base.i/source-db-id transform))))))

(t2/define-before-update :model/Transform
  [{:keys [source source_database_id] :as transform}]
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
      (assoc :last_checkpoint_value nil))))

(t2/define-after-select :model/Transform
  [{:keys [source] :as transform}]
  (if source
    (assoc transform :source_type (transforms-base.u/transform-source-type source))
    transform))

(defn- hydrate-permission
  "Batched-hydrate helper: attach a permission under `k` to each transform by calling `pred`
   (`transform-readable?`/`transform-writable?`) with a `models-cache` prefetched once for the whole
   list, so checking N transforms doesn't issue a query per transform."
  [k transforms pred]
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
                          (t2/select-pk->fn identity [:model/Transform :id :name :collection_id] :id [:in transform-ids]))]
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
                     (t2/select-one-fn :last_checkpoint_value [:model/Transform :last_checkpoint_value] transform-id)))
            transform))))))

(methodical/defmethod t2/batched-hydrate [:model/Transform :transform_tag_ids]
  "Add tag_ids to a transform, preserving the order defined by position"
  [_model _k transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids (into #{} (map :id) transforms)
          tag-associations (t2/select
                            [:model/TransformTransformTag :transform_id :tag_id :position]
                            :transform_id
                            [:in transform-ids]
                            {:order-by [[:position :asc]]})
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
          id->creator (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name]
                                        :id [:in creator-ids])]
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
                      (t2/select-pk->fn identity [:model/User :id :email :first_name :last_name]
                                        :id [:in owner-user-ids]))]
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

(t2/define-before-delete :model/Transform [transform]
  (when-not mi/*deserializing?*
    (events/publish-event! :event/delete-transform {:id (:id transform)}))
  (search.core/delete! :model/Transform [(str (:id transform))])
  transform)

(defn update-transform-tags!
  "Update the tags associated with a transform using smart diff logic. Only modifies what has changed: deletes removed
  tags, updates positions for moved tags, and inserts new tags. Duplicate tag IDs are automatically deduplicated."
  [transform-id tag-ids]
  (when transform-id
    (t2/with-transaction [_conn]
      (let [;; Deduplicate while preserving order of first occurrence
            deduped-tag-ids      (vec (distinct tag-ids))
            ;; Get current associations
            current-associations (t2/select [:model/TransformTransformTag :tag_id :position]
                                            :transform_id transform-id
                                            {:order-by [[:position :asc]]})
            current-tag-ids      (mapv :tag_id current-associations)
            ;; Validate that new tag IDs exist
            valid-tag-ids        (when (seq deduped-tag-ids)
                                   (into #{} (t2/select-fn-set :id :model/TransformTag
                                                               :id [:in deduped-tag-ids])))
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
          (t2/delete! :model/TransformTransformTag
                      :transform_id transform-id
                      :tag_id [:in to-delete]))
        ;; Update positions for existing tags that moved
        (doseq [tag-id (filter current-set new-tag-ids)]
          (let [new-pos (get new-positions tag-id)]
            (t2/update! :model/TransformTransformTag
                        {:transform_id transform-id :tag_id tag-id}
                        {:position new-pos})))
        ;; Insert new associations with correct positions
        (when (seq to-insert)
          (t2/insert! :model/TransformTransformTag
                      (for [tag-id to-insert]
                        {:transform_id transform-id
                         :tag_id       tag-id
                         :position     (get new-positions tag-id)})))))))

;;; ------------------------------------------------- Serialization ------------------------------------------------

(mi/define-batched-hydration-method tags
  :tags
  "Fetch tags"
  [transforms]
  (when (seq transforms)
    (let [transform-ids (into #{} (map u/the-id) transforms)
          tag-mappings  (group-by :transform_id
                                  (t2/select :model/TransformTransformTag
                                             :transform_id [:in transform-ids]
                                             {:order-by [[:position :asc]]}))]
      (for [transform transforms]
        (assoc transform :tags (get tag-mappings (u/the-id transform) []))))))

(mi/define-batched-hydration-method table-with-db-and-fields
  :table-with-db-and-fields
  "Fetch tables with their fields. The tables show up under the `:table` property."
  [transforms]
  (let [table-ids (into #{} (keep :target_table_id) transforms)
        id->table (when (seq table-ids)
                    (m/index-by :id (-> (t2/select :model/Table :id [:in table-ids])
                                        (t2/hydrate :db :fields))))]
    (for [transform transforms]
      (assoc transform :table
             (get id->table (:target_table_id transform))))))

(defmethod serdes/hash-fields :model/Transform
  [_transform]
  [:name :created_at])

(defn- import-maybe-int-database-fk
  "Import a database reference back to an ID. Tolerates raw numeric IDs from older exports
  where source-tables database_id values were serialized without conversion."
  [v]
  (if (pos-int? v) v (serdes/*import-database-fk* v)))

(defn- import-maybe-int-table-fk
  "Import a table reference back to an ID. Tolerates raw numeric IDs from older exports
  where source-tables table_id values were serialized without conversion."
  [v]
  (if (pos-int? v) v (serdes/*import-table-fk* v)))

(defmethod serdes/make-spec "Transform"
  [_model-name opts]
  {:copy      [:name :description :entity_id :owner_email]
   :skip      [:source_type :target_db_id :target_table_id :last_checkpoint_value :table_dependencies]
   :transform {:created_at         (serdes/date)
               :creator_id         (serdes/fk :model/User)
               :owner_user_id      (serdes/fk :model/User)
               :collection_id      (serdes/fk :model/Collection)
               :source_database_id (serdes/fk :model/Database)
               :source             {:export-with-context
                                    (fn [{:keys [source_database_id]} _k source]
                                      (if source_database_id
                                        (-> source
                                            (m/update-existing :query serdes/export-mbql)
                                            (m/update-existing :source-database serdes/*export-database-fk*)
                                            (m/update-existing :source-tables
                                                               (fn [entries]
                                                                 (->> (transforms-base.u/normalize-source-tables entries)
                                                                      (mapv #(-> %
                                                                                 (m/update-existing :table_id serdes/*export-table-fk*)
                                                                                 (m/update-existing :database_id serdes/*export-database-fk*)))))))
                                        ;; Orphan: source DB has been deleted, so table/field rows it referenced
                                        ;; are gone too. Null the dead numeric refs and flag the body so
                                        ;; the importer skips ref resolution.
                                        (-> source
                                            (assoc :serdes/unresolved true)
                                            (m/update-existing :query assoc :database nil)
                                            (m/update-existing :source-database (constantly nil))
                                            (m/update-existing :source-tables
                                                               #(mapv (fn [e] (assoc e :table_id nil :database_id nil)) %)))))
                                    :import
                                    (fn [source]
                                      (if (:serdes/unresolved source)
                                        (dissoc source :serdes/unresolved)
                                        (-> source
                                            (m/update-existing :query serdes/import-mbql)
                                            (m/update-existing :source-database import-maybe-int-database-fk)
                                            (m/update-existing :source-tables
                                                               (fn [entries]
                                                                 (->> (cond-> entries (map? entries) transforms-base.u/source-tables-map->vec)
                                                                      (mapv (fn [entry]
                                                                              (-> entry
                                                                                  (m/update-existing :table_id import-maybe-int-table-fk)
                                                                                  (m/update-existing :database_id import-maybe-int-database-fk))))))))))}
               :target             {:export #(serdes/export-mbql (dissoc % :table_id))
                                    :import serdes/import-mbql}
               :tags               (serdes/nested :model/TransformTransformTag :transform_id (merge {:sort-by (juxt :position :created_at)} opts))}})

(defmethod serdes/dependencies "Transform"
  [{:keys [collection_id source tags source_database_id]}]
  (set
   (concat
    (when collection_id
      [[{:model "Collection" :id collection_id}]])
    (when source_database_id
      [[{:model "Database" :id source_database_id}]])
    (for [{tag-id :tag_id} tags]
      [{:model "TransformTag" :id tag-id}])
    (serdes/mbql-deps source))))

(defmethod serdes/storage-path "Transform" [transform ctx]
  (serdes/storage-default-collection-path transform ctx "transforms"))

(defmethod serdes/required "Transform"
  [_model id]
  (when-let [collection-id (t2/select-one-fn :collection_id :model/Transform :id id)]
    {["Collection" collection-id] {"Transform" id}}))

(defn- maybe-extract-transform-query-text
  "Return the query text (truncated to `max-searchable-value-length`) from transform source; else nil.
  Extracts SQL from query-type transforms and Python code from python-type transforms."
  [{transform-source-type :source_type source :source}]
  (let [source-data (transform-source-out source)
        ;; Use the top-level :source_type field since it differentiates between MBQL vs native transforms
        query-text (case (keyword transform-source-type)
                     :native (lib/raw-native-query (:query source-data))
                     :python (:body source-data)
                     nil)]
    (when query-text
      (subs query-text 0 (min (count query-text) search/max-searchable-value-length)))))

(defn transforms-with-tags
  "Returns all transforms associated with the given tag IDs.
  Return empty list if no tag IDs are provided or no transforms are associated with the tags."
  [tag-ids]
  (or (when (seq tag-ids)
        (when-let [transform-ids (t2/select-fn-set :transform_id [:model/TransformTransformTag :transform_id]
                                                   :tag_id [:in tag-ids])]
          (t2/select :model/Transform :id [:in transform-ids])))
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
