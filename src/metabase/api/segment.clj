(ns metabase.api.segment
  "/api/segment endpoints."
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [hydrate :refer [hydrate]]
                             [interface :as models]
                             [revision :as revision]
                             [segment :refer [Segment], :as segment]
                             [table :refer [Table]])))


(defendpoint POST "/"
  "Create a new `Segment`."
  [:as {{:keys [name description table_id definition]} :body}]
  {name       [Required NonEmptyString]
   table_id   [Required Integer]
   definition [Required Dict]}
  (check-superuser)
  (write-check Table table_id)
  (check-500 (segment/create-segment! table_id name description *current-user-id* definition)))


(defendpoint GET "/:id"
  "Fetch `Segment` with ID."
  [id]
  (check-superuser)
  (read-check (segment/retrieve-segment id)))

;; TODO - Why do we require superuser status for GET /api/segment/:id but not GET /api/segment?
(defendpoint GET "/"
  "Fetch *all* `Segments`."
  []
  (filter models/can-read? (-> (db/select Segment, :is_active true)
                               (hydrate :creator))))


(defendpoint PUT "/:id"
  "Update a `Segment` with ID."
  [id :as {{:keys [name description caveats points_of_interest show_in_getting_started definition revision_message]} :body}]
  {name             [Required NonEmptyString]
   revision_message [Required NonEmptyString]
   definition       [Required Dict]}
  (check-superuser)
  (write-check Segment id)
  (segment/update-segment!
    {:id                      id
     :name                    name
     :description             description
     :caveats                 caveats
     :points_of_interest      points_of_interest
     :show_in_getting_started show_in_getting_started
     :definition              definition
     :revision_message        revision_message}
    *current-user-id*))


(defendpoint DELETE "/:id"
  "Delete a `Segment`."
  [id revision_message]
  {revision_message [Required NonEmptyString]}
  (check-superuser)
  (write-check Segment id)
  (segment/delete-segment! id *current-user-id* revision_message)
  {:success true})


(defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Segment` with ID."
  [id]
  (check-superuser)
  (read-check Segment id)
  (revision/revisions+details Segment id))


(defendpoint POST "/:id/revert"
  "Revert a `Segement` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id [Required Integer]}
  (check-superuser)
  (write-check Segment id)
  (revision/revert!
    :entity      Segment
    :id          id
    :user-id     *current-user-id*
    :revision-id revision_id))


(define-routes)
