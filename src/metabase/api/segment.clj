(ns metabase.api.segment
  "/api/segment endpoints."
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [revision :as revision]
                             [segment :refer [Segment] :as segment]
                             [table :refer [Table]])))


(defendpoint POST "/"
  "Create a new `Segment`."
  [:as {{:keys [name description table_id definition] :as body} :body}]
  {name       [Required NonEmptyString]
   table_id   [Required Integer]
   definition [Required Dict]}
  (check-superuser)
  (checkp #(db/exists? Table :id table_id) "table_id" "Table does not exist.")
  (->500 (segment/create-segment table_id name description *current-user-id* definition)))


(defendpoint GET "/:id"
  "Fetch `Segment` with ID."
  [id]
  (check-superuser)
  (->404 (segment/retrieve-segment id)))


(defendpoint PUT "/:id"
  "Update a `Segment` with ID."
  [id :as {{:keys [name description definition revision_message] :as body} :body}]
  {name             [Required NonEmptyString]
   revision_message [Required NonEmptyString]
   definition       [Required Dict]}
  (check-superuser)
  (check-404 (segment/exists-segment? id))
  (segment/update-segment
    {:id               id
     :name             name
     :description      description
     :definition       definition
     :revision_message revision_message}
    *current-user-id*))


(defendpoint DELETE "/:id"
  "Delete a `Segment`."
  [id revision_message]
  {revision_message [Required NonEmptyString]}
  (check-superuser)
  (check-404 (segment/exists-segment? id))
  (segment/delete-segment id *current-user-id* revision_message)
  {:success true})


(defendpoint GET "/:id/revisions"
  "Fetch `Revisions` for `Segment` with ID."
  [id]
  (check-superuser)
  (check-404 (segment/exists-segment? id))
  (revision/revisions+details Segment id))


(defendpoint POST "/:id/revert"
  "Revert a `Segement` to a prior `Revision`."
  [id :as {{:keys [revision_id]} :body}]
  {revision_id [Required Integer]}
  (check-superuser)
  (check-404 (segment/exists-segment? id))
  (revision/revert
    :entity      Segment
    :id          id
    :user-id     *current-user-id*
    :revision-id revision_id))


(define-routes)
