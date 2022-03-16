(ns metabase.api.timeline
  "/api/timeline endpoints."
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models.collection :as collection :refer [Collection]]
            [metabase.models.interface :as mi]
            [metabase.models.timeline :refer [Timeline]]
            [metabase.models.timeline-event :as timeline-event :refer [TimelineEvent]]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [toucan.hydrate :refer [hydrate]]))

(def Include
  "Events Query Parameters Schema"
  (s/enum "events"))

(api/defendpoint POST "/"
  "Create a new [[Timeline]]."
  [:as {{:keys [name description icon collection_id archived], :as body} :body}]
  {name          su/NonBlankString
   description   (s/maybe s/Str)
   icon          (s/maybe timeline-event/Icons)
   collection_id (s/maybe su/IntGreaterThanZero)
   archived      (s/maybe s/Bool)}
  (collection/check-write-perms-for-collection collection_id)
  (db/insert! Timeline (assoc body :creator_id api/*current-user-id*)))

(api/defendpoint GET "/"
  "Fetch a list of [[Timelines]]. Use `include=events` to include unarchived events on the timelines. Can include `archived=true` to return archived timelines, including both archived and un-archived events when they are included."
  [include archived]
  {include  (s/maybe Include)
   archived (s/maybe su/BooleanString)}
  (let [archived? (Boolean/parseBoolean archived)
        timelines (db/select Timeline [:where [:= :archived archived?]])]
    (cond->> (hydrate timelines :creator)
      true (map #(assoc % :can_write (mi/can-write? Collection (:collection_id %))))
      (= include "events")
      (map #(timeline-event/include-events-singular % {:events/all? archived?})))))

(api/defendpoint GET "/:id"
  "Fetch the [[Timeline]] with `id`. Use `include=events` to include unarchived events on the timeline. Add
  `archived=true` to return all events on the timeline, both archived and unarchived."
  [id include archived start end]
  {include  (s/maybe Include)
   archived (s/maybe su/BooleanString)
   start    (s/maybe su/TemporalString)
   end      (s/maybe su/TemporalString)}
  (let [archived? (Boolean/parseBoolean archived)
        timeline  (api/read-check (Timeline id))]
    (cond-> (hydrate timeline :creator)
      true (assoc :can_write (mi/can-write? Collection (:collection_id timeline)))
      (= include "events")
      (timeline-event/include-events-singular {:events/all?  archived?
                                               :events/start (when start (u.date/parse start))
                                               :events/end   (when end (u.date/parse end))}))))

(api/defendpoint PUT "/:id"
  "Update the [[Timeline]] with `id`. Returns the timeline without events. Archiving a timeline will archive all of the
  events in that timeline."
  [id :as {{:keys [name description icon collection_id archived] :as timeline-updates} :body}]
  {name          (s/maybe su/NonBlankString)
   description   (s/maybe s/Str)
   icon          (s/maybe timeline-event/Icons)
   collection_id (s/maybe su/IntGreaterThanZero)
   archived      (s/maybe s/Bool)}
  (let [existing (api/write-check Timeline id)
        current-archived (:archived (db/select-one Timeline :id id))]
    (collection/check-allowed-to-change-collection existing timeline-updates)
    (db/update! Timeline id
      (u/select-keys-when timeline-updates
        :present #{:description :icon :collection_id :archived}
        :non-nil #{:name}))
    (when (and (some? archived) (not= current-archived archived))
      (db/update-where! TimelineEvent {:timeline_id id} :archived archived))
    (hydrate (Timeline id) :creator)))

(api/defendpoint DELETE "/:id"
  "Delete a [[Timeline]]. Will cascade delete its events as well."
  [id]
  (api/write-check Timeline id)
  (db/delete! Timeline :id id)
  api/generic-204-no-content)

(api/define-routes)
