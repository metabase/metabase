(ns metabase.api.timeline
  "/api/timeline endpoints."
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models.collection :as collection]
            [metabase.models.timeline :as timeline :refer [Timeline]]
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
  [:as {{:keys [name default description icon collection_id archived], :as body} :body}]
  {name          su/NonBlankString
   default       (s/maybe s/Bool)
   description   (s/maybe s/Str)
   icon          (s/maybe timeline/Icons)
   collection_id (s/maybe su/IntGreaterThanZero)
   archived      (s/maybe s/Bool)}
  (collection/check-write-perms-for-collection collection_id)
  (let [tl (merge
            body
            {:creator_id api/*current-user-id*}
            (when-not icon
              {:icon timeline/DefaultIcon}))]
    (db/insert! Timeline tl)))

(api/defendpoint GET "/"
  "Fetch a list of [[Timelines]]. Can include `archived=true` to return archived timelines."
  [include archived]
  {include  (s/maybe Include)
   archived (s/maybe su/BooleanString)}
  (let [archived? (Boolean/parseBoolean archived)
        timelines (->> (db/select Timeline
                         {:where    [:and
                                     [:= :archived archived?]
                                     (collection/visible-collection-ids->honeysql-filter-clause
                                      (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))]
                          :order-by [[:%lower.name :asc]]})
                       (map timeline/hydrate-root-collection))]
    (cond->> (hydrate timelines :creator [:collection :can_write])
      (= include "events")
      (map #(timeline-event/include-events-singular % {:events/all? archived?})))))

(api/defendpoint GET "/:id"
  "Fetch the [[Timeline]] with `id`. Include `include=events` to unarchived events included on the timeline. Add
  `archived=true` to return all events on the timeline, both archived and unarchived."
  [id include archived start end]
  {include  (s/maybe Include)
   archived (s/maybe su/BooleanString)
   start    (s/maybe su/TemporalString)
   end      (s/maybe su/TemporalString)}
  (let [archived? (Boolean/parseBoolean archived)
        timeline  (api/read-check (Timeline id))]
    (cond-> (hydrate timeline :creator [:collection :can_write])
      ;; `collection_id` `nil` means we need to assoc 'root' collection
      ;; because hydrate `:collection` needs a proper `:id` to work.
      (nil? (:collection_id timeline))
      timeline/hydrate-root-collection

      (= include "events")
      (timeline-event/include-events-singular {:events/all?  archived?
                                               :events/start (when start (u.date/parse start))
                                               :events/end   (when end (u.date/parse end))}))))

(api/defendpoint PUT "/:id"
  "Update the [[Timeline]] with `id`. Returns the timeline without events. Archiving a timeline will archive all of the
  events in that timeline."
  [id :as {{:keys [name default description icon collection_id archived] :as timeline-updates} :body}]
  {name          (s/maybe su/NonBlankString)
   default       (s/maybe s/Bool)
   description   (s/maybe s/Str)
   icon          (s/maybe timeline/Icons)
   collection_id (s/maybe su/IntGreaterThanZero)
   archived      (s/maybe s/Bool)}
  (let [existing (api/write-check Timeline id)
        current-archived (:archived (db/select-one Timeline :id id))]
    (collection/check-allowed-to-change-collection existing timeline-updates)
    (db/update! Timeline id
      (u/select-keys-when timeline-updates
        :present #{:description :icon :collection_id :default :archived}
        :non-nil #{:name}))
    (when (and (some? archived) (not= current-archived archived))
      (db/update-where! TimelineEvent {:timeline_id id} :archived archived))
    (hydrate (Timeline id) :creator [:collection :can_write])))

(api/defendpoint DELETE "/:id"
  "Delete a [[Timeline]]. Will cascade delete its events as well."
  [id]
  (api/write-check Timeline id)
  (db/delete! Timeline :id id)
  api/generic-204-no-content)

(api/define-routes)
