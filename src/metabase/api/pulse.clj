(ns metabase.api.pulse
  "/api/pulse endpoints."
  (:require [korma.core :refer [where subselect fields order limit]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [hiccup.core :refer [html]]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.driver :as driver]
            (metabase.models [card :refer [Card] :as card]
                             [common :as common]
                             [database :refer [Database]]
                             [hydrate :refer :all]
                             [pulse :refer [Pulse] :as pulse])
            [metabase.util :as util]
            [metabase.pulse :as p]))


(defendpoint GET "/"
  "Fetch all `Pulses`"
  []
  (-> (db/sel :many Pulse (order :name :ASC))
      (hydrate :creator :cards)))


(defendpoint POST "/"
  "Create a new `Pulse`."
  [:as {{:keys [name cards channels] :as body} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (clojure.pprint/pprint body)
  (let-500 [card-ids (filter identity (map :id cards))
            pulse (pulse/create-pulse name *current-user-id* card-ids channels)]
    (hydrate pulse :cards)))


(defendpoint GET "/:id"
  "Fetch `Pulse` with ID."
  [id]
  (->404 (db/sel :one Pulse :id id)
         (hydrate :creator :cards)))


(defendpoint PUT "/:id"
  "Update a `Pulse` with ID."
  [id :as {{:keys [name cards channels] :as body} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (let-404 [pulse (db/sel :one Pulse :id id)]
    (->500
      (pulse/update-pulse {:id       id
                           :name     name
                           :cards    (filter identity (into [] (map :id cards)))
                           :channels []})
      (hydrate :creator :cards))))


(defendpoint DELETE "/:id"
  "Delete a `Pulse`."
  [id]
  (db/cascade-delete Pulse :id id))

(defendpoint GET "/preview_card/:id"
  "Get HTML rendering of a `Card` with ID."
  [id]
  (let [card (Card id)]
        (read-check Database (:database (:dataset_query card)))
        (let [data (:data (driver/dataset-query (:dataset_query card) {:executed_by *current-user-id*}))]
              {:status 200 :body (html [:html [:body {:style ""} (p/render-pulse-card card data)]])})))

(define-routes)
