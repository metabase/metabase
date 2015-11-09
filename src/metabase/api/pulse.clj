(ns metabase.api.pulse
  "/api/pulse endpoints."
  (:require [korma.core :refer [where subselect fields order limit]]
            [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [hiccup.core :refer [html]]
            [medley.core :refer :all]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.driver :as driver]
            (metabase.models [card :refer [Card]]
                             [database :refer [Database]]
                             [hydrate :refer :all]
                             [pulse :refer [Pulse] :as pulse]
                             [pulse-channel :refer [channel-types]])
            [metabase.util :as util]
            [metabase.pulse :as p]))


(defendpoint GET "/"
  "Fetch all `Pulses`"
  []
  (pulse/retrieve-pulses))


(defendpoint POST "/"
  "Create a new `Pulse`."
  [:as {{:keys [name cards channels] :as body} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (->500 (pulse/create-pulse name *current-user-id* (filter identity (map :id cards)) channels)))


(defendpoint GET "/:id"
  "Fetch `Pulse` with ID."
  [id]
  (->404 (pulse/retrieve-pulse id)))


(defendpoint PUT "/:id"
  "Update a `Pulse` with ID."
  [id :as {{:keys [name cards channels] :as body} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (check-404 (db/exists? Pulse :id id))
  (pulse/update-pulse {:id       id
                       :name     name
                       :cards    (filter identity (map :id cards))
                       :channels channels})
  (pulse/retrieve-pulse id))


(defendpoint DELETE "/:id"
  "Delete a `Pulse`."
  [id]
  (db/cascade-delete Pulse :id id))


(defendpoint GET "/form_input"
  ""
  []
  {:channel_types channel-types})


(defendpoint GET "/preview_card/:id"
  "Get HTML rendering of a `Card` with ID."
  [id]
  (let [card (Card id)]
        (read-check Database (:database (:dataset_query card)))
        (let [data (:data (driver/dataset-query (:dataset_query card) {:executed_by *current-user-id*}))]
              {:status 200 :body (html [:html [:body {:style ""} (p/render-pulse-card card data)]])})))

(define-routes)
