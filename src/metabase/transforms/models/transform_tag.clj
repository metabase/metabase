(ns metabase.transforms.models.transform-tag
  (:require
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.events.core :as events]
   [metabase.lib.schema.id :as lib.schema.id]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.transforms.db :as transforms.db]
   [metabase.transforms.schema :as transforms.schema]
   [metabase.transforms.serialization :as transforms.serialization]
   [metabase.util :as u]
   [metabase.util.i18n :as i18n]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/TransformTag [_model] :transform_tag)

(doto :model/TransformTag
  (derive :metabase/model)
  (derive :hook/entity-id)
  (derive :hook/timestamped?))

;;; ---------------------------------------------------- Hooks -----------------------------------------------------

(mu/defn- translate-name :- [:map {:closed true} [:name [:maybe mu/localized-string-schema]]]
  [tag :- (mut/optional-keys ::transforms.schema/transform-tag [:id])]
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

;;; ---------------------------------------------------- Writes ----------------------------------------------------

(defn- check-names-free
  "Throws a 400 when a name among `rows` is held by a TransformTag other than the row's own, or by an earlier row. A row
  of an update holds its `:id`; a row with no name is left alone."
  [rows]
  (reduce (fn [taken [index {:keys [id] :as row}]]
            (if-let [tag-name (not-empty (str (:name row)))]
              (let [own (or id [::new index])]
                (when-let [owner (get taken tag-name)]
                  (when (not= owner own)
                    (throw (ex-info (i18n/tru "A tag with the name ''{0}'' already exists." tag-name)
                                    {:status-code 400}))))
                (assoc taken tag-name own))
              taken))
          (transforms.db/tag-names-to-ids)
          (map-indexed vector rows)))

(defn- updated-tag
  "The TransformTag `stored` as the update `changes` leaves it: a built-in tag that changes becomes a custom one that keeps
  its name, as the update hook makes it."
  [stored changes]
  (let [object (merge stored changes)]
    (if (or (nil? (:built_in_type stored))
            (empty? (dissoc (into {} (filter (fn [[k v]] (not= v (get stored k)))) changes) :updated_at)))
      object
      (-> (merge object (translate-name stored) {:built_in_type nil} changes)
          (update :name str)))))

(defn- without-built-in-names
  "`rows`, the update rows of an import, without the name of those of a built-in tag in `stored`."
  [rows stored]
  (mapv (fn [{:keys [id] :as row}]
          (cond-> row
            (and (some? (:built_in_type (stored id))) (not (contains? row :built_in_type)))
            (dissoc :name)))
        rows))

(mu/defn create-transform-tags! :- [:sequential ::transforms.schema/transform-tag]
  "Insert the TransformTag `rows` in one transaction, publishing their create event, and return the inserted tags.
  Throws a 400 when a name is already taken; an import makes each name another tag holds unique instead."
  ([rows :- [:sequential ::transforms.schema/transform-tag.create]]
   (create-transform-tags! rows nil))
  ([rows :- [:sequential ::transforms.schema/transform-tag.create]
    opts :- ::transforms.schema/write-opts]
   (let [rows (if (= :import (:writer opts))
                (transforms.serialization/rename-taken-tag-names rows (transforms.db/tag-names-to-ids))
                (do (check-names-free rows) rows))]
     (if (seq rows)
       (t2/with-transaction [_conn]
         (let [tags (transforms.db/insert-tags! rows)]
           (events/publish-event! :event/transform-tag-create (events/create-event tags opts))
           tags))
       []))))

(defn- with-custom-name
  "`row`, an update of the TransformTag `stored`, with the translated name and the cleared `built_in_type` with which an
  update that changes anything makes a built-in tag a custom one, as [[updated-tag]] shows it."
  [stored row]
  (if (or (nil? (:built_in_type (merge stored row)))
          (empty? (dissoc (mi/effective-changes stored (dissoc row :id)) :updated_at)))
    row
    (-> (merge (translate-name stored) {:built_in_type nil} row)
        (update :name str))))

(mu/defn update-transform-tags! :- [:sequential ::transforms.schema/transform-tag.update]
  "Apply the changes in each of `rows`, the id of a TransformTag and the columns to change, in one transaction, with
  one statement per distinct change set, publishing their update event. Throws a 400 when a new name is already taken;
  an import keeps the name of a built-in tag and makes each other name another tag holds unique instead. Returns
  `rows`."
  ([rows :- [:sequential ::transforms.schema/transform-tag.update]]
   (update-transform-tags! rows nil))
  ([rows :- [:sequential ::transforms.schema/transform-tag.update]
    opts :- ::transforms.schema/write-opts]
   (when (seq rows)
     (t2/with-transaction [_conn]
       (let [stored  (u/index-by :id (transforms.db/tags-by-ids (mapv :id rows)))
             changed (if (= :import (:writer opts))
                       (transforms.serialization/rename-taken-tag-names (without-built-in-names rows stored)
                                                                        (transforms.db/tag-names-to-ids))
                       (do (check-names-free rows) rows))]
         (doseq [[changes tag-ids] (mi/group-ids-by-changes stored (mapv #(with-custom-name (stored (:id %)) %) changed))]
           (transforms.db/update-tags! tag-ids changes))
         (events/publish-event! :event/transform-tag-update
                                (events/update-event stored
                                                     changed
                                                     (assoc opts :objects (into {}
                                                                                (keep (fn [{:keys [id] :as row}]
                                                                                        (when-let [previous (stored id)]
                                                                                          [id (updated-tag previous (dissoc row :id))])))
                                                                                changed)))))))
   (vec rows)))

(mu/defn delete-transform-tags! :- :nil
  "Delete the TransformTags with `tag-ids`, which removes them from their Transforms and TransformJobs, publishing their
  delete event."
  [tag-ids :- [:sequential ::lib.schema.id/transform-tag]]
  (when (seq tag-ids)
    (t2/with-transaction [_conn]
      (events/publish-event! :event/transform-tag-delete
                             (events/delete-event (transforms.db/tags-by-ids (vec tag-ids))))
      (transforms.db/delete-tags! (vec tag-ids))))
  nil)

;;; ---------------------------------------------------- Specs -----------------------------------------------------

(defmethod app-db-copy/spec :model/TransformTag [_model]
  {:skip? false})

(defmethod serialization/spec :model/TransformTag [_]
  {:schema        ::transforms.schema/external-transform-tag
   :copy          [:entity_id :built_in_type]
   :transform     {:name transforms.serialization/string-transform}
   :insert!       #(create-transform-tags! % {:writer :import})
   :update!       #(update-transform-tags! % {:writer :import})
   :delete!       delete-transform-tags!
   :storage-paths transforms.serialization/transform-tag-storage-paths})

(defmethod remote-sync/spec :model/TransformTag
  [_model]
  {:synced-items           transforms.db/synced-transform-tag-items
   :synced-filter-clause   transforms.db/synced-transform-tags-clause
   :built-in-filter-clause transforms.db/built-in-transform-tags-clause})
