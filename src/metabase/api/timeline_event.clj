(ns metabase.api.timeline-event
  "/api/timeline_event endpoints."
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models.collection :as collection]
            [metabase.models.timeline :refer [Timeline]]
            [metabase.models.timeline-event :refer [TimelineEvent]]
            [metabase.util :as u]
            [metabase.util.date-2 :as u.date]
            [metabase.util.i18n :refer [tru]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]))

(api/defendpoint POST "/"
  "Create a new [[TimelineEvent]]."
  [:as {{:keys [name description timestamp time_matters timezone icon timeline_id archived] :as body} :body}]
  {name         su/NonBlankString
   description  (s/maybe s/Str)
   ;; todo: find schema for timestamps?
   timestamp    s/Str
   time_matters (s/maybe s/Bool)
   timezone     s/Str
   icon         (s/maybe s/Str)
   timeline_id  su/IntGreaterThanZero
   archived     (s/maybe s/Bool)}
  ;; deliberately not using api/check-404 so we can have a useful error message.
  (let [timeline (Timeline timeline_id)]
    (when-not timeline
      (throw (ex-info (tru "Timeline with id {0} not found" timeline_id)
                      {:status-code 404})))
    (collection/check-write-perms-for-collection (:collection_id timeline)))
  ;; todo: revision system
  (let [parsed (if (nil? timestamp)
                 (throw (ex-info (tru "Timestamp cannot be null") {:status-code 400}))
                 (u.date/parse timestamp))]
    (db/insert! TimelineEvent (assoc body
                                     :creator_id api/*current-user-id*
                                     :timestamp parsed))))

(api/defendpoint GET "/:id"
  "Fetch the [[TimelineEvent]] with `id`."
  [id]
  (api/read-check TimelineEvent id))

(api/defendpoint PUT "/:id"
  "Update a [[TimelineEvent]]."
  [id :as {{:keys [name description timestamp time_matters timezone icon timeline_id archived]
            :as   timeline-event-updates} :body}]
  {name         (s/maybe su/NonBlankString)
   description  (s/maybe s/Str)
   ;; todo: find schema for timestamps?
   timestamp    (s/maybe s/Str)
   time_matters (s/maybe s/Bool)
   timezone     (s/maybe s/Str)
   icon         (s/maybe s/Str)
   timeline_id  (s/maybe su/IntGreaterThanZero)
   archived     (s/maybe s/Bool)}
  (let [existing (api/write-check TimelineEvent id)]
    (collection/check-allowed-to-change-collection existing timeline-event-updates)
    ;; todo: if we accept a new timestamp, must we require a timezone? gut says yes?
    (db/update! TimelineEvent id
      (u/select-keys-when timeline-event-updates
        ;; todo: are there more keys needed in non-nil? timestamp?
        :present #{:description :timestamp :time_matters :timezone :icon :timeline_id :archived}
        :non-nil #{:name}))
    (TimelineEvent id)))

;; todo: icons
;; collection_id via timeline_id -> slow, how to do this?

(api/define-routes)
