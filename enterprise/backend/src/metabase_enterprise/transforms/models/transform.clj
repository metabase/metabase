(ns metabase-enterprise.transforms.models.transform
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.transforms.interface :as transforms.i]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.search.core :as search.core]
   [metabase.search.ingestion :as search]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Transform [_model] :transform)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped?]]
  (derive :model/Transform trait))

;; Only superusers can access transforms, and writes/creates are blocked globally in remote-sync read-only mode
(defmethod mi/can-read? :model/Transform
  ([_instance]
   (mi/superuser?))
  ([model pk]
   (mi/can-read? (t2/select-one model pk))))

(defmethod mi/can-write? :model/Transform
  ([_instance]
   (and (mi/superuser?)
        (remote-sync/transforms-editable?)))
  ([model pk]
   (mi/can-write? (t2/select-one model pk))))

(defmethod mi/can-create? :model/Transform
  [_model _instance]
  (and (mi/superuser?)
       (remote-sync/transforms-editable?)))

(defn- keywordize-source-table-refs
  "Keywordize keys in source-tables map values (refs are maps, ints pass through)."
  [source-tables]
  (update-vals source-tables #(if (map? %) (update-keys % keyword) %)))

(defn- transform-source-out [m]
  (-> m
      mi/json-out-without-keywordization
      (update-keys keyword)
      (m/update-existing :source-tables keywordize-source-table-refs)
      (m/update-existing :query lib-be/normalize-query)
      (m/update-existing :type keyword)
      (m/update-existing :source-incremental-strategy #(update-keys % keyword))))

(defn- transform-source-in [m]
  (-> m
      (m/update-existing :source-tables transforms.util/normalize-source-tables)
      (m/update-existing :query (comp lib/prepare-for-serialization lib-be/normalize-query))
      mi/json-in))

(t2/deftransforms :model/Transform
  {:source_type mi/transform-keyword
   :source      {:out transform-source-out, :in transform-source-in}
   :target      mi/transform-json
   :run_trigger mi/transform-keyword})

(defmethod collection/allowed-namespaces :model/Transform
  [_]
  #{:transforms})

(t2/define-before-insert :model/Transform
  [{:keys [source collection_id] :as transform}]
  (collection/check-collection-namespace :model/Transform collection_id)
  (when collection_id
    (collection/check-allowed-content :model/Transform collection_id))
  (let [target-db-id (transforms.i/target-db-id transform)
        ;; This is defensive code to cope with some tests for remote sync, where we deserialize a transform
        ;; with a concrete database id within it, for a potentially non-existent database.
        ;; In practice, our serialized representation should not contain any database ids, and this should
        ;; not be required.
        ;; TODO (Chris 2026-02-02) -- Update tests so this workaround is unnecessary.
        valid-db-id? (and target-db-id (t2/exists? :model/Database :id target-db-id))]
    (when-not valid-db-id?
      (log/warnf "Invalid target database id (%d) ignored for new transform (%s)" target-db-id (:name transform)))
    (-> transform
        (assoc-in [:target :database] target-db-id)
        (assoc
         :source_type (transforms.util/transform-source-type source)
         :target_db_id (when valid-db-id? target-db-id)))))

(t2/define-before-update :model/Transform
  [{:keys [source] :as transform}]
  (when-let [new-collection (:collection_id (t2/changes transform))]
    (collection/check-collection-namespace :model/Transform new-collection)
    (collection/check-allowed-content :model/Transform new-collection))
  (cond-> transform
    source
    (assoc :source_type (transforms.util/transform-source-type source))

    (or (:source (t2/changes transform)) (:target (t2/changes transform)))
    ;; No database existence check added here, unlike for insert. Just allow updates for an invalid target to fail.
    (assoc :target_db_id (transforms.i/target-db-id transform))))

(t2/define-after-select :model/Transform
  [{:keys [source] :as transform}]
  (if source
    (assoc transform :source_type (transforms.util/transform-source-type source))
    transform))

(methodical/defmethod t2/batched-hydrate [:model/TransformRun :transform]
  "Add transform to a TransformRun"
  [_model _k runs]
  (if-not (seq runs)
    runs
    (let [transform-ids (into #{} (map :transform_id) runs)
          id->transform (t2/select-pk->fn identity [:model/Transform :id :name] :id [:in transform-ids])]
      (for [run runs] (assoc run :transform (get id->transform (:transform_id run)))))))

(methodical/defmethod t2/batched-hydrate [:model/Transform :last_run]
  "Add last_run to a transform"
  [_model _k transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids (into #{} (map :id) transforms)
          last-runs (m/index-by :transform_id (transform-run/latest-runs transform-ids))]
      (for [transform transforms] (assoc transform :last_run (get last-runs (:id transform)))))))

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
  (events/publish-event! :event/create-transform {:object transform})
  transform)

(t2/define-after-update :model/Transform [transform]
  (events/publish-event! :event/update-transform {:object transform})
  transform)

(t2/define-before-delete :model/Transform [transform]
  (events/publish-event! :event/delete-transform {:id (:id transform)})
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
  (let [table-key-fn (fn [{:keys [target] :as transform}]
                       [(transforms.i/target-db-id transform) (:schema target) (:name target)])
        table-keys (into #{} (map table-key-fn) transforms)
        table-keys-with-schema (filter second table-keys)
        table-keys-without-schema (keep (fn [[db-id schema table-name]]
                                          (when-not schema
                                            [db-id table-name]))
                                        table-keys)
        tables (when (or (seq table-keys-with-schema) (seq table-keys-without-schema))
                 (-> (t2/select :model/Table
                                {:where [:or
                                         (when (seq table-keys-with-schema)
                                           [:in [:composite :db_id :schema :name] table-keys-with-schema])
                                         (when (seq table-keys-without-schema)
                                           [:and
                                            [:= :schema nil]
                                            [:in [:composite :db_id :name] table-keys-without-schema]])]})
                     (t2/hydrate :db :fields)))
        table-keys->table (m/index-by (juxt :db_id :schema :name) tables)]
    (for [transform transforms]
      (assoc transform :table (get table-keys->table (table-key-fn transform))))))

(defmethod serdes/hash-fields :model/Transform
  [_transform]
  [:name :created_at])

(defmethod serdes/make-spec "Transform"
  [_model-name opts]
  {:copy      [:name :description :entity_id :owner_email]
   :skip      [:dependency_analysis_version :source_type :target_db_id]
   :transform {:created_at    (serdes/date)
               :creator_id    (serdes/fk :model/User)
               :owner_user_id (serdes/fk :model/User)
               :collection_id (serdes/fk :model/Collection)
               :source        {:export #(update % :query serdes/export-mbql)
                               :import #(update % :query serdes/import-mbql)}
               :target        {:export serdes/export-mbql :import serdes/import-mbql}
               :tags          (serdes/nested :model/TransformTransformTag :transform_id opts)}})

(defmethod serdes/dependencies "Transform"
  [{:keys [collection_id source tags]}]
  (set
   (concat
    (when collection_id
      [[{:model "Collection" :id collection_id}]])
    (for [{tag-id :tag_id} tags]
      [{:model "TransformTag" :id tag-id}])
    (serdes/mbql-deps source))))

(defmethod serdes/storage-path "Transform" [transform ctx]
  ;; Path: ["collections" "<nested ... collections>" "transforms" "<entity_id_name>"]
  ;; Use default collection path, then restructure similar to NativeQuerySnippet
  (let [basis (serdes/storage-default-collection-path transform ctx)
        file  (last basis)
        colls (->> basis rest (drop-last 2))] ; Drop "collections" at start, and last two elements
    (concat ["collections"] colls ["transforms" file])))

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

(defn- extract-transform-db-id
  "Return the database ID from transform source; else nil."
  [{:keys [source]}]
  (let [parsed-source (transform-source-out source)]
    (case (:type parsed-source)
      :query (get-in parsed-source [:query :database])
      :python (parsed-source :source-database)
      nil)))

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
                  :database-id   {:fn extract-transform-db-id
                                  :fields [:source]}}
   :search-terms [:name :description]
   :render-terms {:transform-name :name
                  :transform-id   :id}})
