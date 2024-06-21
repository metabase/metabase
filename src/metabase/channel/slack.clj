(ns metabase.channel.slack
  (:require
   [clojure.string :as str]
   [metabase.channel.core :as channel]
   [metabase.channel.shared :as channel.shared]
   ;; TODO: integrations.slack should be migrated to channel.slack
   [metabase.integrations.slack :as slack]
   [metabase.public-settings :as public-settings]
   [metabase.pulse.markdown :as markdown]
   [metabase.pulse.parameters :as pulse-params]
   [metabase.pulse.render :as render]
   [metabase.util.malli :as mu]
   [metabase.util.urls :as urls]))

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

(defn- payload->attachment-data
  [payload channel-id]
  (case (:type payload)
    :card
    (let [{:keys [card dashcard result]}         payload
          {card-id :id card-name :name :as card} card]
      {:title           (or (-> dashcard :visualization_settings :card.title)
                            card-name)
       :rendered-info   (render/render-pulse-card :inline (channel.shared/defaulted-timezone card) card dashcard result)
       :title_link      (urls/card-url card-id)
       :attachment-name "image.png"
       :channel-id      channel-id
       :fallback        card-name})

    :text
    (text->markdown-block (:text payload))

    :tab-title
    (text->markdown-block (format "# %s" (:text payload)))))

(def slack-width
  "Maximum width of the rendered PNG of HTML to be sent to Slack. Content that exceeds this width (e.g. a table with
  many columns) is truncated."
  1200)

(defn create-and-upload-slack-attachments!
  "Create an attachment in Slack for a given Card by rendering its content into an image and uploading
  it. Slack-attachment-uploader is a function which takes image-bytes and an attachment name, uploads the file, and
  returns an image url, defaulting to slack/upload-file!.

  Nested `blocks` lists containing text cards are passed through unmodified."
  [attachments]
  (letfn [(f [a] (select-keys a [:title :title_link :fallback]))]
    (reduce (fn [processed {:keys [rendered-info attachment-name channel-id] :as attachment-data}]
              (conj processed (if (:blocks attachment-data)
                                attachment-data
                                (if (:render/text rendered-info)
                                  (-> (f attachment-data)
                                      (assoc :text (:render/text rendered-info)))
                                  (let [image-bytes (render/png-from-render-info rendered-info slack-width)
                                        image-url   (slack/upload-file! image-bytes attachment-name channel-id)]
                                    (-> (f attachment-data)
                                        (assoc :image_url image-url)))))))
            []
            attachments)))

(def ^:private SlackMessage
  [:map {:closed true}
   [:channel-id                   :string]
   ;; TODO: tighten this attachments schema
   [:attachments                  :any]
   [:message     {:optional true} [:maybe :string]]])

(mu/defmethod channel/send! :channel/slack
  [_channel-type message :- SlackMessage]
  (let [{:keys [channel-id attachments]} message]
    (slack/post-chat-message! channel-id nil (create-and-upload-slack-attachments! attachments))))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Alerts                                                ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/slack :notification/alert] :- [:sequential SlackMessage]
  [_channel-details {:keys [payload card]} channel-ids]
  (let [attachments [{:blocks [{:type "header"
                                :text {:type "plain_text"
                                       :text (str "🔔 " (:name card))
                                       :emoji true}}]}
                     (payload->attachment-data payload (slack/files-channel))]]
    (for [channel-id channel-ids]
      {:channel-id  channel-id
       :attachments attachments})))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Dashboard Subscriptions                                      ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- filter-text
  [filter]
  (truncate-mrkdwn
   (format "*%s*\n%s" (:name filter) (pulse-params/value-string filter))
   attachment-text-length-limit))

(defn- slack-dashboard-header
  "Returns a block element that includes a dashboard's name, creator, and filters, for inclusion in a
  Slack dashboard subscription"
  [pulse dashboard]
  (let [header-section  {:type "header"
                         :text {:type "plain_text"
                                :text (:name dashboard)
                                :emoji true}}
        creator-section {:type   "section"
                         :fields [{:type "mrkdwn"
                                   :text (str "Sent by " (-> pulse :creator :common_name))}]}
        filters         (pulse-params/parameters pulse dashboard)
        filter-fields   (for [filter filters]
                          {:type "mrkdwn"
                           :text (filter-text filter)})
        filter-section  (when (seq filter-fields)
                          {:type   "section"
                           :fields filter-fields})]
    (if filter-section
      {:blocks [header-section filter-section creator-section]}
      {:blocks [header-section creator-section]})))

(defn- slack-dashboard-footer
  "Returns a block element with the footer text and link which should be at the end of a Slack dashboard subscription."
  [pulse dashboard]
  {:blocks
   [{:type "divider"}
    {:type "context"
     :elements [{:type "mrkdwn"
                 :text (str "<" (pulse-params/dashboard-url (:id dashboard) (pulse-params/parameters pulse dashboard)) "|"
                            "*Sent from " (public-settings/site-name) "*>")}]}]})

(defn- create-slack-attachment-data
  "Returns a seq of slack attachment data structures, used in `create-and-upload-slack-attachments!`"
  [parts]
  (let [channel-id (slack/files-channel)]
    (for [part  parts
          :let  [attachment (payload->attachment-data part channel-id)]
          :when attachment]
      attachment)))

(mu/defmethod channel/render-notification [:channel/slack :notification/dashboard-subscription] :- [:sequential SlackMessage]
  [_channel-type {:keys [payload dashboard pulse]} channel-ids]
  (for [channel-id channel-ids]
    {:channel-id  channel-id
     :attachments (remove nil?
                          (flatten [(slack-dashboard-header pulse dashboard)
                                    (create-slack-attachment-data payload)
                                    (slack-dashboard-footer pulse dashboard)]))}))
