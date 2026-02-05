(ns metabase.models.transforms.transform-tag
  (:require
   [metabase.api.common :as api]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.models.serialization :as serdes]
   [metabase.models.transforms.transform :as transform]
   [metabase.util.i18n :as i18n]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

(methodical/defmethod t2/table-name :model/TransformTag [_model] :transform_tag)

(doto :model/TransformTag
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(defmethod mi/can-read? :model/TransformTag
  ([_instance]
   (api/is-data-analyst?))
  ([_model _pk]
   (api/is-data-analyst?)))

(defmethod mi/can-write? :model/TransformTag
  ([instance]
   (or api/*is-superuser?*
       (and api/*is-data-analyst?*
            (let [transforms (transform/transforms-with-tags [(:id instance)])]
              (every? mi/can-write? transforms)))))
  ([_model pk]
   (when-let [tag (t2/select-one :model/TransformTag :id pk)]
     (mi/can-write? tag))))

(defmethod mi/can-create? :model/TransformTag
  [_model _instance]
  (api/is-data-analyst?))

(defn tag-name-exists?
  "Check if a tag with the given name already exists"
  [tag-name]
  (t2/exists? :model/TransformTag :name tag-name))

(defn tag-name-exists-excluding?
  "Check if a tag with the given name exists, excluding the specified ID"
  [tag-name tag-id]
  (t2/exists? :model/TransformTag :name tag-name :id [:not= tag-id]))

(defn- translate-name [tag]
  (let [values {"hourly"  (i18n/deferred-trs "hourly")
                "daily"   (i18n/deferred-trs "daily")
                "weekly"  (i18n/deferred-trs "weekly")
                "monthly" (i18n/deferred-trs "monthly")}
        name (get values (:built_in_type tag))]
    {:name name}))

(t2/define-after-select :model/TransformTag [tag]
  (if (nil? (:built_in_type tag))
    tag
    (merge tag (translate-name tag))))

(t2/define-before-update :model/TransformTag [tag]
  (if (or (nil? (:built_in_type tag))
          mi/*deserializing?*)
    tag
    (-> (merge (translate-name tag) ;; translated default names
               {:built_in_type nil} ;; never translate this again
               (t2/changes tag))    ;; include user edits
        (update :name str)))) ;; convert deferred to string

(methodical/defmethod t2/batched-hydrate [:model/TransformTag :can_run]
  "Add :can_run to transform tags. Returns true if all transforms associated with the tag can be written by the current user."
  [_model _k tags]
  (if-not (seq tags)
    tags
    (let [tag-ids (into #{} (map :id) tags)
          ;; Get all transform-tag associations
          associations (t2/select [:model/TransformTransformTag :tag_id :transform_id]
                                  :tag_id [:in tag-ids])
          ;; Get unique transform IDs
          transform-ids (into #{} (map :transform_id) associations)
          ;; Fetch transforms and check can-write? for each
          transforms (when (seq transform-ids)
                       (t2/select :model/Transform :id [:in transform-ids]))
          transform-id->can-write (into {} (map (juxt :id mi/can-write?)) transforms)
          ;; Build tag-id -> can_run map
          tag-id->transform-ids (reduce (fn [acc {:keys [tag_id transform_id]}]
                                          (update acc tag_id (fnil conj #{}) transform_id))
                                        {}
                                        associations)
          tag-id->can-run (into {}
                                (map (fn [[tag-id tform-ids]]
                                       [tag-id (every? #(get transform-id->can-write % false) tform-ids)]))
                                tag-id->transform-ids)]
      (mapv #(assoc % :can_run (get tag-id->can-run (:id %) true)) tags))))

(defmethod serdes/hash-fields :model/TransformTag
  [_tt]
  [:name :built_in_type])

(defmethod serdes/make-spec "TransformTag"
  [_model-name _opts]
  {:copy [:entity_id :built_in_type]
   :transform {:name {:export str :import identity}
               :created_at (serdes/date)}})

(defmethod serdes/storage-path "TransformTag" [tt _ctx]
  (let [{:keys [id label]} (-> tt serdes/path last)]
    ["transforms" "transform_tags" (serdes/storage-leaf-file-name id label)]))

;; Event hooks for remote-sync tracking
(t2/define-after-insert :model/TransformTag [tag]
  (events/publish-event! :event/transform-tag-create {:object tag})
  tag)

(t2/define-after-update :model/TransformTag [tag]
  (events/publish-event! :event/transform-tag-update {:object tag})
  tag)

(t2/define-before-delete :model/TransformTag [tag]
  (events/publish-event! :event/transform-tag-delete {:object tag})
  tag)
