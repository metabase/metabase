(ns metabase-enterprise.transforms.models.transform
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.search.ingestion :as search]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Transform [_model] :transform)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped?]]
  (derive :model/Transform trait))

;; Only superusers can access transforms
(doto :model/Transform
  (derive ::mi/read-policy.superuser)
  (derive ::mi/write-policy.superuser))

(t2/deftransforms :model/Transform
  {:source      mi/transform-json
   :target      mi/transform-json
   :run_trigger mi/transform-keyword})

(mi/define-batched-hydration-method with-transform
  :transform
  "Add transform to a TransformRun"
  [runs]
  (if-not (seq runs)
    runs
    (let [transform-ids (into #{} (map :transform_id) runs)
          id->transform (t2/select-pk->fn identity [:model/Transform :id :name] :id [:in transform-ids])]
      (for [run runs]
        (assoc run :transform (get id->transform (:transform_id run)))))))

(mi/define-batched-hydration-method with-last-run
  :last_run
  "Add last_run to a transform"
  [transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids (into #{} (map :id) transforms)
          last-runs     (m/index-by :transform_id (transform-run/latest-runs transform-ids))]
      (for [transform transforms]
        (assoc transform :last_run (get last-runs (:id transform)))))))

(mi/define-batched-hydration-method transform-tag-ids
  :transform_tag_ids
  "Add tag_ids to a transform, preserving the order defined by position"
  [transforms]
  (if-not (seq transforms)
    transforms
    (let [transform-ids         (into #{} (map :id) transforms)
          tag-associations      (when (seq transform-ids)
                                  (t2/select [:model/TransformTransformTag :transform_id :tag_id :position]
                                             :transform_id [:in transform-ids]
                                             {:order-by [[:position :asc]]}))
          transform-id->tag-ids (reduce (fn [acc {:keys [transform_id tag_id]}]
                                          (update acc transform_id (fnil conj []) tag_id))
                                        {}
                                        tag-associations)]
      (for [transform transforms]
        (assoc transform :tag_ids (vec (get transform-id->tag-ids (:id transform) [])))))))

(defn update-transform-tags!
  "Update the tags associated with a transform using smart diff logic.
   Only modifies what has changed: deletes removed tags, updates positions for moved tags,
   and inserts new tags. Duplicate tag IDs are automatically deduplicated."
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

(defmethod serdes/hash-fields :model/Transform
  [_transform]
  [:name :created_at])

(defmethod serdes/make-spec "Transform"
  [_model-name opts]
  {:copy [:name :description :entity_id]
   :skip []
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :source {:export serdes/export-mbql :import serdes/import-mbql}
               :target {:export serdes/export-mbql :import serdes/import-mbql}
               :tags (serdes/nested :model/TransformTransformTag :transform_id opts)}})

(defmethod serdes/dependencies "Transform"
  [{:keys [source tags]}]
  (set
   (concat
    (for [{tag-id :tag_id} tags]
      [{:model "TransformTag" :id tag-id}])
    (serdes/mbql-deps source))))

(defmethod serdes/storage-path "Transform" [transform _ctx]
  (let [{:keys [id label]} (-> transform serdes/path last)]
    ["transforms" (serdes/storage-leaf-file-name id label)]))

(defn- maybe-extract-transform-query-text
  "Return the query text (truncated to `max-searchable-value-length`) from transform source; else nil.
  Extracts SQL from query-type transforms and Python code from python-type transforms."
  [{:keys [source]}]
  (let [source-data ((:out mi/transform-json) source)
        query-text (case (:type source-data)
                     "query" (get-in source-data [:query :native :query])
                     "python" (:body source-data)
                     nil)]
    (when query-text
      (subs query-text 0 (min (count query-text) search/max-searchable-value-length)))))

(defn- extract-transform-db-id
  "Return the database ID from transform source; else nil."
  [{:keys [source]}]
  (let [parsed-source ((:out mi/transform-json) source)]
    (case (:type parsed-source)
      "query" (get-in parsed-source [:query :database])
      "python" (parsed-source :source-database)
      nil)))

;;; ------------------------------------------------- Search ---------------------------------------------------

(search.spec/define-spec "transform"
  {:model        :model/Transform
   :attrs        {:archived      false
                  :collection-id false
                  :created-at    true
                  :updated-at    true
                  :native-query  {:fn maybe-extract-transform-query-text
                                  :fields [:source]}
                  :database-id   {:fn extract-transform-db-id
                                  :fields [:source]}}
   :search-terms [:name :description]
   :render-terms {:description true}})
