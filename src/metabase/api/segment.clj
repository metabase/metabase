(ns metabase.api.segment
  "/api/segment endpoints."
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [segment :refer [Segment] :as segment]
                             [table :refer [Table]])))


;(defendpoint GET "/"
;  "Fetch all `Segments`"
;  []
;  (check-superuser)
;  (segment/retrieve-segments))


(defendpoint POST "/"
  "Create a new `Segment`."
  [:as {{:keys [name description table_id definition] :as body} :body}]
  {name       [Required NonEmptyString]
   table_id   [Required Integer]
   definition [Required Dict]}
  (check-superuser)
  (checkp #(db/exists? Table :id table_id) "table_id" "Table does not exist.")
  (->500 (segment/create-segment table_id name description *current-user-id* definition)))


;(defendpoint GET "/:id"
;  "Fetch `Segment` with ID."
;  [id]
;  (check-superuser)
;  (->404 (segment/retrieve-segment id)))


(defendpoint PUT "/:id"
  "Update a `Segment` with ID."
  [id :as {{:keys [name description definition revision_message] :as body} :body}]
  {name             [Required NonEmptyString]
   revision_message [Required NonEmptyString]
   definition       [Required Dict]}
  (check-superuser)
  (check-404 (db/exists? Segment :id id))
  (segment/update-segment {:id          id
                           :name        name
                           :description description
                           :definition  definition} revision_message))


(defendpoint DELETE "/:id"
  "Delete a `Segment`."
  [id]
  (check-superuser)
  (let-404 [segment (db/sel :one Segment :id id)]
    (segment/delete-segment id)))


(define-routes)
