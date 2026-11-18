(ns metabase.timeline.api.timeline-event
  "/api/timeline-event endpoints."
  (:require
   [medley.core :as m]
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.timeline.schema :as timeline.schema]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]))

(events/derive! :event/timeline-create :metabase/event)
(events/derive! :event/timeline-update :metabase/event)
(events/derive! :event/timeline-delete :metabase/event)

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new [[TimelineEvent]]."
  [_route-params
   _query-params
   {:keys [timestamp time_matters timeline_id source question_id] :as body}
   :- [:map {:closed true}
       [:name         ::timeline.schema/name]
       [:description  {:optional true} [:maybe :string]]
       [:timestamp    ms/TemporalString]
       [:time_matters {:optional true} [:maybe ::timeline.schema/time-matters]]
       [:timezone     timeline-event/Timezone]
       [:icon         {:optional true} [:maybe ::timeline.schema/icon]]
       [:timeline_id  ms/PositiveInt]
       [:source       {:optional true} [:maybe timeline-event/Source]]
       [:question_id  {:optional true} [:maybe ms/PositiveInt]]
       [:archived     {:optional true} [:maybe :boolean]]]]
  ;; deliberately not using api/check-404 so we can have a useful error message.
  (let [timeline (timeline.db/timeline timeline_id)]
    (when-not timeline
      (throw (ex-info (tru "Timeline with id {0} not found" timeline_id)
                      {:status-code 404})))
    (api/create-check :model/TimelineEvent {:timeline_id timeline_id})
    ;; todo: revision system
    (let [tl-event (merge (m/remove-vals nil? (dissoc body :source :question_id))
                          {:creator_id api/*current-user-id*
                           :timestamp  (u.date/parse timestamp)})]
      (analytics/track-event! :snowplow/timeline
                              (cond-> {:event         :new-event-created
                                       :time_matters  time_matters
                                       :collection_id (:collection_id timeline)}
                                (boolean source)      (assoc :source source)
                                (boolean question_id) (assoc :question_id question_id)))
      (u/prog1 (timeline.db/insert-timeline-event! tl-event)))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch the [[TimelineEvent]] with `id`."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/read-check :model/TimelineEvent id))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :put "/:id"
  "Update a [[TimelineEvent]]."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]
   _query-params
   {:keys [timestamp]
    :as   timeline-event-updates} :- [:map {:closed true}
                                      [:name         {:optional true} [:maybe ::timeline.schema/name]]
                                      [:description  {:optional true} [:maybe :string]]
                                      [:timestamp    {:optional true} ms/TemporalString]
                                      [:time_matters {:optional true} [:maybe ::timeline.schema/time-matters]]
                                      [:timezone     {:optional true} [:maybe :string]]
                                      [:icon         {:optional true} ::timeline.schema/icon]
                                      [:timeline_id  {:optional true} [:maybe ms/PositiveInt]]
                                      [:archived     {:optional true} [:maybe :boolean]]]]
  (let [existing (api/check-404 (timeline.db/timeline-event id))
        timeline-event-updates (cond-> timeline-event-updates
                                 (boolean timestamp) (update :timestamp u.date/parse))
        changes  (u/select-keys-when timeline-event-updates
                                     :present #{:description :timestamp :timezone :icon :timeline_id :archived}
                                     :non-nil #{:name :time_matters})]
    (when (and (api/column-will-change? (:timezone existing) (get changes :timezone ::api/not-provided))
               (not (some-> (:timezone changes) timeline-event/valid-timezone?)))
      (throw (ex-info (tru "Invalid Timeline event timezone.") {:status-code 400})))
    (api/update-check existing changes)
    ;; todo: if we accept a new timestamp, must we require a timezone? gut says yes?
    (timeline.db/update-timeline-event! id changes)
    (u/prog1 (timeline.db/timeline-event id))))

(api.macros/defendpoint :delete "/:id" :- ::api/generic-204-no-content
  "Delete a [[TimelineEvent]]."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check :model/TimelineEvent id)
  (timeline.db/delete-timeline-event! id)
  api/generic-204-no-content)
