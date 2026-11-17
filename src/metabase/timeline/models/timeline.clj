(ns metabase.timeline.models.timeline
  (:require
   [clojure.string :as str]
   [metabase.api.common :as api]
   [metabase.collections.models.collection :as collection]
   [metabase.collections.models.collection.root :as collection.root]
   [metabase.models.interface :as mi]
   [metabase.remote-sync.core :as remote-sync]
   [metabase.serialization.core :as serialization]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util :as u]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.registry :as mr]
   [methodical.core :as methodical]
   [toucan2.core :as t2]))

;;; ---------------------------------------------------- Setup -----------------------------------------------------

(methodical/defmethod t2/table-name :model/Timeline  [_model] :timeline)

(doto :model/Timeline
  (derive :metabase/model)
  (derive :hook/timestamped?)
  (derive :hook/entity-id))

(t2/define-after-select :model/Timeline
  [timeline]
  ;; We used to have a "balloons" icon but we removed it.
  ;; Use the default icon instead. (metabase#34586, metabase#35129)
  (update timeline :icon (fn [icon]
                           (if (= icon "balloons") timeline-event/default-icon icon))))

;;; ----------------------------------------------------- Hooks ------------------------------------------------------

(defn- check-collection
  "Throws unless the Collection with `collection-id`, if any, can hold a Timeline."
  [collection-id]
  (when collection-id
    (collection/check-allowed-content :model/Timeline collection-id)
    (collection/check-collection-namespace :model/Timeline collection-id)))

(defn- check-columns
  "Throws unless the `:name` and `:icon` among `columns`, the columns a Timeline is written with, are valid."
  [columns]
  (when (and (contains? columns :name) (str/blank? (:name columns)))
    (throw (ex-info (tru "A Timeline must have a name.") {:status-code 400})))
  (when (and (contains? columns :icon) (not (mr/validate timeline-event/Icon (:icon columns))))
    (throw (ex-info (tru "Invalid Timeline icon.") {:status-code 400}))))

(defn- cascade-archived
  "Writes the archive or restore `timeline`, an update with `changes`, takes to its events, which follow it."
  [timeline changes]
  (when (contains? changes :archived)
    (timeline.db/set-timeline-events-archived! (:id timeline) (boolean (:archived timeline)))))

(t2/define-before-insert :model/Timeline
  [row]
  (check-collection (:collection_id row))
  (collection/check-collection-not-archived (:archived row) (:collection_id row))
  (let [row (cond-> row (nil? (:icon row)) (assoc :icon timeline-event/default-icon))]
    (check-columns (assoc row :name (:name row)))
    row))

(t2/define-before-update :model/Timeline
  [row]
  (let [changes (t2/changes row)]
    (check-collection (:collection_id changes))
    (when (contains? changes :collection_id)
      (collection/check-collection-not-archived (:archived row) (:collection_id row)))
    (check-columns changes)
    (u/prog1 (cond-> row
               (contains? changes :archived) (assoc :archived_directly (mi/archived-directly row)))
      (cascade-archived <> changes))))

(mi/define-update-in-transaction :model/Timeline)

;;; -------------------------------------------------- Permissions ---------------------------------------------------

(defn- check-can-read-keys
  "Throws unless `timeline` has the columns its `:can_read` and `:can_write` hydrations read."
  [timeline]
  (api/check-500 (contains? timeline :collection_id) "No :collection_id is set for a Timeline."))

(methodical/defmethod t2/batched-hydrate [:model/Timeline :can_read]
  "Whether the current user reads each of `timelines`, as the content of its Collection."
  [_model _k timelines]
  (run! #(when % (check-can-read-keys %)) timelines)
  (let [readable (collection/content-readable-collection-ids (map :collection_id (remove nil? timelines))
                                                             {:root-namespace nil, :audit-rules? false})]
    (for [timeline timelines]
      (when timeline
        (vary-meta timeline assoc :can_read (contains? readable (:collection_id timeline)))))))

(methodical/defmethod t2/batched-hydrate [:model/Timeline :can_write]
  "Whether the current user writes each of `timelines`, as the content of its Collection."
  [_model _k timelines]
  (run! #(when % (check-can-read-keys %)) timelines)
  (let [writable (collection/content-writable-collection-ids (map :collection_id (remove nil? timelines))
                                                             {:root-namespace nil, :audit-rules? false})]
    (for [timeline timelines]
      (when timeline
        (assoc timeline :can_write (contains? writable (:collection_id timeline)))))))

(defn- collection-writable?
  "Whether the current user can write the Collection with `collection-id`, nil for the root Collection."
  [collection-id]
  (collection/can-write-collection-or-root? collection-id {:root-namespace nil}))

(defmethod mi/can-create? :model/Timeline
  [_model {collection-id :collection_id}]
  (collection-writable? collection-id))

(defmethod mi/can-update? :model/Timeline
  [timeline changes]
  (and (mi/can-write? timeline)
       (or (not (api/column-will-change? (:collection_id timeline) (get changes :collection_id ::api/not-provided)))
           (and (collection-writable? (:collection_id timeline))
                (collection-writable? (:collection_id changes))))))

;;; --------------------------------------------------- Hydration ----------------------------------------------------

(defn timelines-for-collection
  "Load timelines based on `collection-id` passed in (nil means the root collection). Hydrates the events on each
  timeline at `:events` on the timeline."
  [collection-id {:keys [timeline/events? timeline/archived?] :as options}]
  (cond-> (t2/hydrate (timeline.db/timelines-for-collection collection-id (boolean archived?)) :creator [:collection :can_write])
    (nil? collection-id) (->> (map collection.root/hydrate-root-collection))
    events? (timeline-event/include-events options)))

;;; ------------------------------------------------- Serialization --------------------------------------------------

(defmethod serialization/spec :model/Timeline [_]
  {:schema    ::timeline.schema/external-timeline
   :copy      [:archived :archived_directly :default :description :entity_id :icon :name]
   :transform {:collection_id (serialization/fk-transform :model/Collection)
               :creator_id    serialization/user-transform}
   :children  {:events :model/TimelineEvent}
   :defaults  {:archived false :archived_directly false :default false}})

(defmethod serialization/import-dependencies :model/Timeline [_ entities]
  (mapv (fn [{:keys [collection_id]}]
          (when collection_id
            [[:model/Collection collection_id]]))
        entities))

(defmethod serialization/export-dependencies :model/Timeline [_ timelines]
  (mapv (fn [{:keys [collection_id]}]
          (when collection_id
            #{[:model/Collection collection_id]}))
        timelines))

;;; ------------------------------------------------- Remote sync ----------------------------------------------------

(defmethod remote-sync/spec :model/Timeline
  [_model]
  {:synced-items         timeline.db/synced-timeline-items
   :synced-filter-clause timeline.db/synced-timelines-clause})
