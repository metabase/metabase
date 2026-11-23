(ns metabase.transforms.models.transform-tag
  (:require
   [malli.util :as mut]
   [metabase.api.common :as api]
   [metabase.app-db.copy-spec :as app-db-copy]
   [metabase.app-db.core :as mdb]
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

(def ^:private built-in-types
  "The `built_in_type` of the built-in TransformTags."
  ["hourly" "daily" "weekly" "monthly"])

(defn- built-in-names
  "A map from each `built_in_type` to its translated name, as a string."
  []
  (into {} (map (fn [built-in-type] [built-in-type (str (:name (translate-name {:built_in_type built-in-type})))]))
        built-in-types))

(t2/define-before-update :model/TransformTag [tag]
  (let [changes (t2/changes tag)]
    (if (or (empty? (dissoc changes :updated_at))
            (contains? changes :built_in_type))
      tag
      ;; An array map keeps the name first, so that a statement that evaluates its assignments in order still reads
      ;; the built-in type of the stored row.
      (merge (array-map :name (transforms.db/built-in-value-clause :name (built-in-names)) :built_in_type nil) changes))))

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

(mu/defn create-transform-tags! :- [:sequential ::transforms.schema/transform-tag]
  "Insert the TransformTag `rows` in batches in one transaction, publishing one create event for all, and return the inserted tags.
  A name another tag holds is refused by the unique index of the name; an import makes each such name unique instead."
  ([rows :- [:sequential ::transforms.schema/transform-tag.create]]
   (create-transform-tags! rows nil))
  ([rows :- [:sequential ::transforms.schema/transform-tag.create]
    opts :- ::transforms.schema/write-opts]
   (let [rows (cond-> rows
                (= :import (:writer opts)) (transforms.serialization/rename-taken-tag-names (transforms.db/tag-names-to-ids)))]
     (t2/with-transaction [_conn]
       (let [tags (into [] (mapcat transforms.db/insert-tags!) (map vec (partition-all mdb/create-partition-size rows)))]
         (when (seq tags)
           (events/publish-event! :event/transform-tag-create (events/create-event tags opts)))
         tags)))))

(defn- without-built-in-names
  "`changes`, the changes of an import, without the name of `stored`, a built-in tag, unless they set its type."
  [stored changes]
  (cond-> changes
    (and (some? (:built_in_type stored)) (not (contains? changes :built_in_type)))
    (dissoc :name)))

(defn- import-rows
  "`rows`, the changes of an import, with a built-in tag of `stored` keeping its name and each other name another tag
  holds made unique against the tags the other rows leave: the old name of a tag of the call that is renamed is free."
  [rows stored]
  (let [rows    (mapv #(without-built-in-names (stored (:id %)) %) rows)
        renamed (into #{} (comp (filter :name) (map :id)) rows)
        taken   (into {} (remove (comp renamed val)) (transforms.db/tag-names-to-ids))]
    (transforms.serialization/rename-taken-tag-names rows taken)))

(defn- renames-held-name?
  "Whether `row`, which renames a tag of `stored`, takes the name of a tag in `pending`, the rows not written yet."
  [stored pending row]
  (let [new-name (:name row)]
    (and (some? new-name)
         (not= new-name (:name (stored (:id row))))
         (some #(and (not= (:id %) (:id row)) (= new-name (:name (stored (:id %))))) pending))))

(defn- rename-order
  "`rows` ordered so that each rename follows the rename of the tag that holds its new name. Throws a 400 for rows that
  swap names, which the unique index of the name cannot write."
  [rows stored]
  (loop [pending (vec rows)
         ordered []]
    (if (empty? pending)
      ordered
      (if-let [row (first (remove #(renames-held-name? stored pending %) pending))]
        (recur (filterv #(not= (:id %) (:id row)) pending) (conj ordered row))
        (throw (ex-info "TransformTags cannot swap names in one update." {:status-code 400}))))))

(defn- requested-changes
  "A vector of `[id changes]` pairs, one for each of `rows`, the id of a TransformTag and its columns to change, for the
  tags in `stored`, as `opts` says they are written, in an order that writes each rename after the one that frees its
  name."
  [rows stored opts]
  (let [rows (filterv (comp stored :id) rows)
        rows (cond-> rows (= :import (:writer opts)) (import-rows stored))]
    (mapv (juxt :id #(dissoc % :id)) (rename-order rows stored))))

(defn- update-event
  "The update event of the tags of `stored` that `requested`, a map from id to its changes, changes."
  [stored requested opts]
  (events/update-event stored
                       (mapv (fn [[id changes]] (assoc changes :id id)) requested)
                       (assoc opts :objects (into {} (map (fn [[id changes]] [id (updated-tag (stored id) changes)])) requested))))

(mu/defn update-transform-tags! :- :nil
  "Apply the changes in each of `rows`, the id of a TransformTag and the columns to change, in one transaction, in
  batches with one statement per distinct change set, publishing one update event for all. A built-in tag that
  changes becomes a custom one that keeps its name. A new name another tag holds is refused by the unique index of the
  name; an import makes each such name unique instead."
  ([rows :- [:sequential ::transforms.schema/transform-tag.update]]
   (update-transform-tags! rows nil))
  ([rows :- [:sequential ::transforms.schema/transform-tag.update]
    opts :- ::transforms.schema/write-opts]
   (t2/with-transaction [_conn]
     (let [stored    (u/index-by :id (when (seq rows) (transforms.db/tags-by-ids (mapv :id rows))))
           requested (requested-changes rows stored opts)]
       (doseq [batch (partition-all mdb/update-partition-size requested)]
         (transforms.db/update-tags! (mapv (fn [[id changes]] (assoc changes :id id)) batch)))
       (when (seq requested)
         (events/publish-event! :event/transform-tag-update (update-event stored (into {} requested) opts)))))
   nil))

(mu/defn delete-transform-tags! :- :nil
  "Delete the TransformTags with `tag-ids`, which removes them from their Transforms and TransformJobs, in batches in
  one transaction, publishing one delete event for all right before the first statement."
  [tag-ids :- [:sequential ::lib.schema.id/transform-tag]]
  (t2/with-transaction [_conn]
    (let [batches (mapv vec (partition-all mdb/delete-partition-size tag-ids))]
      (when (seq batches)
        (events/publish-event! :event/transform-tag-delete
                               (events/delete-event (into [] (mapcat transforms.db/tags-by-ids) batches))))
      (run! transforms.db/delete-tags! batches)))
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
