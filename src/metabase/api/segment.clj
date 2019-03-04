(ns metabase.api.segment
  "/api/segment endpoints."
  (:require [clojure.data :as data]
            [clojure.tools.logging :as log]
            [compojure.core :refer [DELETE GET POST PUT]]
            [metabase
             [events :as events]
             [related :as related]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.models
             [interface :as mi]
             [revision :as revision]
             [segment :as segment :refer [Segment]]]
            [metabase.util
             [i18n :refer [trs]]
             [schema :as su]]
            [schema.core :as s]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(api/defendpoint POST "/"
  "Create a new `Segment`."
  [:as {{:keys [name description table_id definition], :as body} :body}]
  {name       su/NonBlankString
   table_id   su/IntGreaterThanZero
   definition su/Map
   description (s/maybe s/Str)}
  ;; TODO - why can't we set other properties like `show_in_getting_started` when we create the Segment?
  (api/create-check Segment body)
  (let [segment (api/check-500
                 (db/insert! Segment
                   :table_id    table_id
                   :creator_id  api/*current-user-id*
                   :name        name
                   :description description
                   :definition  definition))]
    (-> (events/publish-event! :segment-create segment)
        (hydrate :creator))))

(s/defn ^:private hydrated-segment [id :- su/IntGreaterThanZero]
  (-> (api/read-check (Segment id))
      (hydrate :creator)))

(api/defendpoint GET "/:id"
  "Fetch `Segment` with ID."
  [id]
  (hydrated-segment id))

(api/defendpoint GET "/"
  "Fetch *all* `Segments`."
  []
  (as-> (db/select Segment, :archived false, {:order-by [[:%lower.name :asc]]}) segments
    (filter mi/can-read? segments)
    (hydrate segments :creator)))


(defn- write-check-and-update-segment!
  "Check whether current user has write permissions, then update Segment with values in `body`. Publishes appropriate
  event and returns updated/hydrated Segment."
  [id {:keys [revision_message archived], :as body}]
  (let [existing  (api/write-check Segment id)
        [changes] (data/diff
                   (u/select-keys-when body
                     :present #{:description :caveats :points_of_interest}
                     :non-nil #{:archived :definition :name :show_in_getting_started})
                   existing)
        archive?  (:archived changes)]
    (when changes
      (db/update! Segment id changes))
    (u/prog1 (hydrated-segment id)
      (events/publish-event! (if archive? :segment-delete :segment-update)
        (assoc <> :actor_id api/*current-user-id*, :revision_message revision_message)))))

(api/defendpoint PUT "/:id"
  "Update a `Segment` with ID."
  [id :as {{:keys [name definition revision_message archived caveats description points_of_interest
                   show_in_getting_started]
            :as   body} :body}]
  {name                    (s/maybe su/NonBlankString)
   definition              (s/maybe su/Map)
   revision_message        su/NonBlankString
   archived                (s/maybe s/Bool)
   caveats                 (s/maybe s/Str)
   description             (s/maybe s/Str)
   points_of_interest      (s/maybe s/Str)
   show_in_getting_started (s/maybe s/Bool)}
  (write-check-and-update-segment! id body))

(api/defendpoint DELETE "/:id"
  "Archive a Segment. (DEPRECATED -- Just pass updated value of `:archived` to the `PUT` endpoint instead.)"
  [id revision_message]
  {revision_message su/NonBlankString}
  (log/warn
   (trs "DELETE /api/segment/:id is deprecated. Instead, change its `archived` value via PUT /api/segment/:id."))
  (write-check-and-update-segment! id {:archived true, :revision_message revision_message})
  api/generic-204-no-content)


(api/defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Segment` with ID."
  [id]
  (api/read-check Segment id)
  (revision/revisions+details Segment id))


(api/defendpoint POST "/:id/revert"
  "Revert a `Segement` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id su/IntGreaterThanZero}
  (api/write-check Segment id)
  (revision/revert!
    :entity      Segment
    :id          id
    :user-id     api/*current-user-id*
    :revision-id revision_id))

(api/defendpoint GET "/:id/related"
  "Return related entities."
  [id]
  (-> id Segment api/read-check related/related))


(api/define-routes)
