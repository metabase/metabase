(ns metabase.api.pulse
  "/api/pulse endpoints."
  (:require [compojure.core :refer [defroutes GET PUT POST DELETE]]
            [hiccup.core :refer [html]]
            [metabase.api.common :refer :all]
            [metabase.db :as db]
            [metabase.email :as email]
            [metabase.events :as events]
            [metabase.integrations.slack :as slack]
            (metabase.models [card :refer [Card]]
                             [database :refer [Database]]
                             [interface :as models]
                             [pulse :refer [Pulse retrieve-pulse] :as pulse]
                             [pulse-channel :refer [channel-types]])
            [metabase.query-processor :as qp]
            [metabase.pulse :as p]
            [metabase.pulse.render :as render]
            [metabase.util :as u]))


(defendpoint GET "/"
  "Fetch all `Pulses`"
  []
  (for [pulse (pulse/retrieve-pulses)
        :let  [can-read?  (models/can-read? pulse)
               can-write? (models/can-write? pulse)]
        :when (or can-read?
                  can-write?)]
    (assoc pulse :read_only (not can-write?))))


(defn- check-card-read-permissions [cards]
  (doseq [{card-id :id} cards
          :when         card-id] ; for some reason, without explanation, the code below makes it look as though card IDs may randomly be `nil`
    (read-check Card card-id)))

(defendpoint POST "/"
  "Create a new `Pulse`."
  [:as {{:keys [name cards channels]} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (check-card-read-permissions cards)
  (check-500 (pulse/create-pulse! name *current-user-id* (filter identity (map :id cards)) channels)))


(defendpoint GET "/:id"
  "Fetch `Pulse` with ID."
  [id]
  (read-check (pulse/retrieve-pulse id)))



(defendpoint PUT "/:id"
  "Update a `Pulse` with ID."
  [id :as {{:keys [name cards channels]} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (write-check Pulse id)
  (check-card-read-permissions cards)
  (pulse/update-pulse! {:id       id
                        :name     name
                        :cards    (filter identity (map :id cards))
                        :channels channels})
  (pulse/retrieve-pulse id))


(defendpoint DELETE "/:id"
  "Delete a `Pulse`."
  [id]
  (let-404 [pulse (Pulse id)]
    (u/prog1 (db/cascade-delete! Pulse :id id)
      (events/publish-event :pulse-delete (assoc pulse :actor_id *current-user-id*)))))


(defendpoint GET "/form_input"
  "Provides relevant configuration information and user choices for creating/updating `Pulses`."
  []
  (let [chan-types (-> channel-types
                       (assoc-in [:slack :configured] (slack/slack-configured?))
                       (assoc-in [:email :configured] (email/email-configured?)))]
    {:channels (if-not (get-in chan-types [:slack :configured])
                 ;; no Slack integration, so we are g2g
                 chan-types
                 ;; if we have Slack enabled build a dynamic list of channels/users
                 (let [slack-channels (for [channel (slack/channels-list)]
                                        (str \# (:name channel)))
                       slack-users    (for [user (slack/users-list)]
                                        (str \@ (:name user)))]
                   (assoc-in chan-types [:slack :fields 0 :options] (concat slack-channels slack-users))))}))


(defendpoint GET "/preview_card/:id"
  "Get HTML rendering of a `Card` with ID."
  [id]
  (let [card   (read-check Card id)
        result (qp/dataset-query (:dataset_query card) {:executed-by *current-user-id*})]
    {:status 200, :body (html [:html [:body {:style "margin: 0;"} (binding [render/*include-title* true
                                                                            render/*include-buttons* true]
                                                                    (render/render-pulse-card card result))]])}))

(defendpoint GET "/preview_card_info/:id"
  "Get JSON object containing HTML rendering of a `Card` with ID and other information."
  [id]
  (let [card      (read-check Card id)
        result    (qp/dataset-query (:dataset_query card) {:executed-by *current-user-id*})
        data      (:data result)
        card-type (render/detect-pulse-card-type card data)
        card-html (html (binding [render/*include-title* true]
                          (render/render-pulse-card card result)))]
    {:id              id
     :pulse_card_type card-type
     :pulse_card_html card-html
     :row_count       (:row_count result)}))

(defendpoint GET "/preview_card_png/:id"
  "Get PNG rendering of a `Card` with ID."
  [id]
  (let [card   (read-check Card id)
        result (qp/dataset-query (:dataset_query card) {:executed-by *current-user-id*})
        ba     (binding [render/*include-title* true]
                 (render/render-pulse-card-to-png card result))]
    {:status 200, :headers {"Content-Type" "image/png"}, :body (new java.io.ByteArrayInputStream ba)}))

(defendpoint POST "/test"
  "Test send an unsaved pulse"
  [:as {{:keys [name cards channels] :as body} :body}]
  {name     [Required NonEmptyString]
   cards    [Required ArrayOfMaps]
   channels [Required ArrayOfMaps]}
  (check-card-read-permissions cards)
  (p/send-pulse! body)
  {:ok true})

(define-routes)
