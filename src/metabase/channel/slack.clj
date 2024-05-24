(ns metabase.channel.slack
  (:require
   [clojure.string :as str]
   [metabase.channel.interface :as channel.interface]
   [metabase.integrations.slack :as slack]
   [metabase.pulse.markdown :as markdown]
   [metabase.pulse.render :as render]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.urls :as urls]
   [toucan2.core :as t2]))

(defn- database-id [card]
  (or (:database_id card)
      (get-in card [:dataset_query :database])))

(mu/defn defaulted-timezone :- :string
  "Returns the timezone ID for the given `card`. Either the report timezone (if applicable) or the JVM timezone."
  [card :- (ms/InstanceOf :model/Card)]
  (or (some->> card database-id (t2/select-one :model/Database :id) qp.timezone/results-timezone-id)
      (qp.timezone/system-timezone-id)))

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
    (let [{:keys [card dashcard result]}          part
          {card-id :id card-name :name :as card} card]
      {:title           (or (-> dashcard :visualization_settings :card.title)
                            card-name)
       :rendered-info   (render/render-pulse-card :inline (defaulted-timezone card) card dashcard result)
       :title_link      (urls/card-url card-id)
       :attachment-name "image.png"
       :channel-id      channel-id
       :fallback        card-name})

    :text
    (text->markdown-block (:text part))

    :tab-title
    (text->markdown-block (format "# %s" (:text part)))))

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


(defmethod channel.interface/send-notification! [:slack :alert]
  [_channel _notificaiton-type recipients payload]
  (doseq [channel-id recipients]
    (let [attachments [{:blocks [{:type "header"
                                  :text {:type "plain_text"
                                         :text (str "🔔 " (-> payload :card :name))
                                         :emoji true}}]}
                       (part->attachment-data (assoc payload :type :card) channel-id)]
          attachments (create-and-upload-slack-attachments! attachments)]
      (slack/post-chat-message! channel-id nil attachments))))
