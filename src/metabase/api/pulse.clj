(ns metabase.api.pulse
  "/api/pulse endpoints."
  (:require [compojure.core :refer [DELETE GET POST PUT]]
            [hiccup.core :refer [html]]
            [metabase
             [email :as email]
             [events :as events]
             [pulse :as p]
             [query-processor :as qp]
             [util :as u]]
            [metabase.api.common :as api]
            [metabase.integrations.slack :as slack]
            [metabase.models
             [card :refer [Card]]
             [collection :as collection]
             [interface :as mi]
             [pulse :as pulse :refer [Pulse]]
             [pulse-channel :refer [channel-types]]]
            [metabase.pulse.render :as render]
            [metabase.util
             [schema :as su]
             [urls :as urls]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.io.ByteArrayInputStream))

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
  "Users can only create a pulse for `cards` they have access to."
  [cards]
  (doseq [card cards
          :let [card-id (u/get-id card)]]
    (assert (integer? card-id))
    (api/read-check Card card-id)))

(api/defendpoint POST "/"
  "Create a new `Pulse`."
  [:as {{:keys [name cards channels skip_if_empty collection_id collection_position]} :body}]
  {name                su/NonBlankString
   cards               (su/non-empty [pulse/CoercibleToCardRef])
   channels            (su/non-empty [su/Map])
   skip_if_empty       (s/maybe s/Bool)
   collection_id       (s/maybe su/IntGreaterThanZero)
   collection_position (s/maybe su/IntGreaterThanZero)}
  ;; make sure we are allowed to *read* all the Cards we want to put in this Pulse
  (check-card-read-permissions cards)
  ;; if we're trying to create this Pulse inside a Collection, make sure we have write permissions for that collection
  (collection/check-write-perms-for-collection collection_id)
  (let [pulse-data {:name                name
                    :creator_id          api/*current-user-id*
                    :skip_if_empty       skip_if_empty
                    :collection_id       collection_id
                    :collection_position collection_position}]
    (db/transaction
      ;; Adding a new pulse at `collection_position` could cause other pulses in this collection to change position,
      ;; check that and fix it if needed
      (api/maybe-reconcile-collection-position! pulse-data)
      ;; ok, now create the Pulse
      (api/check-500
       (pulse/create-pulse! (map pulse/card->ref cards) channels pulse-data)))))


(api/defendpoint GET "/:id"
  "Fetch `Pulse` with ID."
  [id]
  (api/read-check (pulse/retrieve-pulse id)))


(api/defendpoint PUT "/:id"
  "Update a Pulse with `id`."
  [id :as {{:keys [name cards channels skip_if_empty collection_id], :as pulse-updates} :body}]
  {name          (s/maybe su/NonBlankString)
   cards         (s/maybe (su/non-empty [pulse/CoercibleToCardRef]))
   channels      (s/maybe (su/non-empty [su/Map]))
   skip_if_empty (s/maybe s/Bool)
   collection_id (s/maybe su/IntGreaterThanZero)}
  ;; do various perms checks
  (let [pulse-before-update (api/write-check Pulse id)]
    (check-card-read-permissions cards)
    (collection/check-allowed-to-change-collection pulse-before-update pulse-updates)

    (db/transaction
      ;; If the collection or position changed with this update, we might need to fixup the old and/or new collection,
      ;; depending on what changed.
      (api/maybe-reconcile-collection-position! pulse-before-update pulse-updates)
      ;; ok, now update the Pulse
      (pulse/update-pulse!
       (assoc (select-keys pulse-updates [:name :cards :channels :skip_if_empty :collection_id :collection_position])
         :id id))))
  ;; return updated Pulse
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

(defn- pulse-card-query-results [card]
  (qp/process-query-and-save-execution! (:dataset_query card) {:executed-by api/*current-user-id*
                                                               :context     :pulse
                                                               :card-id     (u/get-id card)}))

(api/defendpoint GET "/preview_card/:id"
  "Get HTML rendering of a `Card` with ID."
  [id]
  (let [card   (api/read-check Card id)
        result (pulse-card-query-results card)]
    {:status 200
     :body   (html
              [:html
               [:body {:style "margin: 0;"}
                (binding [render/*include-title*   true
                          render/*include-buttons* true]
                  (render/render-pulse-card-for-display (p/defaulted-timezone card) card result))]])}))

(api/defendpoint GET "/preview_card_info/:id"
  "Get JSON object containing HTML rendering of a `Card` with ID and other information."
  [id]
  (let [card      (api/read-check Card id)
        result    (pulse-card-query-results card)
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
        result (pulse-card-query-results card)
        ba     (binding [render/*include-title* true]
                 (render/render-pulse-card-to-png (p/defaulted-timezone card) card result))]
    {:status 200, :headers {"Content-Type" "image/png"}, :body (ByteArrayInputStream. ba)}))

(api/defendpoint POST "/test"
  "Test send an unsaved pulse."
  [:as {{:keys [name cards channels skip_if_empty] :as body} :body}]
  {name          su/NonBlankString
   cards         (su/non-empty [pulse/CardRef])
   channels      (su/non-empty [su/Map])
   skip_if_empty s/Bool}
  (check-card-read-permissions cards)
  (p/send-pulse! body)
  {:ok true})

(api/define-routes)
