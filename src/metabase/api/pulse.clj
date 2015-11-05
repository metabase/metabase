(ns metabase.api.pulse
  "/api/pulse endpoints."
  (:require [korma.core :refer [where subselect fields order limit]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            (metabase.models [common :as common]
                             [hydrate :refer :all]
                             [pulse :refer [Pulse] :as pulse])
            [metabase.util :as util]))


(defendpoint GET "/"
  "Fetch all `Pulses`"
  []
  (-> (db/sel :many Pulse (order :name :ASC))
      (hydrate :creator :cards :channels)))


(defendpoint POST "/"
  "Create a new `Pulse`."
  [:as {{:keys [name cards channels] :as body} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (let-500 [card-ids (filter identity (map :id cards))
            pulse    (pulse/create-pulse name *current-user-id* card-ids channels)]
    (hydrate pulse :cards :channels)))


(defendpoint GET "/:id"
  "Fetch `Pulse` with ID."
  [id]
  (->404 (db/sel :one Pulse :id id)
         (hydrate :creator :cards :channels)))


(defendpoint PUT "/:id"
  "Update a `Pulse` with ID."
  [id :as {{:keys [name cards channels] :as body} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (check-404 (db/exists? Pulse :id id))
  (let-500 [result (pulse/update-pulse {:id       id
                                        :name     name
                                        :cards    (filter identity (into [] (map :id cards)))
                                        :channels channels})]
    (-> (db/sel :one Pulse :id id)
        (hydrate :creator :cards :channels))))


(defendpoint DELETE "/:id"
  "Delete a `Pulse`."
  [id]
  (db/cascade-delete Pulse :id id))


(define-routes)
