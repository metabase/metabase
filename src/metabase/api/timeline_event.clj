(ns metabase.api.timeline-event
  "/api/timeline-event endpoints."
  (:require
   [compojure.core :refer [DELETE GET POST PUT]]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.api.common :as api]
   [metabase.models.collection :as collection]
   [metabase.models.timeline :as timeline :refer [Timeline]]
   [metabase.models.timeline-event
    :as timeline-event
    :refer [TimelineEvent]]
   [metabase.util :as u]
   [metabase.util.date-2 :as u.date]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(api/defendpoint POST "/"
  "Create a new [[TimelineEvent]]."
  [:as {{:keys [name description timestamp time_matters timezone icon timeline_id source question_id archived] :as body} :body}]
  {name         ms/NonBlankString
   description  [:maybe :string]
   timestamp    ms/TemporalString
   time_matters [:maybe :boolean]
   timezone     :string
   icon         [:maybe timeline-event/Icon]
   timeline_id  ms/PositiveInt
   source       [:maybe timeline-event/Source]
   question_id  [:maybe ms/PositiveInt]
   archived     [:maybe :boolean]}
  ;; deliberately not using api/check-404 so we can have a useful error message.
  (let [timeline (t2/select-one Timeline :id timeline_id)]
    (when-not timeline
      (throw (ex-info (tru "Timeline with id {0} not found" timeline_id)
                      {:status-code 404})))
    (collection/check-write-perms-for-collection (:collection_id timeline))
    ;; todo: revision system
    (let [parsed   (if (nil? timestamp)
                     (throw (ex-info (tru "Timestamp cannot be null") {:status-code 400}))
                     (u.date/parse timestamp))
          tl-event (merge (dissoc body :source :question_id)
                          {:creator_id api/*current-user-id*
                           :timestamp  parsed}
                          (when-not icon
                            {:icon (t2/select-one-fn :icon Timeline :id timeline_id)}))]
      (snowplow/track-event! ::snowplow/new-event-created
                             api/*current-user-id*
                             (cond-> {:time_matters time_matters
                                      :collection_id (:collection_id timeline)}
                               (boolean source)      (assoc :source source)
                               (boolean question_id) (assoc :question_id question_id)))
      (first (t2/insert-returning-instances! TimelineEvent tl-event)))))

(api/defendpoint GET "/:id"
  "Fetch the [[TimelineEvent]] with `id`."
  [id]
  {id ms/PositiveInt}
  (api/read-check TimelineEvent id))

(api/defendpoint PUT "/:id"
  "Update a [[TimelineEvent]]."
  [id :as {{:keys [name description timestamp time_matters timezone icon timeline_id archived]
            :as   timeline-event-updates} :body}]
  {id           ms/PositiveInt
   name         [:maybe ms/NonBlankString]
   description  [:maybe :string]
   timestamp    [:maybe ms/TemporalString]
   time_matters [:maybe :boolean]
   timezone     [:maybe :string]
   icon         [:maybe timeline-event/Icon]
   timeline_id  [:maybe ms/PositiveInt]
   archived     [:maybe :boolean]}
  (let [existing (api/write-check TimelineEvent id)
        timeline-event-updates (cond-> timeline-event-updates
                                 (boolean timestamp) (update :timestamp u.date/parse))]
    (collection/check-allowed-to-change-collection existing timeline-event-updates)
    ;; todo: if we accept a new timestamp, must we require a timezone? gut says yes?
    (t2/update! TimelineEvent id
                (u/select-keys-when timeline-event-updates
                                    :present #{:description :timestamp :time_matters :timezone :icon :timeline_id :archived}
                                    :non-nil #{:name}))
    (t2/select-one TimelineEvent :id id)))

(api/defendpoint DELETE "/:id"
  "Delete a [[TimelineEvent]]."
  [id]
  {id ms/PositiveInt}
  (api/write-check TimelineEvent id)
  (t2/delete! TimelineEvent :id id)
  api/generic-204-no-content)

(api/define-routes)
