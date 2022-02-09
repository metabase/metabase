(ns metabase.api.timeline-events
  "/api/timeline_events endpoints."
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models.collection :as collection]
            [metabase.models.timeline :refer [Timeline]]
            [metabase.models.timeline-event :refer [TimelineEvent]]
            [metabase.util.schema :as su]
            [schema.core :as s]
            [toucan.db :as db]
            [metabase.util :as u]))

(api/defendpoint POST "/"
  "Create a new [[TimelineEvent]]."
  [:as {{:keys [name description timestamp time_matters timezone icon timeline_id archived] :as body} :body}]
  {name su/NonBlankString
   description (s/maybe s/Str)
   ;; todo: find schema for timestamps?
   timestamp s/Str
   time_matters (s/maybe s/Bool)
   timezone s/Str
   icon (s/maybe s/Str)
   timeline_id su/IntGreaterThanZero
   archived (s/maybe s/Bool)}
  ;; todo, create appropriate fn to check the permissions for editing the timeline
  #_(collection/check-write-perms-for-collection timeline_id)
  (db/insert! TimelineEvent (assoc body :creator_id api/*current-user*)))

(api/defendpoint GET "/:id"
  "Fetch the [[TimelineEvent]] with `id`."
  [id]
  (api/read-check (TimelineEvent id)))

(api/defendpoint PUT "/:id"
  "Create a new [[TimelineEvent]]."
  [:as {{:keys [name description timestamp time_matters timezone icon timeline_id archived]
         :as timeline-event-updates} :body}]
  {name su/NonBlankString
   description (s/maybe s/Str)
   ;; todo: find schema for timestamps?
   timestamp s/Str
   time_matters (s/maybe s/Bool)
   timezone s/Str
   icon (s/maybe s/Str)
   timeline_id su/IntGreaterThanZero
   archived (s/maybe s/Bool)}
  (let [existing (api/write-check TimelineEvent id)]
    (collection/check-allowed-to-change-collection existing timeline-event-updates)
    (db/update! TimelineEvent id
      (u/select-keys-when timeline-event-updates
        ;; todo: are there more keys needed in non-nil? timestamp?
        :present #{:description :timestamp :time_matters :timezone :icon :timeline_id :archived}
        :non-nil #{:name}))
    (TimelineEvent id)))

;; todo: icons
;; collection_id via timeline_id -> slow, how to do this?

(api/define-routes)
