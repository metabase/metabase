(ns metabase.channel.impl.slack
  (:require
   [clojure.string :as str]
   [metabase.channel.core :as channel]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.shared :as channel.shared]
   [metabase.channel.slack :as slack]
   [metabase.channel.template.core :as channel.template]
   [metabase.models.params.shared :as shared.params]
   [metabase.settings.deprecated-grab-bag :as public-settings]
   [metabase.util.malli :as mu]
   [metabase.util.markdown :as markdown]
   [metabase.util.urls :as urls]))

(defn- notification-recipient->channel
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

(def header-text-limit       "Header block character limit"  150)
(def block-text-length-limit "Section block character limit" 3000)
(def ^:private attachment-text-length-limit                  2000)

(defn- text->markdown-section
  [text]
  (let [mrkdwn (markdown/process-markdown text :slack)]
    (when (not (str/blank? mrkdwn))
      {:type "section"
       :text {:type "mrkdwn"
              :text (truncate mrkdwn block-text-length-limit)}})))

(defn- mkdwn-link-text [url label]
  (if url
    (let [url-length       (count  url)
          const-length     3
          max-label-length (- block-text-length-limit url-length const-length)
          label' (escape-mkdwn label)]
      (if (< max-label-length 10)
        (truncate (str "(URL exceeds slack limits) " label') block-text-length-limit)
        (format "<%s|%s>" url (truncate label' max-label-length))))
    label))

(def ^:private slack-width
  "Maximum width of the rendered PNG of HTML to be sent to Slack. Content that exceeds this width (e.g. a table with
  many columns) is truncated."
  1200)

(defn- part->sections!
  "Converts a notification part directly into Slack Block Kit blocks."
  [part]
  (let [part (channel.shared/maybe-realize-data-rows part)]
    (case (:type part)
      :card
      (let [{:keys [card dashcard result]}         part
            {card-id :id card-name :name :as card} card
            title                                  (or (-> dashcard :visualization_settings :card.title)
                                                       card-name)
            rendered-info                          (channel.render/render-pulse-card :inline (channel.render/defaulted-timezone card) card dashcard result)
            title-link                             (when-not (= :table-editable (:display card))
                                                     (urls/card-url card-id))]
        (conj [{:type "section"
                :text {:type     "mrkdwn"
                       :text     (mkdwn-link-text title-link title)
                       :verbatim true}}]
              (if (:render/text rendered-info)
                {:type "section"
                 :text {:type "plain_text"
                        :text (:render/text rendered-info)}}
                {:type       "image"
                 :slack_file {:id (-> rendered-info
                                      (channel.render/png-from-render-info slack-width)
                                      (slack/upload-file! (format "%s.png" title))
                                      :id)}
                 :alt_text   title})))

      :text
      [(text->markdown-section (:text part))]

      :tab-title
      [(text->markdown-section (format "# %s" (:text part)))])))

(def ^:private SlackMessage
  [:map {:closed true}
   [:channel :string]
   [:blocks  [:sequential :map]]])

(mu/defmethod channel/send! :channel/slack
  [_channel {:keys [channel blocks]} :- SlackMessage]
  (doseq [block-chunk (partition-all 50 blocks)]
    (slack/post-chat-message! {:channel channel :blocks block-chunk})))

;; ------------------------------------------------------------------------------------------------;;
;;                                      Notification Card                                          ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/slack :notification/card] :- [:sequential SlackMessage]
  [_channel-type _payload-type {:keys [payload]} _template recipients]
  (let [blocks (concat [{:type "header"
                         :text {:type "plain_text"
                                :text (truncate (str "🔔 " (-> payload :card :name)) header-text-limit)
                                :emoji true}}]
                       (part->sections! (:card_part payload)))]
    (doall (for [channel (map notification-recipient->channel recipients)]
             {:channel channel
              :blocks  blocks}))))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Dashboard Subscriptions                                      ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- filter-text
  [filter]
  (truncate
   (format "*%s*\n%s" (:name filter) (shared.params/value-string filter (public-settings/site-locale)))
   attachment-text-length-limit))

(defn- slack-dashboard-header
  "Returns a block element that includes a dashboard's name, creator, and filters, for inclusion in a
  Slack dashboard subscription"
  [dashboard creator-name parameters]
  (let [header-section  {:type "header"
                         :text {:type "plain_text"
                                :text (truncate (:name dashboard) header-text-limit)
                                :emoji true}}
        link-section    {:type "section"
                         :fields [{:type "mrkdwn"
                                   :text (mkdwn-link-text
                                          (urls/dashboard-url (:id dashboard) parameters)
                                          (format "*Sent from %s by %s*"
                                                  (public-settings/site-name)
                                                  creator-name))}]}
        filter-fields   (for [filter parameters]
                          {:type "mrkdwn"
                           :text (filter-text filter)})
        filter-section  (when (seq filter-fields)
                          {:type   "section"
                           :fields filter-fields})]
    (filter some? [header-section filter-section link-section])))

(mu/defmethod channel/render-notification [:channel/slack :notification/dashboard] :- [:sequential SlackMessage]
  [_channel-type _payload-type {:keys [payload creator]} _template recipients]
  (let [parameters (:parameters payload)
        dashboard  (:dashboard payload)
        blocks     (->> [(slack-dashboard-header dashboard (:common_name creator) parameters)
                         (mapcat part->sections! (:dashboard_parts payload))]
                        flatten
                        (remove nil?))]
    (for [channel-id (map notification-recipient->channel recipients)]
      {:channel channel-id
       :blocks  blocks})))

;; ------------------------------------------------------------------------------------------------;;
;;                                           System Event                                          ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/slack :notification/system-event] :- [:sequential SlackMessage]
  [channel-type _payload-type {:keys [context] :as notification-payload} template recipients]
  (let [event-name (:event_name context)
        template   (or template
                       (channel.template/default-template :notification/system-event context channel-type))
        sections    [(text->markdown-section (channel.template/render-template template notification-payload))]]
    (assert template (str "No template found for event " event-name))
    (for [channel (map notification-recipient->channel recipients)]
      {:channel channel
       :blocks  sections})))
