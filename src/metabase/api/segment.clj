(ns metabase.api.segment
  "/api/segment endpoints."
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [metabase.api.common :as api]
            [metabase.models
             [interface :as mi]
             [revision :as revision]
             [segment :as segment :refer [Segment]]
             [table :refer [Table]]]
            [metabase.related :as related]
            [metabase.util.schema :as su]
            [toucan
             [db :as db]
             [hydrate :refer [hydrate]]]))

(api/defendpoint POST "/"
  "Create a new `Segment`."
  [:as {{:keys [name description table_id definition]} :body}]
  {name       su/NonBlankString
   table_id   su/IntGreaterThanZero
   definition su/Map}
  (api/check-superuser)
  (api/write-check Table table_id)
  (api/check-500 (segment/create-segment! table_id name description api/*current-user-id* definition)))


(api/defendpoint GET "/:id"
  "Fetch `Segment` with ID."
  [id]
  (api/check-superuser)
  (api/read-check (segment/retrieve-segment id)))

;; TODO - Why do we require superuser status for GET /api/segment/:id but not GET /api/segment?
(api/defendpoint GET "/"
  "Fetch *all* `Segments`."
  []
  (filter mi/can-read? (-> (db/select Segment, :archived false, {:order-by [[:%lower.name :asc]]})
                           (hydrate :creator))))


(api/defendpoint PUT "/:id"
  "Update a `Segment` with ID."
  [id :as {{:keys [name definition revision_message], :as body} :body}]
  {name             su/NonBlankString
   revision_message su/NonBlankString
   definition       su/Map}
  (api/check-superuser)
  (api/write-check Segment id)
  (segment/update-segment!
   (assoc (select-keys body #{:name :description :caveats :points_of_interest :show_in_getting_started :definition
                              :revision_message})
     :id id)
   api/*current-user-id*))


(api/defendpoint DELETE "/:id"
  "Delete a `Segment`."
  [id revision_message]
  {revision_message su/NonBlankString}
  (api/check-superuser)
  (api/write-check Segment id)
  (segment/delete-segment! id api/*current-user-id* revision_message)
  {:success true}) ; TODO - why doesn't this return a 204 'No Content'?


(api/defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Segment` with ID."
  [id]
  (api/check-superuser)
  (api/read-check Segment id)
  (revision/revisions+details Segment id))


(api/defendpoint POST "/:id/revert"
  "Revert a `Segement` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id su/IntGreaterThanZero}
  (api/check-superuser)
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
