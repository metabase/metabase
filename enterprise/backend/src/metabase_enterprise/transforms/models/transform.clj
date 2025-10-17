(ns metabase-enterprise.transforms.models.transform
  (:require
   [clojure.set :as set]
   [medley.core :as m]
   [metabase-enterprise.transforms.models.transform-run :as transform-run]
   [metabase-enterprise.transforms.util :as transforms.util]
   [metabase.events.core :as events]
   [metabase.lib-be.core :as lib-be]
   [metabase.lib.core :as lib]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.search.spec :as search.spec]
   [metabase.util :as u]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(methodical/defmethod t2/table-name :model/Transform [_model] :transform)

(doseq [trait [:metabase/model :hook/entity-id :hook/timestamped?]]
  (derive :model/Transform trait))

(defn- transform-source-out [m]
  (-> m
      mi/json-out-without-keywordization
      (update-keys keyword)
      (m/update-existing :query lib-be/normalize-query)
      (m/update-existing :type keyword)))

(defn- transform-source-in [m]
  (-> m
      (m/update-existing :query (comp lib/prepare-for-serialization lib-be/normalize-query))
      mi/json-in))

(t2/deftransforms :model/Transform
  {:source      {:out transform-source-out, :in transform-source-in}
   :target      mi/transform-json
   :run_trigger mi/transform-keyword})

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
          tag-associations (when (seq transform-ids)
                             (t2/select
                              [:model/TransformTransformTag :transform_id :tag_id :position]
                              :transform_id
                              [:in transform-ids]
                              {:order-by [[:position :asc]]}))
          transform-id->tag-ids (reduce
                                 (fn [acc {:keys [transform_id tag_id]}]
                                   (update acc transform_id (fnil conj []) tag_id))
                                 {}
                                 tag-associations)]
      (for [transform transforms] (assoc transform :tag_ids (vec (get transform-id->tag-ids (:id transform) [])))))))

(t2/define-after-insert :model/Transform [transform]
  (events/publish-event! :event/create-transform {:object transform})
  transform)

(t2/define-after-update :model/Transform [transform]
  (events/publish-event! :event/update-transform {:object transform})
  transform)

(t2/define-before-delete :model/Transform [transform]
  (events/publish-event! :event/delete-transform {:id (:id transform)})
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

;;; ----------------------------------------------- Search ----------------------------------------------------------

(search.spec/define-spec "transform"
  {:model :model/Transform
   :attrs {:archived      false
           :collection-id false
           :creator-id    false
           :database-id   false
           :view-count    false
           :created-at    true
           :updated-at    true}
   :search-terms [:name]
   :render-terms {:transform-name :name
                  :transform-id :id}})

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
                       [(transforms.util/target-database-id transform) (:schema target) (:name target)])
        table-keys (into #{} (map table-key-fn) transforms)
        table-keys-with-schema (filter second table-keys)
        table-keys-without-schema (keep (fn [[db-id schema table-name]]
                                          (when-not schema
                                            [db-id table-name]))
                                        table-keys)
        tables (-> (t2/select :model/Table
                              {:where [:or
                                       [:in [:composite :db_id :schema :name] table-keys-with-schema]
                                       [:and
                                        [:= :schema nil]
                                        [:in [:composite :db_id :name] table-keys-without-schema]]]})
                   (t2/hydrate :db :fields))
        table-keys->table (m/index-by (juxt :db_id :schema :name) tables)]
    (for [transform transforms]
      (assoc transform :table (get table-keys->table (table-key-fn transform))))))

(defmethod serdes/hash-fields :model/Transform
  [_transform]
  [:name :created_at])

(defmethod serdes/make-spec "Transform"
  [_model-name opts]
  {:copy [:name :description :entity_id]
   :skip [:dependency_analysis_version]
   :transform {:created_at (serdes/date)
               :updated_at (serdes/date)
               :source {:export #(update % :query serdes/export-mbql)
                        :import #(update % :query serdes/import-mbql)}
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
