(ns metabase.api.timeline
  "/api/timeline endpoints."
  (:require
   [compojure.core :refer [DELETE PUT]]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.models.collection :as collection]
   [metabase.models.collection.root :as collection.root]
   [metabase.models.timeline-event :as timeline-event]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.malli.registry :as mr]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(mr/def ::include
  [:enum :events])

(mr/def ::Timeline
  [:map
   [:id pos-int?]])

(api.macros/defendpoint :post "/" :- ::Timeline
  "Create a new [[Timeline]]."
  [_route-params
   _query-params
   {:keys [icon], collection-id :collection_id, :as body} :- [:map
                                                              [:name          ms/NonBlankString]
                                                              [:default       {:optional true} [:maybe :boolean]]
                                                              [:description   {:optional true} [:maybe :string]]
                                                              [:icon          {:optional true} [:maybe timeline-event/Icon]]
                                                              [:collection_id {:optional true} [:maybe ms/PositiveInt]]
                                                              [:archived      {:optional true} [:maybe :boolean]]]]
  (collection/check-write-perms-for-collection collection-id)
  (let [tl (merge
            body
            {:creator_id api/*current-user-id*}
            (when-not icon
              {:icon timeline-event/default-icon}))]
    (first (t2/insert-returning-instances! :model/Timeline tl))))

(api.macros/defendpoint :get "/" :- [:sequential ::Timeline]
  "Fetch a list of `Timeline`s. Can include `archived=true` to return archived timelines."
  [_route-params
   {:keys [include], archived? :archived} :- [:map
                                              [:include  {:optional true} ::include]
                                              [:archived {:default false} ms/BooleanValue]]]
  (let [timelines (->> (t2/select :model/Timeline
                                  {:where    [:and
                                              [:= :archived archived?]
                                              (collection/visible-collection-filter-clause)]
                                   :order-by [[:%lower.name :asc]]})
                       (map collection.root/hydrate-root-collection))]
    (cond->> (t2/hydrate timelines :creator [:collection :can_write])
      (= include :events)
      (map #(timeline-event/include-events-singular % {:events/all? archived?})))))

(api.macros/defendpoint :get "/:id" :- ::Timeline
  "Fetch the `Timeline` with `id`. Include `include=events` to unarchived events included on the timeline. Add
  `archived=true` to return all events on the timeline, both archived and unarchived."
  [{:keys [id]}                         :- [:map
                                            [:id ms/PositiveInt]]
   {:keys [include archived start end]} :- [:map
                                            [:include  {:optional true}  ::include]
                                            [:archived {:default :false} ms/BooleanValue]
                                            [:start    {:optional true}  ms/TemporalString]
                                            [:end      {:optional true}  ms/TemporalString]]]
  (let [archived? archived
        timeline  (api/read-check (t2/select-one :model/Timeline :id id))]
    (cond-> (t2/hydrate timeline :creator [:collection :can_write])
      ;; `collection_id` `nil` means we need to assoc 'root' collection
      ;; because hydrate `:collection` needs a proper `:id` to work.
      (nil? (:collection_id timeline))
      collection.root/hydrate-root-collection

      (= include :events)
      (timeline-event/include-events-singular {:events/all?  archived?
                                               :events/start (when start (u.date/parse start))
                                               :events/end   (when end (u.date/parse end))}))))

#_{:clj-kondo/ignore [:deprecated-var]}
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
  (let [existing (api/write-check :model/Timeline id)
        current-archived (:archived (t2/select-one :model/Timeline :id id))]
    (collection/check-allowed-to-change-collection existing timeline-updates)
    (t2/update! :model/Timeline id
                (u/select-keys-when timeline-updates
                                    :present #{:description :icon :collection_id :default :archived}
                                    :non-nil #{:name}))
    (when (and (some? archived) (not= current-archived archived))
      (t2/update! :model/TimelineEvent {:timeline_id id} {:archived archived}))
    (t2/hydrate (t2/select-one :model/Timeline :id id) :creator [:collection :can_write])))

#_{:clj-kondo/ignore [:deprecated-var]}
(api/defendpoint DELETE "/:id"
  "Delete a [[Timeline]]. Will cascade delete its events as well."
  [id]
  {id ms/PositiveInt}
  (api/write-check :model/Timeline id)
  (t2/delete! :model/Timeline :id id)
  api/generic-204-no-content)

(api/define-routes)
