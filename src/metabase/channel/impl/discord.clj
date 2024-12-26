(ns metabase.channel.impl.discord
  (:require
   [clj-http.client :as http]
   [clojure.string :as str]
   [metabase.channel.core :as channel]
   [metabase.channel.render.core :as channel.render]
   [metabase.models.params.shared :as shared.params]
   [metabase.models.setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.json :as json]
   [metabase.util.malli :as mu]
   [metabase.util.markdown :as markdown]
   [metabase.util.urls :as urls]
   [metabase.pulse.render :as pulse.render]
   [metabase.pulse.render.image-bundle :as image-bundle]
   [clojure.java.io :as io]))
#_(discord-webhook-url! "https://discordapp.com/api/webhooks/1321811046196838511/Ctmgo0NBx0t3aN0MXjhEhk17QMbFlqtRlYSDYU7rlsYlDYYKtYP_nbWrLQ4JWY6VtWzr")

(defsetting discord-webhook-url
  (deferred-tru "Discord webhook URL for notifications.")
  :visibility :settings-manager
  :type :string
  :encryption :when-encryption-key-set)

(def ^:private embed-description-limit 4096)
(def ^:private embed-title-limit 256)

(defn- truncate-text
  "If text exceeds limit, truncates it and adds an ellipsis character."
  [text limit]
  (if (> (count text) limit)
    (-> text
        (subs 0 (dec limit))
        (str "…"))
    text))

(defn- text->markdown
  [text]
  (let [mrkdwn (markdown/process-markdown text :discord)]
    (when (not (str/blank? mrkdwn))
      (truncate-text mrkdwn embed-description-limit))))

(defn- notification-recipient->webhook-url
  [notification-recipient]
  (when (= (:type notification-recipient) :notification-recipient/raw-value)
    (-> notification-recipient :details :value)))

(defn- render-card-image
  [{:keys [card dashcard result]}]
  (when result
    (let [image-bundle (pulse.render/render-pulse-card-for-image 
                       (channel.render/defaulted-timezone card)
                       card 
                       dashcard
                       result)]
      (when (image-bundle/has-image? image-bundle)
        image-bundle))))

(defn- part->embed-and-image
  [part]
  (case (:type part)
    :card
    (let [{:keys [card dashcard] :as card-data} part
          card-name (or (-> dashcard :visualization_settings :card.title)
                       (:name card))
          image-bundle (render-card-image card-data)]
      {:embed {:title (truncate-text card-name embed-title-limit)
              :url (urls/card-url (:id card))}
       :image-bundle image-bundle})

    :text
    {:embed {:description (text->markdown (:text part))}
     :image-bundle nil}

    :tab-title
    {:embed {:title (truncate-text (str "# " (:text part)) embed-title-limit)}
     :image-bundle nil}))

(def ^:private DiscordMessage
  [:map {:closed true}
   [:webhook_url :string]
   [:embeds [:sequential :map]]
   [:content {:optional true} [:maybe :string]]])

(defn- prepare-multipart-data
  [message files]
  (let [payload-json (json/encode (assoc message :attachments 
                                        (map-indexed (fn [idx _] 
                                                     {:id idx :filename (str "image" idx ".png")}) 
                                                   files)))]
    (concat
     [[:payload_json payload-json]]
     (map-indexed (fn [idx file]
                   [(str "files[" idx "]") file])
                 files))))

(defn- post-discord-message!
  [webhook-url message files]
  (let [multipart (prepare-multipart-data message files)
        response (http/post webhook-url
                           {:multipart multipart})]
    (when-not (= 204 (:status response))
      (throw (ex-info "Error posting to Discord"
                     {:status (:status response)
                      :body   (:body response)})))))

(mu/defmethod channel/send! :channel/discord
  [_channel message :- DiscordMessage]
  (when-let [webhook-url (:webhook_url message)]
    (let [files (keep :file (:attachments message))]
      (post-discord-message! webhook-url 
                           (-> message
                               (dissoc :webhook_url :attachments)
                               (update :embeds (fn [embeds]
                                               (map-indexed (fn [idx embed]
                                                            (if-let [image (:image embed)]
                                                              (assoc embed :image {:url (str "attachment://image" idx ".png")})
                                                              embed))
                                                          embeds))))
                           files))))

(mu/defmethod channel/render-notification [:channel/discord :notification/card]
  [_channel-type {:keys [payload]} _template recipients]
  (let [{:keys [embed-data image-bundle]} (part->embed-and-image (:card_part payload))
        embed (merge
               {:color 5814783  ; Blue color
                :title (str "🔔 " (-> payload :card :name))}
               embed-data)]
    (for [webhook-url (map notification-recipient->webhook-url recipients)]
      {:webhook_url webhook-url
       :embeds [embed]
       :attachments (when (image-bundle/has-image? image-bundle)
                     [{:file (image-bundle/image-bytes image-bundle)}])})))

(defn- filter-text
  [filter]
  (truncate-text
   (format "**%s**\n%s" (:name filter) (shared.params/value-string filter (public-settings/site-locale)))
   embed-description-limit))

(mu/defmethod channel/render-notification [:channel/discord :notification/dashboard]
  [_channel-type {:keys [payload creator]} _template recipients]
  (let [{:keys [dashboard_parts dashboard parameters]} payload
        dashboard-embed {:title (:name dashboard)
                         :url (urls/dashboard-url (:id dashboard) parameters)
                         :description (format "Sent from %s by %s"
                                              (public-settings/site-name)
                                              (:common_name creator))
                         :fields (when (seq parameters)
                                   (for [filter parameters]
                                     {:name (filter-text filter)
                                      :inline true}))}
        part-embeds (for [part dashboard_parts
                          :let [embed (part->embed part)]
                          :when embed]
                      embed)]
    (for [webhook-url (map notification-recipient->webhook-url recipients)]
      {:webhook_url webhook-url
       :embeds (cons dashboard-embed part-embeds)})))
