(ns metabase.channel.impl.email
  (:require
   [clojure.string :as str]
   [hiccup.core :refer [html]]
   [medley.core :as m]
   [metabase.channel.core :as channel]
   [metabase.channel.email :as email]
   [metabase.channel.email.logo :as email.logo]
   [metabase.channel.email.messages :as messages]
   [metabase.channel.email.result-attachment :as email.result-attachment]
   [metabase.channel.impl.util :as impl.util]
   [metabase.channel.models.channel :as models.channel]
   [metabase.channel.params :as channel.params]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.render.style :as style]
   [metabase.channel.render.util :as render.util]
   [metabase.channel.settings :as channel.settings]
   [metabase.channel.shared :as channel.shared]
   [metabase.channel.template.handlebars :as handlebars]
   [metabase.channel.urls :as urls]
   [metabase.notification.models :as models.notification]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.markdown :as markdown]
   [metabase.util.ui-logic :as ui-logic]
   [ring.util.codec :as codec]))

(set! *warn-on-reflection* true)

(def ^:private EmailMessage
  [:map
   [:subject                         :string]
   [:recipients                      [:sequential ms/Email]]
   [:message-type                    [:enum :attachments :html :text]]
   [:message                         :any]
   [:recipient-type {:optional true} [:maybe (ms/enum-keywords-and-strings :cc :bcc)]]])

(mu/defmethod channel/send! :channel/email
  [_channel {:keys [subject recipients message-type message recipient-type]} :- EmailMessage]
  (email/send-message-or-throw! {:subject      subject
                                 :recipients   recipients
                                 :message-type message-type
                                 :message      message
                                 :bcc?         (if recipient-type
                                                 (= :bcc recipient-type)
                                                 (channel.settings/bcc-enabled?))}))

;; ------------------------------------------------------------------------------------------------;;
;;                                        Render Utils                                             ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- notification-unsubscribe-url-for-non-user
  [notification-handler-id non-user-email]
  (str (urls/unsubscribe-url)
       "?"
       (codec/form-encode {:hash                    (messages/generate-notification-unsubscribe-hash notification-handler-id non-user-email)
                           :email                   non-user-email
                           :notification-handler-id notification-handler-id})))

(defn- pulse-unsubscribe-url-for-non-user
  "Given a `dashboard-subscription-id` and a `non-user-email`, returns a URL that can be used to unsubscribe from a
  pulse for a non-logged in user. If `dashboard-subscription-id` is `nil`, returns `nil`, since
  there is nothing to unsubscribe from."
  [dashboard-subscription-id non-user-email]
  (when dashboard-subscription-id
    (str (urls/unsubscribe-url)
         "?"
         (codec/form-encode {:hash     (messages/generate-pulse-unsubscribe-hash dashboard-subscription-id non-user-email)
                             :email    non-user-email
                             :pulse-id dashboard-subscription-id}))))

(defn- render-part
  [timezone part options]
  (case (:type part)
    :card
    (channel.render/render-pulse-section timezone (channel.shared/maybe-realize-data-rows part) options)

    :text
    (let [inline-params   (:inline_parameters part)
          rendered-params (when (seq inline-params) (render.util/render-parameters inline-params))]
      {:content (str (markdown/process-markdown (:text part) :html)
                     rendered-params)})

    :heading
    (let [inline-params   (:inline_parameters part)
          rendered-params (when (seq inline-params) (render.util/render-parameters inline-params))
          heading-text    (:text part)
          style           (style/style (if (seq inline-params) {:margin-bottom "4px"} {}))]
      {:content (str (html [:h2 {:style style} heading-text])
                     rendered-params)})
    :tab-title
    {:content (markdown/process-markdown (format "# %s\n---" (:text part)) :html)}))

(defn- render-body
  [{:keys [details] :as _template} payload]
  (case (keyword (:type details))
    :email/handlebars-resource
    (handlebars/render (:path details) payload)

    :email/handlebars-text
    (handlebars/render-string (:body details) payload)

    (do
      (log/warnf "Unknown email template type: %s" (:type details))
      nil)))

(defn- render-message-body
  [template message-context attachments]
  (vec (concat [{:type "text/html; charset=utf-8" :content (render-body template message-context)}] attachments)))

(defn- make-message-attachment [[content-id url]]
  {:type         :inline
   :content-id   content-id
   :content-type "image/png"
   :content      url})

(defn- assoc-attachment-booleans [part-configs parts]
  (for [{{result-card-id :id} :card :as result} parts
        :let [result-dashboard-card-id (:id (:dashcard result))
              is-visualizer-part (render.util/is-visualizer-dashcard? (:dashcard result))
              ;; For visualizer dashcards we match on both card_id and dashboard_card_id
              ;; To disambiguate between regular cards and regular cards that were turned into visualizer dashcards
              noti-dashcard (or (and is-visualizer-part
                                     (m/find-first (fn [config]
                                                     (and (= (:card_id config) result-card-id)
                                                          (= (:dashboard_card_id config) result-dashboard-card-id)))
                                                   part-configs))
                                ;; Fall back to just matching on card_id
                                (m/find-first (fn [config]
                                                (= (:card_id config) result-card-id))
                                              part-configs))]]
    (if result-card-id
      (update result :card merge (select-keys noti-dashcard [:include_csv :include_xls :format_rows :pivot_results]))
      result)))

