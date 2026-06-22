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
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.markdown :as markdown]))

(defn- notification-recipient->channel
  "Returns the Slack channel target for a raw-value notification recipient.
  Prefers the immutable `:channel_id` (e.g. \"C0ABC123\") over the display `:value`
  (e.g. \"#my-channel\") so that delivery survives channel renames. Falls back to
  `:value` for legacy subscriptions that pre-date channel ID storage."
  [notification-recipient]
  (when (= (:type notification-recipient) :notification-recipient/raw-value)
    (let [details (:details notification-recipient)]
      (or (:channel_id details) (:value details)))))

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
  ([part]
   (part->sections! {} part))
  ([all-params part]
   (let [part (channel.shared/maybe-realize-data-rows part)]
     (case (:type part)
       :card
       (binding [urls/*dashcard-parameters* all-params]
         (let [{:keys [card dashcard result]}         part
               {card-id :id card-name :name :as card} card
               title                                  (or (-> dashcard :visualization_settings :card.title)
                                                          card-name)
               rendered-info                          (channel.render/render-pulse-card :inline (channel.render/defaulted-timezone card) card dashcard result)
               title-link                             (if dashcard
                                                        (urls/dashcard-url dashcard)
                                                        (when-not (= :table-editable (:display card))
                                                          (urls/card-url card-id)))]
           (conj (maybe-append-params-block
                  [{:type "section"
                    :text {:type     "mrkdwn"
                           :text     (mkdwn-link-text title-link title)
                           :verbatim true}}]
                  (-> dashcard  :visualization_settings :inline_parameters))
                 (if (:render/text rendered-info)
                   {:type "section"
                    :text {:type "plain_text"
                           :text (:render/text rendered-info)}}
                   {:type       "image"
                    :slack_file {:id (-> rendered-info
                                         (channel.render/png-from-render-info slack-width)
                                         (slack/upload-file! (format "%s.png" title))
                                         :id)}
                    :alt_text   title}))))

       :heading
       [(maybe-append-params-block (text->markdown-section (format "## %s" (:text part))) (:inline_parameters part))]

       :text
       [(maybe-append-params-block (text->markdown-section (:text part)) (:inline_parameters part))]

       :tab-title
       [(text->markdown-section (format "# %s" (:text part)))]))))

(def ^:private SlackMessage
  [:map {:closed true}
   [:channel              :string]
   [:blocks               [:sequential :map]]
   [:pdf {:optional true} [:maybe [:map
                                   [:bytes                 bytes?]
                                   [:filename              :string]
                                   [:comment {:optional true} [:maybe :string]]]]]])

(mu/defmethod channel/send! :channel/slack
  [_channel {:keys [channel blocks pdf]} :- SlackMessage]
  (doseq [block-chunk (partition-all 50 blocks)]
    (slack/post-chat-message! {:channel channel :blocks block-chunk}))
  (when pdf
    ;; Share the PDF as one message (its caption is the file's `initial_comment`); on failure, post just the caption.
    (try
      (slack/upload-file-to-channel! (:bytes pdf) (:filename pdf) channel (:comment pdf))
      (catch Throwable e
        (log/error e "Error sharing dashboard subscription PDF to Slack; posting summary without the PDF")
        (when-let [comment (:comment pdf)]
          (slack/post-chat-message! {:channel channel :text comment}))))))

;; ------------------------------------------------------------------------------------------------;;
;;                                    System Event Notifications                                   ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/slack :notification/system-event] :- [:sequential SlackMessage]
  [_channel-type {:keys [payload]} {:keys [recipients]}]
  (let [{:keys [event_topic event_info custom]} payload
        blocks (case event_topic
                 :event/security-advisory-match
                 (let [{:keys [title description severity]} (:object event_info)
                       severity-emoji (case severity
                                        :critical ":red_circle:"
                                        :high     ":large_orange_circle:"
                                        :medium   ":large_yellow_circle:"
                                        :low      ":large_blue_circle:")]
                   [{:type "header"
                     :text {:type  "plain_text"
                            :text  (truncate (str severity-emoji " Security Advisory: " title) header-text-limit)
                            :emoji true}}
                    {:type "section"
                     :text {:type "mrkdwn"
                            :text (truncate (escape-mkdwn description) block-text-length-limit)}}
                    {:type "section"
                     :fields [{:type "mrkdwn" :text (str "*Severity:* " (:severity_label custom))}
                              {:type "mrkdwn" :text (str "*Status:* " (:status_label custom))}]}
                    {:type "actions"
                     :elements [{:type "button"
                                 :text {:type "plain_text" :text "View in Security Center"}
                                 :url  (:security_center_url custom)}]}])
                 ;; fallback for other system events: simple text block
                 [{:type "section"
                   :text {:type "mrkdwn"
                          :text (truncate (str "System event: " (name event_topic)) block-text-length-limit)}}])]
    (doall (for [channel (keep notification-recipient->channel recipients)]
             {:channel channel
              :blocks  blocks}))))

;; ------------------------------------------------------------------------------------------------;;
;;                                      Notification Card                                          ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/slack :notification/card] :- [:sequential SlackMessage]
  [_channel-type {:keys [payload]} {:keys [recipients]}]
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
    (filter some? [header-section filter-section link-section])))

(defn- slack-dashboard-caption
  "A plain mrkdwn caption (dashboard title, link, and filters) used as the PDF file's `initial_comment`, so the title
  and the PDF arrive as a single Slack message rather than two."
  [dashboard creator-name all-params top-level-params]
  (str/join "\n"
            (concat
             [(format "*%s*" (:name dashboard))
              (mkdwn-link-text (urls/dashboard-url (:id dashboard) all-params)
                               (format "Sent from %s by %s" (appearance/site-name) creator-name))]
             (for [parameter top-level-params]
               (parameter-markdown parameter)))))

(defn- dashboard-pdf
  "Render the whole dashboard to a PDF for Slack, returning `{:bytes ... :filename ...}` or `nil` if rendering fails."
  [dashboard creator-id parameters]
  (try
    (let [pdf-bytes (channel.render/render-dashboard-to-pdf (:id dashboard) creator-id (vec parameters))]
      {:bytes    pdf-bytes
       :filename (-> dashboard
                     (some-> :name str/trim)
                     not-empty
                     (or "dashboard")
                     (str ".pdf"))})
    (catch Throwable e
      (log/error e "Error rendering dashboard subscription PDF for Slack; skipping PDF attachment")
      nil)))

(mu/defmethod channel/render-notification [:channel/slack :notification/dashboard] :- [:sequential SlackMessage]
  [_channel-type {:keys [payload creator creator_id]} {:keys [recipients include_pdf]}]
  (let [all-params       (:parameters payload)
        top-level-params (impl.util/remove-inline-parameters all-params (:dashboard_parts payload))
        dashboard        (:dashboard payload)
        pdf              (some-> (when include_pdf (dashboard-pdf dashboard creator_id all-params))
                                 (assoc :comment (slack-dashboard-caption dashboard (:common_name creator)
                                                                          all-params top-level-params)))
        blocks           (if pdf
                           ;; PDF sends as a single file message (caption set in `send!`); skip the chart-image blocks.
                           []
                           (->> [(slack-dashboard-header dashboard (:common_name creator) all-params top-level-params)
                                 ;; Isolate each part: rendering one part (e.g. realizing its Hiccup into a PNG)
                                 ;; must not abort the whole subscription. On failure, substitute an error
                                 ;; placeholder block so the remaining cards still deliver (#74007).
                                 (mapcat (fn [part]
                                           (try
                                             (part->sections! all-params part)
                                             (catch Throwable e
                                               (log/error e "Error rendering dashboard subscription part for Slack; substituting error placeholder")
                                               [(text->markdown-section (str (tru "An error occurred while displaying this card.")))])))
                                         (:dashboard_parts payload))]
                                flatten
                                (remove nil?)))]
    (for [channel-id (map notification-recipient->channel recipients)]
      (cond-> {:channel channel-id
               :blocks  blocks}
        pdf (assoc :pdf pdf)))))
