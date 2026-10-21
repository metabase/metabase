(ns metabase.timeline.api.timeline-event
  "/api/timeline-event endpoints."
  (:require
   [metabase.analytics.core :as analytics]
   [metabase.api.common :as api]
   [metabase.api.macros :as api.macros]
   [metabase.events.core :as events]
   [metabase.timeline.db :as timeline.db]
   [metabase.timeline.models.timeline-event :as timeline-event]
   [metabase.timeline.parse :as timeline.parse]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [parsed-types.core :as pt])
  (:import
   (metabase.timeline.parse TimelineEventUpdate)))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :post "/"
  "Create a new [[TimelineEvent]]."
  [_route-params
   _query-params
   {:keys [timestamp time_matters icon timeline_id source question_id] :as body}
   :- [:map {:closed true}
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
  (let [timeline (timeline.db/timeline timeline_id)]
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
                            {:icon (timeline.db/timeline-icon timeline_id)}))]
      (analytics/track-event! :snowplow/timeline
                              (cond-> {:event         :new-event-created
                                       :time_matters  time_matters
                                       :collection_id (:collection_id timeline)}
                                (boolean source)      (assoc :source source)
                                (boolean question_id) (assoc :question_id question_id)))
      (u/prog1 (timeline.db/insert-timeline-event! tl-event)
        (events/publish-event! :event/timeline-create {:object (timeline.db/timeline (:timeline_id <>)) :user-id api/*current-user-id*})))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :get "/:id"
  "Fetch the [[TimelineEvent]] with `id`."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/read-check :model/TimelineEvent id))

(def ^:private check->status
  "The HTTP status for each check of `TimelineEventUpdate`. The 404/403 split keeps this endpoint's API from before it
  parsed: 404 for a row that does not exist, 403 for one the user may not write."
  {::timeline.parse/changes-match-schema   400
   ::timeline.parse/event-exists           404
   ::timeline.parse/new-timeline-exists    404
   ::timeline.parse/may-write-event        403
   ::timeline.parse/may-write-new-timeline 403})

(defn- throw-write-permission-failure!
  "Publish a write permission failure on `object` for the current user, as `api/write-check` does, then throw a 403
  caused by `e`."
  [object e]
  (events/publish-event! :event/write-permission-failure {:user-id api/*current-user-id*
                                                          :object  object})
  (api/throw-403 e))

(defn- parse-event-update
  "Parse the update of the TimelineEvent `event-id`, moving it to `new-timeline-id` when that is not nil. A check that
  fails throws the status [[check->status]] gives it; a check that throws rethrows its own exception."
  [event-id new-timeline-id changes]
  (try
    (pt/parse TimelineEventUpdate {:event-id        event-id
                                   :new-timeline-id new-timeline-id
                                   :changes         changes})
    (catch clojure.lang.ExceptionInfo e
      (let [{:keys [type check threw]} (ex-data e)]
        (cond
          (not= ::pt/invalid type) (throw e)
          threw                    (throw threw)
          :else
          (case (check->status check)
            400 (throw (ex-info (tru "Invalid Request.") {:status-code 400} e))
            404 (throw (ex-info (tru "Not found.") {:status-code 404} e))
            403 (throw-write-permission-failure! (if (= ::timeline.parse/may-write-event check)
                                                   (timeline.db/timeline-event event-id)
                                                   (timeline.db/timeline new-timeline-id))
                                                 e)
            (throw e)))))))

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
                                      [:name         {:optional true} [:maybe ms/NonBlankString]]
                                      [:description  {:optional true} [:maybe :string]]
                                      [:timestamp    {:optional true} [:maybe ms/TemporalString]]
                                      [:time_matters {:optional true} [:maybe :boolean]]
                                      [:timezone     {:optional true} [:maybe :string]]
                                      [:icon         {:optional true} [:maybe timeline-event/Icon]]
                                      [:timeline_id  {:optional true} [:maybe ms/PositiveInt]]
                                      [:archived     {:optional true} [:maybe :boolean]]]]
  (let [timeline-event-updates (cond-> timeline-event-updates
                                 (boolean timestamp) (update :timestamp u.date/parse))]
    ;; todo: if we accept a new timestamp, must we require a timezone? gut says yes?
    (timeline.db/update-timeline-event!
     (parse-event-update id
                         (:timeline_id timeline-event-updates)
                         (u/select-keys-when timeline-event-updates
                                             :present #{:description :timestamp :time_matters :timezone :icon
                                                        :archived}
                                             :non-nil #{:name})))
    (u/prog1 (timeline.db/timeline-event id)
      (events/publish-event! :event/timeline-update {:object (timeline.db/timeline (:timeline_id <>)) :user-id api/*current-user-id*}))))

;; TODO (Cam 2025-11-25) please add a response schema to this API endpoint, it makes it easier for our customers to
;; use our API + we will need it when we make auto-TypeScript-signature generation happen
;;
#_{:clj-kondo/ignore [:metabase/validate-defendpoint-has-response-schema]}
(api.macros/defendpoint :delete "/:id"
  "Delete a [[TimelineEvent]]."
  [{:keys [id]} :- [:map {:closed true}
                    [:id ms/PositiveInt]]]
  (api/write-check :model/TimelineEvent id)
  (let [timeline-event (api/write-check :model/TimelineEvent id)]
    (timeline.db/delete-timeline-event! id)
    (events/publish-event! :event/timeline-delete {:object (timeline.db/timeline (:timeline_id timeline-event)) :user-id api/*current-user-id*}))
  api/generic-204-no-content)
