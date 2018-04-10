(ns metabase.api.pulse
  "/api/pulse endpoints."
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [hiccup.core :refer [html]]
            [metabase
             [driver :as driver]
             [email :as email]
             [events :as events]
             [pulse :as p]
             [query-processor :as qp]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.integrations.slack :as slack]
            [metabase.models
             [card :refer [Card]]
             [interface :as mi]
             [pulse :as pulse :refer [Pulse]]
             [pulse-channel :refer [channel-types]]]
            [metabase.pulse.render :as render]
            [metabase.util.schema :as su]
            [metabase.util.urls :as urls]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.io.ByteArrayInputStream
           java.util.TimeZone))

(api/defendpoint GET "/"
  "Fetch all `Pulses`"
  []
  (for [pulse (pulse/retrieve-pulses)
        :let  [can-read?  (mi/can-read? pulse)
               can-write? (mi/can-write? pulse)]
        :when (or can-read?
                  can-write?)]
    (assoc pulse :read_only (not can-write?))))

(defn check-card-read-permissions
  "Users can only create a pulse for `CARDS` they have access to"
  [cards]
  (doseq [card cards
          :let [card-id (u/get-id card)]]
    (assert (integer? card-id))
    (api/read-check Card card-id)))

(api/defendpoint POST "/"
  "Create a new `Pulse`."
  [:as {{:keys [name cards channels skip_if_empty]} :body}]
  {name          su/NonBlankString
   cards         (su/non-empty [su/Map])
   channels      (su/non-empty [su/Map])
   skip_if_empty s/Bool}
  (check-card-read-permissions cards)
  (api/check-500 (pulse/create-pulse! name api/*current-user-id* (map pulse/create-card-ref cards) channels skip_if_empty)))


(api/defendpoint GET "/:id"
  "Fetch `Pulse` with ID."
  [id]
  (api/read-check (pulse/retrieve-pulse id)))



(api/defendpoint PUT "/:id"
  "Update a `Pulse` with ID."
  [id :as {{:keys [name cards channels skip_if_empty]} :body}]
  {name          su/NonBlankString
   cards         (su/non-empty [su/Map])
   channels      (su/non-empty [su/Map])
   skip_if_empty s/Bool}
  (api/write-check Pulse id)
  (check-card-read-permissions cards)
  (pulse/update-pulse! {:id             id
                        :name           name
                        :cards          (map pulse/create-card-ref cards)
                        :channels       channels
                        :skip-if-empty? skip_if_empty})
  (pulse/retrieve-pulse id))


(api/defendpoint DELETE "/:id"
  "Delete a `Pulse`."
  [id]
  (api/let-404 [pulse (Pulse id)]
    (api/write-check Pulse id)
    (db/delete! Pulse :id id)
    (events/publish-event! :pulse-delete (assoc pulse :actor_id api/*current-user-id*)))
  api/generic-204-no-content)


(api/defendpoint GET "/form_input"
  "Provides relevant configuration information and user choices for creating/updating `Pulses`."
  []
  (let [chan-types (-> channel-types
                       (assoc-in [:slack :configured] (slack/slack-configured?))
                       (assoc-in [:email :configured] (email/email-configured?)))]
    {:channels (if-not (get-in chan-types [:slack :configured])
                 ;; no Slack integration, so we are g2g
                 chan-types
                 ;; if we have Slack enabled build a dynamic list of channels/users
                 (try
                   (let [slack-channels (for [channel (slack/channels-list)]
                                          (str \# (:name channel)))
                         slack-users    (for [user (slack/users-list)]
                                          (str \@ (:name user)))]
                     (assoc-in chan-types [:slack :fields 0 :options] (concat slack-channels slack-users)))
                   (catch Throwable e
                     (assoc-in chan-types [:slack :error] (.getMessage e)))))}))

(api/defendpoint GET "/preview_card/:id"
  "Get HTML rendering of a `Card` with ID."
  [id]
  (let [card   (api/read-check Card id)
        result (qp/process-query-and-save-execution! (:dataset_query card) {:executed-by api/*current-user-id*
                                                                            :context     :pulse
                                                                            :card-id     id})]
    {:status 200, :body (html [:html [:body {:style "margin: 0;"} (binding [render/*include-title*   true
                                                                            render/*include-buttons* true]
                                                                    (render/render-pulse-card-for-display (p/defaulted-timezone card) card result))]])}))

(api/defendpoint GET "/preview_card_info/:id"
  "Get JSON object containing HTML rendering of a `Card` with ID and other information."
  [id]
  (let [card      (api/read-check Card id)
        result    (qp/process-query-and-save-execution! (:dataset_query card) {:executed-by api/*current-user-id*
                                                                               :context     :pulse
                                                                               :card-id     id})
        data      (:data result)
        card-type (render/detect-pulse-card-type card data)
        card-html (html (binding [render/*include-title* true]
                          (render/render-pulse-card-for-display (p/defaulted-timezone card) card result)))]
    {:id              id
     :pulse_card_type card-type
     :pulse_card_html card-html
     :pulse_card_name (:name card)
     :pulse_card_url  (urls/card-url (:id card))
     :row_count       (:row_count result)
     :col_count       (count (:cols (:data result)))}))

(api/defendpoint GET "/preview_card_png/:id"
  "Get PNG rendering of a `Card` with ID."
  [id]
  (let [card   (api/read-check Card id)
        result (qp/process-query-and-save-execution! (:dataset_query card) {:executed-by api/*current-user-id*, :context :pulse, :card-id id})
        ba     (binding [render/*include-title* true]
                 (render/render-pulse-card-to-png (p/defaulted-timezone card) card result))]
    {:status 200, :headers {"Content-Type" "image/png"}, :body (ByteArrayInputStream. ba)}))

(api/defendpoint POST "/test"
  "Test send an unsaved pulse."
  [:as {{:keys [name cards channels skip_if_empty] :as body} :body}]
  {name          su/NonBlankString
   cards         (su/non-empty [su/Map])
   channels      (su/non-empty [su/Map])
   skip_if_empty s/Bool}
  (check-card-read-permissions cards)
  (p/send-pulse! body)
  {:ok true})

(api/define-routes)
