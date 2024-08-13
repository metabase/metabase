(ns metabase.api.timeline
  "/api/timeline endpoints."
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.api.common :as api]
   [metabase.models.collection :as collection]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.timeline :as timeline :refer [Timeline]]
   [metabase.models.timeline-event
    :as timeline-event
    :refer [TimelineEvent]]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def Include
  "Events Query Parameters Schema"
  [:enum "events"])

(api/defendpoint POST "/"
  "Create a new [[Timeline]]."
  [:as {{:keys [name default description icon collection_id archived], :as body} :body}]
  {name          ms/NonBlankString
   default       [:maybe :boolean]
   description   [:maybe :string]
   icon          [:maybe timeline-event/Icon]
   collection_id [:maybe ms/PositiveInt]
   archived      [:maybe :boolean]}
  (collection/check-write-perms-for-collection collection_id)
  (let [tl (merge
            body
            {:creator_id api/*current-user-id*}
            (when-not icon
              {:icon timeline-event/default-icon}))]
    (first (t2/insert-returning-instances! Timeline tl))))

(api/defendpoint GET "/"
  "Fetch a list of [[Timelines]]. Can include `archived=true` to return archived timelines."
  [include archived]
  {include  [:maybe Include]
   archived [:maybe ms/BooleanValue]}
  (let [archived? archived
        timelines (->> (t2/select Timeline
                         {:where    [:and
                                     [:= :archived archived?]
                                     (collection/visible-collection-ids->honeysql-filter-clause
                                      (collection/permissions-set->visible-collection-ids @api/*current-user-permissions-set*))]
                          :order-by [[:%lower.name :asc]]})
                       (map collection.root/hydrate-root-collection))]
    (cond->> (t2/hydrate timelines :creator [:collection :can_write])
      (= include "events")
      (map #(timeline-event/include-events-singular % {:events/all? archived?})))))

(api/defendpoint GET "/:id"
  "Fetch the [[Timeline]] with `id`. Include `include=events` to unarchived events included on the timeline. Add
  `archived=true` to return all events on the timeline, both archived and unarchived."
  [id include archived start end]
  {id       ms/PositiveInt
   include  [:maybe Include]
   archived [:maybe ms/BooleanValue]
   start    [:maybe ms/TemporalString]
   end      [:maybe ms/TemporalString]}
  (let [archived? archived
        timeline  (api/read-check (t2/select-one Timeline :id id))]
    (cond-> (t2/hydrate timeline :creator [:collection :can_write])
      ;; `collection_id` `nil` means we need to assoc 'root' collection
      ;; because hydrate `:collection` needs a proper `:id` to work.
      (nil? (:collection_id timeline))
      collection.root/hydrate-root-collection

      (= include "events")
      (timeline-event/include-events-singular {:events/all?  archived?
                                               :events/start (when start (u.date/parse start))
                                               :events/end   (when end (u.date/parse end))}))))

(api/defendpoint PUT "/:id"
  "Update the [[Timeline]] with `id`. Returns the timeline without events. Archiving a timeline will archive all of the
  events in that timeline."
  [id :as {{:keys [name default description icon collection_id archived] :as timeline-updates} :body}]
  {id            ms/PositiveInt
   name          [:maybe ms/NonBlankString]
   default       [:maybe :boolean]
   description   [:maybe :string]
   icon          [:maybe timeline-event/Icon]
   collection_id [:maybe ms/PositiveInt]
   archived      [:maybe :boolean]}
  (let [existing (api/write-check Timeline id)
        current-archived (:archived (t2/select-one Timeline :id id))]
    (collection/check-allowed-to-change-collection existing timeline-updates)
    (t2/update! Timeline id
      (u/select-keys-when timeline-updates
        :present #{:description :icon :collection_id :default :archived}
        :non-nil #{:name}))
    (when (and (some? archived) (not= current-archived archived))
      (t2/update! TimelineEvent {:timeline_id id} {:archived archived}))
    (t2/hydrate (t2/select-one Timeline :id id) :creator [:collection :can_write])))

(api/defendpoint DELETE "/:id"
  "Delete a [[Timeline]]. Will cascade delete its events as well."
  [id]
  {id ms/PositiveInt}
  (api/write-check Timeline id)
  (t2/delete! Timeline :id id)
  api/generic-204-no-content)

(api/define-routes)
