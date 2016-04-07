(ns metabase.api.topic
  "`/api/topic` endpoints."
  (:require [compojure.core :refer [GET POST DELETE PUT]]
            [korma.core :as k]
            [medley.core :as m]
            [metabase.api.common :refer [defendpoint define-routes write-check]]
            [metabase.db :as db]
            [metabase.models.topic :refer [Topic]]))

(defendpoint GET "/"
  "List all topics."
  []
  (db/sel :many Topic (k/order (k/sqlfn :LOWER :name))))

(defendpoint POST "/"
  "Create a new topic."
  [:as {{topic-name :name, icon :icon} :body}]
  {topic-name [Required NonEmptyString]
   icon       NonEmptyString}
  (db/ins Topic, :name topic-name, :icon icon, :enabled true))

(defendpoint PUT "/:id"
  "Update a topic."
  [id :as {{topic-name :name, icon :icon, enabled :enabled, :as body} :body}]
  {topic-name NonEmptyString
   icon       NonEmptyString
   enabled    Boolean}
  (write-check Topic id)
  (m/mapply db/upd Topic id body)
  (Topic id)) ; return the updated Topic

(defendpoint DELETE "/:id"
  "Delete a topic."
  [id]
  (write-check Topic id)
  (db/cascade-delete Topic :id id))

(define-routes)
