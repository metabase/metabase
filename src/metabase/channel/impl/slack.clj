(ns metabase.channel.impl.slack
  (:require
   [clojure.string :as str]
   [metabase.appearance.core :as appearance]
   [metabase.channel.core :as channel]
   [metabase.channel.impl.util :as impl.util]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.shared :as channel.shared]
   [metabase.channel.slack :as slack]
   [metabase.channel.urls :as urls]
   [metabase.parameters.shared :as shared.params]
   [metabase.premium-features.core :as premium-features]
   [metabase.system.core :as system]
   [metabase.util.malli :as mu]
   [metabase.util.markdown :as markdown]))

(defn- notification-recipient->channel-id
  [notification-recipient]
  (when (= (:type notification-recipient) :notification-recipient/raw-value)
    (-> notification-recipient :details :value)))

(defn- escape-mkdwn
  "Escapes slack mkdwn special characters in the string, as specified here:
  https://api.slack.com/reference/surfaces/formatting."
  [s]
  (-> s
      (str/replace "&" "&amp;")
      (str/replace "<" "&lt;")
      (str/replace ">" "&gt;")))

(defn- truncate
  "If a string is greater than Slack's length limit, truncates it to fit the limit and
  adds an ellipsis character to the end."
  [mrkdwn limit]
  (if (> (count mrkdwn) limit)
    (-> mrkdwn
        (subs 0 (dec limit))
        (str "…"))
    mrkdwn))

(def header-text-limit       "Header block character limit"    150)
(def block-text-length-limit "Section block character limit"   3000)
(def ^:private attachment-text-length-limit                    2000)

(defn- parameter-markdown
  [parameter]
  (truncate
   (format "*%s*\n%s" (:name parameter) (shared.params/value-string parameter (system/site-locale)))
   attachment-text-length-limit))

(defn- maybe-append-params-block
  "Appends an inline parameters block to a collection of blocks if parameters exist."
  [blocks inline-parameters]
  (if (seq inline-parameters)
    (conj blocks {:type "section"
                  :fields (mapv
                           (fn [parameter]
                             {:type "mrkdwn"
                              :text (parameter-markdown parameter)})
                           inline-parameters)})
    blocks))

(defn- text->markdown-block
  ([text]
   (text->markdown-block text nil))

  ([text inline-parameters]
   (let [mrkdwn (markdown/process-markdown text :slack)]
     (when (not (str/blank? mrkdwn))
       {:blocks
        (maybe-append-params-block
         [{:type "section"
           :text {:type "mrkdwn"
                  :text (truncate mrkdwn block-text-length-limit)}}]
         inline-parameters)}))))

(defn- part->attachment-data
  [part]
  (let [part (channel.shared/maybe-realize-data-rows part)]
    (case (:type part)
      :card
      (let [{:keys [card dashcard result]}         part
            {card-id :id card-name :name :as card} card]
        {:title             (or (-> dashcard :visualization_settings :card.title)
                                card-name)
         :inline-parameters (-> dashcard :visualization_settings :inline_parameters)
         :rendered-info     (channel.render/render-pulse-card :inline (channel.render/defaulted-timezone card) card dashcard result)
         :title_link        (urls/card-url card-id)
         :attachment-name   "image.png"
         :fallback          card-name})

      :text
      (text->markdown-block (:text part) (:inline_parameters part))

      :heading
      (text->markdown-block (format "## %s" (:text part)) (:inline_parameters part))

      :tab-title
      (text->markdown-block (format "# %s" (:text part))))))

(def ^:private slack-width
  "Maximum width of the rendered PNG of HTML to be sent to Slack. Content that exceeds this width (e.g. a table with
  many columns) is truncated."
  1200)

