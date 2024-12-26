(ns metabase.channel.impl.mattermost
  (:require
   [clojure.string :as str]
   [metabase.channel.core :as channel]
   [metabase.channel.render.core :as channel.render]
   [metabase.models.setting :refer [defsetting]]
   [metabase.public-settings :as public-settings]
   [metabase.models.params.shared :as shared.params]
   [metabase.util.malli :as mu]
   [metabase.util.markdown :as markdown]
   [metabase.util.urls :as urls]
   [metabase.util.i18n :refer [deferred-tru]]
   [clj-http.client :as http]
   [metabase.util.json :as json]))

(defsetting mattermost-webhook-url
  (deferred-tru "Mattermost webhook URL for notifications.")
  :visibility :settings-manager
  :type :string
  :encryption :when-encryption-key-set)

(def ^:private block-text-length-limit 3000)
(def ^:private attachment-text-length-limit 2000)

(defn- truncate-text
  "If text is greater than limit, truncates it and adds an ellipsis character."
  [text limit]
  (if (> (count text) limit)
    (-> text
        (subs 0 (dec limit))
        (str "…"))
    text))

(defn- text->markdown
  [text]
  (let [mrkdwn (markdown/process-markdown text :mattermost)]
    (when (not (str/blank? mrkdwn))
      (truncate-text mrkdwn block-text-length-limit))))

(defn- notification-recipient->channel
  [notification-recipient]
  (when (= (:type notification-recipient) :notification-recipient/raw-value)
    (-> notification-recipient :details :value)))

(defn- part->attachment
  [part]
  (case (:type part)
    :card
    (let [{:keys [card dashcard result]} part
          {card-id :id card-name :name :as card} card]
      {:title      (or (-> dashcard :visualization_settings :card.title)
                       card-name)
       :title_link (urls/card-url card-id)
       :text       (if-let [render-text (-> (channel.render/render-pulse-card 
                                            :inline 
                                            (channel.render/defaulted-timezone card) 
                                            card 
                                            dashcard 
                                            result)
                                           :render/text)]
                    (truncate-text render-text attachment-text-length-limit)
                    "")})

    :text
    {:text (text->markdown (:text part))}

    :tab-title
    {:text (text->markdown (format "# %s" (:text part)))}))

(def ^:private MattermostMessage
  [:map {:closed true}
   [:channel                    :string]
   [:attachments [:sequential :map]]
   [:text        {:optional true} [:maybe :string]]])

(defn- post-chat-message!
  [webhook-url message]
  (let [response (http/post webhook-url
                           {:content-type :json
                            :body (json/generate-string message)})]
    (when-not (= 200 (:status response))
      (throw (ex-info "Error posting to Mattermost" 
                     {:status (:status response)
                      :body   (:body response)})))))

(mu/defmethod channel/send! :channel/mattermost
  [_channel message :- MattermostMessage]
  (when-let [webhook-url (mattermost-webhook-url)]
    (post-chat-message! webhook-url message)))

(mu/defmethod channel/render-notification [:channel/mattermost :notification/card]
  [_channel-type {:keys [payload]} _template recipients]
  (let [attachments [{:blocks [{:type "header"
                               :text {:type "plain_text"
                                     :text (str "🔔 " (-> payload :card :name))
                                     :emoji true}}]}
                     (part->attachment (:card_part payload))]]
    (for [channel (map notification-recipient->channel recipients)]
      {:channel     channel
       :attachments attachments})))

(defn- filter-text
  [filter]
  (truncate-text
   (format "*%s*\n%s" (:name filter) (shared.params/value-string filter (public-settings/site-locale)))
   attachment-text-length-limit))

(defn- mattermost-dashboard-header
  "Returns a block element that includes a dashboard's name, creator, and filters"
  [dashboard creator-name parameters]
  {:blocks [{:type "header"
             :text {:type "plain_text"
                   :text (:name dashboard)
                   :emoji true}}
            {:type "section"
             :text {:type "mrkdwn"
                   :text (format "[Sent from %s by %s](%s)"
                               (public-settings/site-name)
                               creator-name
                               (urls/dashboard-url (:id dashboard) parameters))}}
            (when (seq parameters)
              {:type "section"
               :fields (for [filter parameters]
                        {:type "mrkdwn"
                         :text (filter-text filter)})})]})

(defn- create-mattermost-attachment-data
  "Returns a seq of mattermost attachment data structures"
  [parts]
  (for [part  parts
        :let  [attachment (part->attachment part)]
        :when attachment]
    attachment))

(mu/defmethod channel/render-notification [:channel/mattermost :notification/dashboard]
  [_channel-type {:keys [payload creator]} _template recipients]
  (let [parameters (:parameters payload)
        dashboard  (:dashboard payload)]
    (for [channel (map notification-recipient->channel recipients)]
      {:channel     channel
       :attachments (remove nil?
                           (flatten [(mattermost-dashboard-header dashboard (:common_name creator) parameters)
                                   (create-mattermost-attachment-data (:dashboard_parts payload))]))}))) 
