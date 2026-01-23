(ns metabase.timeline.api.timeline-event
  "/api/timeline-event endpoints."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.collections.models.collection :as collection]
   [metabase.events.core :as events]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new [[TimelineEvent]]."
  [_route-params
   _query-params
   {:keys [timestamp time_matters icon timeline_id source question_id] :as body}
   :- [:map
       [:name         ms/NonBlankString]
       [:description  {:optional true} [:maybe :string]]
       [:timestamp    ms/TemporalString]
       [:time_matters {:optional true} [:maybe :boolean]]
       [:timezone     :string]
       [:icon         {:optional true} [:maybe timeline-event/Icon]]
       [:timeline_id  ms/PositiveInt]
       [:source       {:optional true} [:maybe timeline-event/Source]]
       [:question_id  {:optional true} [:maybe ms/PositiveInt]]
       [:archived     {:optional true} [:maybe :boolean]]]]
  ;; deliberately not using api/check-404 so we can have a useful error message.
  (let [timeline (t2/select-one :model/Timeline :id timeline_id)]
    (when-not timeline
      (throw (ex-info (tru "Timeline with id {0} not found" timeline_id)
                      {:status-code 404})))
    (api/create-check :model/TimelineEvent {:timeline timeline})
    ;; todo: revision system
    (let [parsed   (if (nil? timestamp)
                     (throw (ex-info (tru "Timestamp cannot be null") {:status-code 400}))
                     (u.date/parse timestamp))
          tl-event (merge (dissoc body :source :question_id)
                          {:creator_id api/*current-user-id*
                           :timestamp  parsed}
                          (when-not icon
                            {:icon (t2/select-one-fn :icon :model/Timeline :id timeline_id)}))]
      (analytics/track-event! :snowplow/timeline
                              (cond-> {:event         :new-event-created
                                       :time_matters  time_matters
                                       :collection_id (:collection_id timeline)}
                                (boolean source)      (assoc :source source)
                                (boolean question_id) (assoc :question_id question_id)))
      (u/prog1 (first (t2/insert-returning-instances! :model/TimelineEvent tl-event))
        (events/publish-event! :event/timeline-create {:object <> :user-id api/*current-user-id*})))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch the [[TimelineEvent]] with `id`."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/read-check :model/TimelineEvent id))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a [[TimelineEvent]]."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [timestamp]
    :as   timeline-event-updates} :- [:map
                                      [:name         {:optional true} [:maybe ms/NonBlankString]]
                                      [:description  {:optional true} [:maybe :string]]
                                      [:timestamp    {:optional true} [:maybe ms/TemporalString]]
                                      [:time_matters {:optional true} [:maybe :boolean]]
                                      [:timezone     {:optional true} [:maybe :string]]
                                      [:icon         {:optional true} [:maybe timeline-event/Icon]]
                                      [:timeline_id  {:optional true} [:maybe ms/PositiveInt]]
                                      [:archived     {:optional true} [:maybe :boolean]]]]
  (let [existing (api/write-check :model/TimelineEvent id)
        timeline-event-updates (cond-> timeline-event-updates
                                 (boolean timestamp) (update :timestamp u.date/parse))]
    (collection/check-allowed-to-change-collection existing timeline-event-updates)
    ;; todo: if we accept a new timestamp, must we require a timezone? gut says yes?
    (t2/update! :model/TimelineEvent id
                (u/select-keys-when timeline-event-updates
                                    :present #{:description :timestamp :time_matters :timezone :icon :timeline_id :archived}
                                    :non-nil #{:name}))
    (u/prog1 (t2/select-one :model/TimelineEvent :id id)
      (events/publish-event! :event/timeline-update {:object (t2/select-one :model/Timeline :id (:timeline_id <>)) :user-id api/*current-user-id*}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a [[TimelineEvent]]."
  [{:keys [id]} :- [:map
                    [:id ms/PositiveInt]]]
  (api/write-check :model/TimelineEvent id)
  (let [timeline-event (api/write-check :model/TimelineEvent id)]
    (t2/delete! :model/TimelineEvent :id id)
    (events/publish-event! :event/timeline-delete {:object (t2/select-one :model/Timeline :id (:timeline_id timeline-event)) :user-id api/*current-user-id*}))
  api/generic-204-no-content)