(defn- mkdwn-link-text [url label]
  (let [url-length       (count url)
        const-length     3
        max-label-length (- block-text-length-limit url-length const-length)
        label' (escape-mkdwn label)]
    (if (< max-label-length 10)
      (truncate (str "(URL exceeds slack limits) " label') block-text-length-limit)
      (format "<%s|%s>" url (truncate label' max-label-length)))))

(defn- create-and-upload-slack-attachment!
  "Create an attachment in Slack for a given Card by rendering its content into an image and uploading it.
  Attachments containing `:blocks` lists containing text cards are returned unmodified."
  [{:keys [title title_link attachment-name rendered-info blocks inline-parameters] :as attachment-data}]
  (cond
    blocks attachment-data

    (:render/text rendered-info)
    {:blocks
     (-> [{:type "section"
           :text {:type     "mrkdwn"
                  :text     (mkdwn-link-text title_link title)
                  :verbatim true}}]
         (maybe-append-params-block inline-parameters)
         (conj {:type "section"
                :text {:type "plain_text"
                       :text (:render/text rendered-info)}}))}

    :else
    (let [image-bytes   (channel.render/png-from-render-info rendered-info slack-width)
          {file-id :id} (slack/upload-file! image-bytes attachment-name)]
      {:blocks
       (-> [{:type "section"
             :text {:type     "mrkdwn"
                    :text     (mkdwn-link-text title_link title)
                    :verbatim true}}]
           (maybe-append-params-block inline-parameters)
           (conj {:type       "image"
                  :slack_file {:id file-id}
                  :alt_text   title}))})))

(def ^:private SlackMessage
  [:map {:closed true}
   [:channel-id                   :string]
   ;; TODO: tighten this attachments schema
   [:attachments                  :any]
   [:message     {:optional true} [:maybe :string]]])

(mu/defmethod channel/send! :channel/slack
  [_channel message :- SlackMessage]
  (let [{:keys [channel-id attachments]} message
        message-content (mapv create-and-upload-slack-attachment! attachments)
        blocks (mapcat :blocks message-content)]
    (doseq [block-chunk (partition-all 50 blocks)]
      (slack/post-chat-message! channel-id nil [{:blocks block-chunk}]))))

;; ------------------------------------------------------------------------------------------------;;
;;                                      Notification Card                                          ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/slack :notification/card] :- [:sequential SlackMessage]
  [_channel-type {:keys [payload]} _template recipients]
  (let [attachments [{:blocks [{:type "header"
                                :text {:type "plain_text"
                                       :text (truncate (str "🔔 " (-> payload :card :name)) header-text-limit)
                                       :emoji true}}]}
                     (part->attachment-data (:card_part payload))]]
    (for [channel-id (map notification-recipient->channel-id recipients)]
      {:channel-id  channel-id
       :attachments attachments})))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Dashboard Subscriptions                                      ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- include-branding?
  "Branding in exports is included only for instances that do not have a whitelabel feature flag."
  []
  (not (premium-features/enable-whitelabeling?)))

(defn- slack-dashboard-header
  "Returns a block element that includes a dashboard's name, creator, and filters, for inclusion in a
  Slack dashboard subscription"
  [dashboard creator-name all-params top-level-params]
  (let [header-section  {:type "header"
                         :text {:type "plain_text"
                                :text (truncate (:name dashboard) header-text-limit)
                                :emoji true}}
        link-section    {:type "section"
                         :fields (cond-> [{:type "mrkdwn"
                                           :text (mkdwn-link-text
                                                  (urls/dashboard-url (:id dashboard) all-params)
                                                  (format "*Sent from %s by %s*"
                                                          (appearance/site-name)
                                                          creator-name))}]
                                   (include-branding?)
                                   (conj
                                    {:type "mrkdwn"
                                     :text  "Made with Metabase :blue_heart:"}))}
        filter-fields   (for [parameter top-level-params]
                          {:type "mrkdwn"
                           :text (parameter-markdown parameter)})
        filter-section  (when (seq filter-fields)
                          {:type   "section"
                           :fields filter-fields})]
    {:blocks (filter some? [header-section filter-section link-section])}))

(defn- create-slack-attachment-data
  "Returns a seq of slack attachment data structures, used in `create-and-upload-slack-attachments!`"
  [parts]
  (for [part  parts
        :let  [attachment (part->attachment-data part)]
        :when attachment]
    attachment))

(mu/defmethod channel/render-notification [:channel/slack :notification/dashboard] :- [:sequential SlackMessage]
  [_channel-type {:keys [payload creator]} _template recipients]
  (let [all-params       (:parameters payload)
        top-level-params (impl.util/remove-inline-parameters all-params (:dashboard_parts payload))
        dashboard  (:dashboard payload)]
    (for [channel-id (map notification-recipient->channel-id recipients)]
      {:channel-id  channel-id
       :attachments (doall (remove nil?
                                   (flatten [(slack-dashboard-header dashboard (:common_name creator) all-params top-level-params)
                                             (create-slack-attachment-data (:dashboard_parts payload))])))})))
