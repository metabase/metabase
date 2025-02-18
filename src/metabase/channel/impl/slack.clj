(ns metabase.channel.impl.slack
  (:require
   [clojure.string :as str]
   [metabase.channel.core :as channel]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.shared :as channel.shared]
   ;; TODO: integrations.slack should be migrated to channel.slack
   [metabase.integrations.slack :as slack]
   [metabase.models.params.shared :as shared.params]
   [metabase.public-settings :as public-settings]
   [metabase.util.malli :as mu]
   [metabase.util.markdown :as markdown]
   [metabase.util.urls :as urls]))

(defn- notification-recipient->channel-id
  [notification-recipient]
  (when (= (:type notification-recipient) :notification-recipient/raw-value)
    (-> notification-recipient :details :value)))

(defn- truncate-mrkdwn
  "If a mrkdwn string is greater than Slack's length limit, truncates it to fit the limit and
  adds an ellipsis character to the end."
  [mrkdwn limit]
  (if (> (count mrkdwn) limit)
    (-> mrkdwn
        (subs 0 (dec limit))
        (str "…"))
    mrkdwn))

(def ^:private block-text-length-limit 3000)
(def ^:private attachment-text-length-limit 2000)

(defn- text->markdown-block
  [text]
  (let [mrkdwn (markdown/process-markdown text :slack)]
    (when (not (str/blank? mrkdwn))
      {:blocks [{:type "section"
                 :text {:type "mrkdwn"
                        :text (truncate-mrkdwn mrkdwn block-text-length-limit)}}]})))

(defn- part->attachment-data
  [part channel-id]
  (case (:type part)
    :card
    (let [{:keys [card dashcard result]}         part
          {card-id :id card-name :name :as card} card]
      {:title           (or (-> dashcard :visualization_settings :card.title)
                            card-name)
       :rendered-info   (channel.render/render-pulse-card :inline (channel.render/defaulted-timezone card) card dashcard result)
       :title_link      (urls/card-url card-id)
       :attachment-name "image.png"
       :channel-id      channel-id
       :fallback        card-name})

    :text
    (text->markdown-block (:text part))

    :tab-title
    (text->markdown-block (format "# %s" (:text part)))))

(def ^:private slack-width
  "Maximum width of the rendered PNG of HTML to be sent to Slack. Content that exceeds this width (e.g. a table with
  many columns) is truncated."
  1200)

(defn- create-and-upload-slack-attachments!
  "Create an attachment in Slack for a given Card by rendering its content into an image and uploading
  it. Slack-attachment-uploader is a function which takes image-bytes and an attachment name, uploads the file, and
  returns an image url, defaulting to slack/upload-file!.

  Nested `blocks` lists containing text cards are passed through unmodified."
  [attachments]
  (reduce (fn [processed {:keys [title title_link attachment-name rendered-info] :as attachment-data}]
            (conj processed (if (:blocks attachment-data)
                              attachment-data
                              (if (:render/text rendered-info)
                                {:blocks [{:type "section"
                                           :text {:type "mrkdwn"
                                                  :text (format "<%s|%s>" title_link title)}}
                                          {:type "section"
                                           :text {:type "plain_text"
                                                  :text (:render/text rendered-info)}}]}
                                (let [image-bytes   (channel.render/png-from-render-info rendered-info slack-width)
                                      {file-id :id} (slack/upload-file! image-bytes attachment-name)]
                                  {:blocks [{:type "section"
                                             :text {:type "mrkdwn"
                                                    :text (format "<%s|%s>" title_link title)}}
                                            {:type "image"
                                             :slack_file {:id file-id}
                                             :alt_text title}]})))))
          []
          attachments))

(def ^:private SlackMessage
  [:map {:closed true}
   [:channel-id                   :string]
   ;; TODO: tighten this attachments schema
   [:attachments                  :any]
   [:message     {:optional true} [:maybe :string]]])

(mu/defmethod channel/send! :channel/slack
  [_channel message :- SlackMessage]
  (let [{:keys [channel-id attachments]} message]
    (slack/post-chat-message! channel-id nil (create-and-upload-slack-attachments! attachments))))

;; ------------------------------------------------------------------------------------------------;;
;;                                      Notification Card                                          ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/slack :notification/card] :- [:sequential SlackMessage]
  [_channel-type {:keys [payload]} _template recipients]
  (let [attachments [{:blocks [{:type "header"
                                :text {:type "plain_text"
                                       :text (str "🔔 " (-> payload :card :name))
                                       :emoji true}}]}
                     (part->attachment-data (:card_part payload) (slack/files-channel))]]
    (for [channel-id (map notification-recipient->channel-id recipients)]
      {:channel-id  channel-id
       :attachments attachments})))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Dashboard Subscriptions                                      ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- filter-text
  [filter]
  (truncate-mrkdwn
   (format "*%s*\n%s" (:name filter) (shared.params/value-string filter (public-settings/site-locale)))
   attachment-text-length-limit))

(defn- slack-dashboard-header
  "Returns a block element that includes a dashboard's name, creator, and filters, for inclusion in a
  Slack dashboard subscription"
  [dashboard creator-name parameters]
  (let [header-section  {:type "header"
                         :text {:type "plain_text"
                                :text (:name dashboard)
                                :emoji true}}
        link-section    {:type "section"
                         :fields [{:type "mrkdwn"
                                   :text (format "<%s | *Sent from %s by %s*>"
                                                 (urls/dashboard-url (:id dashboard) parameters)
                                                 (public-settings/site-name)
                                                 creator-name)}]}
        filter-fields   (for [filter parameters]
                          {:type "mrkdwn"
                           :text (filter-text filter)})
        filter-section  (when (seq filter-fields)
                          {:type   "section"
                           :fields filter-fields})]
    {:blocks (filter some? [header-section filter-section link-section])}))

(defn- create-slack-attachment-data
  "Returns a seq of slack attachment data structures, used in `create-and-upload-slack-attachments!`"
  [parts]
  (let [channel-id (slack/files-channel)]
    (for [part  parts
          :let  [attachment (part->attachment-data (channel.shared/realize-data-rows part) channel-id)]
          :when attachment]
      attachment)))

(mu/defmethod channel/render-notification [:channel/slack :notification/dashboard] :- [:sequential SlackMessage]
  [_channel-type {:keys [payload creator]} _template recipients]
  (let [parameters (:parameters payload)
        dashboard  (:dashboard payload)]
    (for [channel-id (map notification-recipient->channel-id recipients)]
      {:channel-id  channel-id
       :attachments (doall (remove nil?
                                   (flatten [(slack-dashboard-header dashboard (:common_name creator) parameters)
                                             (create-slack-attachment-data (:dashboard_parts payload))])))})))
