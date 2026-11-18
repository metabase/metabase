(ns metabase.transforms.models.transform-tag
  (:require
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.events.core :as events]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.serialization :as transforms.serialization]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/TransformTag [_model] :transform_tag)

(doto :model/TransformTag
  (derive :metabase/model)
  (derive :hook/events)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

(defmethod events/spec :model/TransformTag
  [_model]
  {:create :event/transform-tag-create
   :update :event/transform-tag-update
   :delete :event/transform-tag-delete})

(defmethod app-db-copy/spec :model/TransformTag [_model]
  {:skip? false})

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(mu/defn- translate-name :- [:map {:closed true} [:name [:maybe mu/localized-string-schema]]]
  [tag :- [:or ::transforms.schema/transform-tag ::transforms.schema/transform-tag.update]]
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

(defn- check-name-free
  "Throws a 400 when the `:name` of `tag` belongs to another TransformTag."
  [{tag-name :name, :keys [id]}]
  (when-let [tag-name (not-empty (str tag-name))]
    (let [taken-by (transforms.db/tag-id-by-name tag-name)]
      (when (and taken-by (not= taken-by id))
        (throw (ex-info (i18n/tru "A tag with the name ''{0}'' already exists." tag-name) {:status-code 400}))))))

(t2/define-before-insert :model/TransformTag
  [tag]
  (check-name-free tag)
  tag)

(t2/define-before-update :model/TransformTag [tag]
  (when (contains? (t2/changes tag) :name)
    (check-name-free tag))
  (if (or (nil? (:built_in_type tag))
          (empty? (dissoc (t2/changes tag) :updated_at)))
    tag
    (-> (merge tag
               (translate-name tag)
               {:built_in_type nil}
               (t2/changes tag))
        (update :name str))))

;;; ------------------------------------------------- Permissions --------------------------------------------------

(mu/defn tag-id->writable :- [:map-of ms/PositiveInt :boolean]
  "The map from each of `tag-ids` to whether the current user writes every Transform it tags, a tag of no Transform
  being writable, in a fixed number of queries."
  [tag-ids :- [:set ms/PositiveInt]]
  (let [links      (when (seq tag-ids)
                     (transforms.db/transform-tag-links-for-tags tag-ids))
        transforms (when (seq links)
                     (transforms.db/transforms (into #{} (map :transform_id) links)))
        writable   (into {} (map (juxt :id mi/can-write?)) (t2/hydrate transforms :can_write))]
    (reduce (fn [acc {:keys [tag_id transform_id]}]
              (update acc tag_id #(and (not (false? %)) (get writable transform_id false))))
            (zipmap tag-ids (repeat true))
            links)))

(defmethod mi/can-create? :model/TransformTag
  [_model _instance]
  (and (not (remote-sync/read-only?))
       (api/entitled-data-analyst?)))

(defmethod mi/can-update? :model/TransformTag
  [tag _changes]
  (mi/can-write? tag))

;;; -------------------------------------------------- Hydration ---------------------------------------------------

(methodical/defmethod t2/batched-hydrate [:model/TransformTag :can_read]
  [_model k tags]
  (let [answer (boolean (api/entitled-data-analyst?))]
    (mapv #(vary-meta % assoc k answer) tags)))

(methodical/defmethod t2/batched-hydrate [:model/TransformTag :can_write]
  [_model k tags]
  (let [open?       (and (not (remote-sync/read-only?))
                         (or api/*is-superuser?* (api/entitled-data-analyst?)))
        by-transform (when (and open? (not api/*is-superuser?*) (seq tags))
                       (tag-id->writable (into #{} (map :id) tags)))]
    (mapv #(assoc % k (boolean (and open? (or api/*is-superuser?* (get by-transform (:id %) false))))) tags)))

(methodical/defmethod t2/batched-hydrate [:model/TransformTag :can_run]
  "Add :can_run to transform tags. Returns true if all transforms associated with the tag can be written by the current user."
  [_model _k tags]
  (if-not (seq tags)
    tags
    (let [tag-id->can-run (tag-id->writable (into #{} (map :id) tags))]
      (mapv #(assoc % :can_run (get tag-id->can-run (:id %) true)) tags))))

;;; ------------------------------------------------ Serialization -------------------------------------------------

(defmethod serialization/spec :model/TransformTag [_]
  {:schema        ::transforms.schema/external-transform-tag
   :copy          [:entity_id :built_in_type]
   :transform     {:name transforms.serialization/string-transform}
   :before-load   transforms.serialization/transform-tag-before-load
   :storage-paths transforms.serialization/transform-tag-storage-paths})

;;; ------------------------------------------------- Remote sync --------------------------------------------------

(defmethod remote-sync/spec :model/TransformTag
  [_model]
  {:synced-items           transforms.db/synced-transform-tag-items
   :synced-filter-clause   transforms.db/synced-transform-tags-clause
   :built-in-filter-clause transforms.db/built-in-transform-tags-clause})
