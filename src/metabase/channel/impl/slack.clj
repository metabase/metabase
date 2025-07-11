(ns metabase.channel.impl.slack
  (:require
   [clojure.string :as str]
   [metabase.appearance.core :as appearance]
   [metabase.channel.core :as channel]
   [metabase.channel.impl.util :as impl.util]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.shared :as channel.shared]
   [metabase.channel.slack :as slack]
   [metabase.channel.template.core :as channel.template]
   [metabase.channel.urls :as urls]
   [metabase.lib.util.match :as lib.util.match]
   [metabase.parameters.shared :as shared.params]
   [metabase.premium-features.core :as premium-features]
   [metabase.system.core :as system]
   [metabase.util.malli :as mu]
   [metabase.util.malli.registry :as mr]
   [metabase.util.markdown :as markdown]))

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

(defn- text->markdown-sections
  ([text]
   (text->markdown-sections text nil))
  ([text inline-parameters]
   (let [mrkdwn (markdown/process-markdown text :slack)]
     (when (not (str/blank? mrkdwn))
       (maybe-append-params-block
        [{:type "section"
          :text {:type "mrkdwn"
                 :text (truncate mrkdwn block-text-length-limit)}}]
        inline-parameters)))))

(defn- mkdwn-link-text [url label]
  (if url
    (let [url-length       (count  url)
          const-length     3
          max-label-length (- block-text-length-limit url-length const-length)
          label'           (escape-mkdwn label)]
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
  [part & {:keys [card-url-text]}]
  (let [part (channel.shared/maybe-realize-data-rows part)]
    (maybe-append-params-block
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
                 :text {:type "mrkdwn"
                        :text (or card-url-text (mkdwn-link-text title-link title))}}]
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
       (text->markdown-sections (:text part))

       :heading
       (text->markdown-sections (format "## %s" (:text part)))

       :tab-title
       (text->markdown-sections (format "# %s" (:text part))))
     (:inline_parameters part))))

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

(mr/def ::notification.card.template.context
  [:map {:closed true}
   [:creator [:map {:closed true}
              [:first_name [:maybe :string]]
              [:last_name [:maybe :string]]
              [:email :string]
              [:common_name [:maybe :string]]]]
   [:card [:map {:closed true}
           [:id pos-int?]
           [:name :string]]]
   [:rows [:sequential [:map-of :string :any]]]])

(mu/defmethod channel/template-context [:channel/slack :notification/card] :- ::notification.card.template.context
  [_channel-type _notification-type notification-payload]
  (lib.util.match/match-one
    notification-payload
    {:creator ?creator
     :payload {:card_part {:card {:id   ?card_id
                                  :name ?card_name}
                           :result {:data {:cols ?result_cols
                                           :rows ?result_rows}}}}}
    {:creator  (select-keys ?creator [:first_name :last_name :email :common_name])
     :card     {:id   ?card_id
                :name ?card_name}
     :rows     (let [col-names (map :name ?result_cols)]
                 (vec (for [row ?result_rows]
                        (zipmap col-names row))))}))

(mu/defmethod channel/render-notification [:channel/slack :notification/card] :- [:sequential SlackMessage]
  [channel-type payload-type {:keys [payload] :as notification-payload} template recipients]
  ;; for alerts, we allow users to template the url card part only
  (let [link-template (or template
                          (channel.template/default-template :notification/card nil channel-type))
        _             (assert link-template "No template found")
        card-url-text (some->> (update-in notification-payload [:payload :card_part] channel.shared/maybe-realize-data-rows)
                               (channel/template-context channel-type payload-type)
                               (channel.template/render-template link-template))
        blocks        (concat [{:type "header"
                                :text {:type "plain_text"
                                       :text (truncate (str "🔔 " (-> payload :card :name)) header-text-limit)
                                       :emoji true}}]
                              (part->sections! (:card_part payload) :card-url-text card-url-text))]
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

(mu/defmethod channel/render-notification [:channel/slack :notification/dashboard] :- [:sequential SlackMessage]
  [_channel-type _payload-type {:keys [payload creator]} _template recipients]
  (let [all-params       (:parameters payload)
        top-level-params (impl.util/remove-inline-parameters all-params (:dashboard_parts payload))
        dashboard  (:dashboard payload)
        blocks     (->> [(slack-dashboard-header dashboard (:common_name creator) all-params top-level-params)
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
        sections    [{:type "section"
                      :text {:type "mrkdwn"
                             :text (truncate
                                    (channel.template/render-template template notification-payload)
                                    block-text-length-limit)}}]]
    (assert template (str "No template found for event " event-name))
    (for [channel (map notification-recipient->channel recipients)]
      {:channel channel
       :blocks  sections})))
