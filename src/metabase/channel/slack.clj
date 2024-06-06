(ns metabase.channel.slack
  (:require
   [clojure.string :as str]
   [metabase.channel.core :as channel]
   ;; TODO: integrations.slack should be migrated to channel.slack
   [metabase.integrations.slack :as slack]
   [metabase.public-settings :as public-settings]
   [metabase.pulse.markdown :as markdown]
   [metabase.pulse.parameters :as pulse-params]
   [metabase.pulse.render :as render]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.urls :as urls]
   [toucan2.core :as t2]))

(channel/register! :channel/slack)

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
       :rendered-info   (render/render-pulse-card :inline (defaulted-timezone card) card dashcard result)
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

;; ------------------------------------------------------------------------------------------------;;
;;                                           Alerts                                                ;;
;; ------------------------------------------------------------------------------------------------;;

(defmethod channel/deliver! [:channel/slack :notification/alert]
  [_channel-details payload recipients _template]
  (doseq [{channel-id :recipient} recipients]
    (let [{:keys [card]} payload
          channel-id     (str/replace channel-id "#" "")
          attachments    [{:blocks [{:type "header"
                                     :text {:type "plain_text"
                                            :text (str "🔔 " (:name card))
                                            :emoji true}}]}
                          (payload->attachment-data (assoc payload :type :card) channel-id)]]
      (slack/post-chat-message! channel-id nil (create-and-upload-slack-attachments! attachments)))))

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

(defmethod channel/deliver! [:channel/slack :notification/dashboard-subscription]
  [_channel-details payload recipients _template]
  (let [{:keys [dashboard
                dashboard-subscription]} payload
        attachments                      (remove nil?
                                                 (flatten [(slack-dashboard-header dashboard-subscription dashboard)
                                                           (create-slack-attachment-data (:result payload))
                                                           (when dashboard (slack-dashboard-footer dashboard-subscription dashboard))]))
        uploaded-attachments             (create-and-upload-slack-attachments! attachments)]
    (doseq [{channel-id :recipient} recipients]
      (slack/post-chat-message! channel-id nil uploaded-attachments))))