(defn- icon-bundle
  "Bundle an icon.

  The available icons are defined in [[render.js.svg/icon-paths]]."
  [icon-name]
  (let [color     (channel.render/primary-color)
        png-bytes (channel.render/icon icon-name color)]
    (-> (channel.render/make-image-bundle :attachment png-bytes)
        (channel.render/image-bundle->attachment))))

(defn- construct-email
  ([subject recipients message]
   (construct-email subject recipients message nil))
  ([subject recipients message recipient-type]
   {:subject        subject
    :recipients     recipients
    :message-type   :attachments
    :message        message
    :recipient-type recipient-type}))

(defn- recipients->emails
  [recipients]
  (update-vals
   {:user-emails     (mapv (comp :email :user) (filter #(= :notification-recipient/user (:type %)) recipients))
    :non-user-emails (mapv (comp :value :details) (filter #(= :notification-recipient/raw-value (:type %)) recipients))}
   #(filter u/email? %)))

(defn- construct-emails
  [template message-context-fn attachments recipients]
  (let [{:keys [user-emails
                non-user-emails]} (recipients->emails recipients)
        email-to-users            (when (seq user-emails)
                                    (let [message-ctx (message-context-fn nil)]
                                      (construct-email
                                       (channel.params/substitute-params (-> template :details :subject) message-ctx)
                                       user-emails
                                       (render-message-body template (message-context-fn nil) attachments))))
        email-to-nonusers         (for [non-user-email non-user-emails]
                                    (let [message-ctx (message-context-fn non-user-email)]
                                      (construct-email
                                       (channel.params/substitute-params (-> template :details :subject) message-ctx)
                                       [non-user-email]
                                       (render-message-body template (message-context-fn non-user-email) attachments))))]
    (filter some? (conj email-to-nonusers email-to-users))))

(def ^:private payload-type->default-template
  {:notification/dashboard {:channel_type :channel/email
                            :details      {:type    :email/handlebars-resource
                                           :subject "{{payload.dashboard.name}}"
                                           :path    "metabase/channel/email/dashboard_subscription.hbs"}}
   :notification/card      {:channel_type :channel/email
                            :details      {:type    :email/handlebars-resource
                                           :subject "{{computed.subject}}"
                                           :path    "metabase/channel/email/notification_card.hbs"}}})

;; ------------------------------------------------------------------------------------------------;;
;;                                      Notification Card                                          ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/email :notification/card] :- [:sequential EmailMessage]
  [_channel-type {:keys [payload payload_type] :as notification-payload} {:keys [template recipients]}]
  (let [{:keys [card_part
                notification_card
                subscriptions
                card]}     payload
        template           (or template (payload-type->default-template payload_type))
        timezone           (channel.render/defaulted-timezone card)
        rendered-card      (render-part timezone card_part {:channel.render/include-title? true})
        icon-attachment    (apply make-message-attachment (icon-bundle :bell))
        card-attachments   (map make-message-attachment (:attachments rendered-card))
        result-attachments (email.result-attachment/result-attachment
                            (first (assoc-attachment-booleans
                                    [(assoc notification_card :include_csv true :format_rows true)]
                                    [card_part])))
        attachments        (concat [icon-attachment] card-attachments result-attachments)
        html-content       (html (:content rendered-card))
        goal               (ui-logic/find-goal-value payload)
        message-context-fn (fn [non-user-email]
                             (assoc notification-payload
                                    :computed {:subject         (case (keyword (:send_condition notification_card))
                                                                  :goal_above (trs "Alert: {0} has reached its goal" (:name card))
                                                                  :goal_below (trs "Alert: {0} has gone below its goal" (:name card))
                                                                  :has_result (trs "Alert: {0} has results" (:name card)))
                                               :icon_cid        (:content-id icon-attachment)
                                               :content         html-content
                                               ;; UI only allow one subscription per card notification
                                               :alert_schedule  (some-> subscriptions first :cron_schedule channel.shared/friendly-cron-description)
                                               :goal_value      goal
                                               :management_text (if (nil? non-user-email)
                                                                  "Manage your subscriptions"
                                                                  "Unsubscribe")
                                               :management_url  (if (nil? non-user-email)
                                                                  (urls/notification-management-url)
                                                                  (let [email-handler-id (:notification_handler_id
                                                                                          (m/find-first #(= non-user-email (-> % :details :value)) recipients))]
                                                                    (notification-unsubscribe-url-for-non-user email-handler-id non-user-email)))}))]
    (construct-emails template message-context-fn attachments recipients)))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Dashboard Subscriptions                                      ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/email :notification/dashboard] :- [:sequential EmailMessage]
  [_channel-type {:keys [payload payload_type] :as notification-payload} {:keys [template recipients attachment_only]}]
  (let [{:keys [dashboard_parts
                dashboard_subscription
                parameters
                dashboard]} payload
        template            (or template (payload-type->default-template payload_type))
        timezone            (some->> dashboard_parts (some :card) channel.render/defaulted-timezone)
        ;; We want to walk dashboard_parts once and not retain Hiccup structures in memory to reduce memory water mark
        ;; and avoid OOMs. Hence, we:
        ;; 1. Accumulate the attachments in an imperative way.
        ;; 2. Convert Hiccup structure into HTML immediately.
        ;; 3. Later, we combine all HTMLs using ordinary string mashing.
        [merged-attachments
         result-attachments
         html-contents]     (reduce
                             (fn [[merged-attachments result-attachments html-contents] part]
                               (let [{:keys [attachments content]} (render-part timezone part {:channel.render/include-title? true
                                                                                               :channel.render/disable-links? (boolean (:disable_links dashboard_subscription))})
                                     result-attachment             (email.result-attachment/result-attachment part)]
                                 [(merge merged-attachments attachments)
                                  (into result-attachments result-attachment)
                                  (when-not attachment_only
                                    (conj html-contents (html content)))]))
                             [{} [] []]
                             (assoc-attachment-booleans (:dashboard_subscription_dashcards dashboard_subscription) dashboard_parts))
        icon-attachment     (make-message-attachment (first (icon-bundle :dashboard)))
        card-attachments    (map make-message-attachment merged-attachments)
        attachments         (cond-> (into [icon-attachment] result-attachments)
                              (not attachment_only)
                              (concat card-attachments))
        dashboard-content   (if-not attachment_only
                              (str "<div>" (str/join html-contents) "</div>")
                              "<p>Dashboard content available in attached files</p>")
        message-context-fn  (fn [non-user-email]
                              (-> notification-payload
                                  (assoc :computed {:dashboard_content  dashboard-content
                                                    :icon_cid           (:content-id icon-attachment)
                                                    :dashboard_has_tabs (some-> dashboard :tabs seq)
                                                    :management_text    (if (nil? non-user-email)
                                                                          "Manage your subscriptions"
                                                                          "Unsubscribe")
                                                    :management_url     (if (nil? non-user-email)
                                                                          (urls/notification-management-url)
                                                                          (pulse-unsubscribe-url-for-non-user (:id dashboard_subscription) non-user-email))
                                                    :filters            (when-not attachment_only
                                                                          (some-> (seq parameters)
                                                                                  (impl.util/remove-inline-parameters dashboard_parts)
                                                                                  (render.util/render-parameters)))})
                                  (m/update-existing-in [:payload :dashboard :description] #(markdown/process-markdown % :html))))]
    (construct-emails template message-context-fn attachments recipients)))

;; ------------------------------------------------------------------------------------------------;;
;;                                         System Events                                           ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- notification-recipients->emails
  [recipients notification-payload]
  (into [] cat (for [recipient recipients
                     :let [details (:details recipient)
                           emails (case (:type recipient)
                                    :notification-recipient/user
                                    [(-> recipient :user :email)]
                                    :notification-recipient/group
                                    (->> recipient :permissions_group :members (map :email))
                                    :notification-recipient/raw-value
                                    [(:value details)]
                                    :notification-recipient/template
                                    [(not-empty (channel.params/substitute-params (:pattern details) notification-payload :ignore-missing? (:is_optional details)))]
                                    nil)]
                     :let  [emails (filter some? emails)]
                     :when (seq emails)]
                 emails)))

(mu/defmethod channel/render-notification
  [:channel/email :notification/system-event]
  [_channel-type
   notification-payload #_:- #_notification/NotificationPayload
   {:keys [template recipients]} :- [:map
                                     [:template ::models.channel/ChannelTemplate]
                                     [:recipients [:sequential ::models.notification/NotificationRecipient]]]]
  (assert (some? template) "Template is required for system event notifications")
  (let [logo-url              (get-in notification-payload [:context :application_logo_url])
        logo                  (email.logo/logo-bundle logo-url)
        ;; Update context with the processed logo URL (cid: reference if data URI was converted)
        updated-payload       (if (:image-src logo)
                                (assoc-in notification-payload [:context :application_logo_url] (:image-src logo))
                                notification-payload)
        logo-attachment       (when (:attachment logo)
                                [(make-message-attachment (first (:attachment logo)))])
        attachments           logo-attachment]
    [(construct-email (channel.params/substitute-params (-> template :details :subject) updated-payload)
                      (notification-recipients->emails recipients updated-payload)
                      (render-message-body template updated-payload attachments)
                      (-> template :details :recipient-type keyword))]))
