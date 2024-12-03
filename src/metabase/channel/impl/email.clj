(ns metabase.channel.impl.email
  (:require
   [buddy.core.codecs :as codecs]
   [hiccup.core :refer [html]]
   [medley.core :as m]
   [metabase.channel.core :as channel]
   [metabase.channel.params :as channel.params]
   [metabase.channel.render.core :as channel.render]
   [metabase.channel.template.handlebars :as handlebars]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.email.result-attachment :as email.result-attachment]
   [metabase.models.channel :as models.channel]
   [metabase.models.notification :as models.notification]
   [metabase.models.params.shared :as shared.params]
   [metabase.public-settings :as public-settings]
   [metabase.util :as u]
   [metabase.util.encryption :as encryption]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.markdown :as markdown]
   [metabase.util.urls :as urls]
   [ring.util.codec :as codec]))

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
                                                 (email/bcc-enabled?))}))

;; ------------------------------------------------------------------------------------------------;;
;;                                        Render Utils                                             ;;
;; ------------------------------------------------------------------------------------------------;;

(defn generate-dashboard-sub-unsubscribe-hash
  "Generates hash to allow for non-users to unsubscribe from pulses/subscriptions."
  [pulse-id email]
  (codecs/bytes->hex
   (encryption/validate-and-hash-secret-key
    (json/encode {:salt     (public-settings/site-uuid-for-unsubscribing-url)
                  :email    email
                  :pulse-id pulse-id}))))

(defn- unsubscribe-url-for-non-user
  [dashboard-subscription-id non-user-email]
  (str (urls/unsubscribe-url)
       "?"
       (codec/form-encode {:hash     (generate-dashboard-sub-unsubscribe-hash dashboard-subscription-id non-user-email)
                           :email    non-user-email
                           :pulse-id dashboard-subscription-id})))

(defn- render-part
  [timezone part options]
  (case (:type part)
    :card
    (channel.render/render-pulse-section timezone part options)

    :text
    {:content (markdown/process-markdown (:text part) :html)}

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
        ;; TODO: check if does this match by dashboard_card_id or card_id?
        :let [noti-dashcard (m/find-first #(= (:card_id %) result-card-id) part-configs)]]
    (if result-card-id
      (update result :card merge (select-keys noti-dashcard [:include_csv :include_xls :format_rows :pivot_results]))
      result)))

(defn- email-attachment
  [rendered-cards parts]
  (filter some?
          (concat (map make-message-attachment (apply merge (map :attachments (u/one-or-many rendered-cards))))
                  (mapcat email.result-attachment/result-attachment parts))))

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
   {:user-emails     (mapv (comp :email :user) (filter #(= :user (:kind %)) recipients))
    :non-user-emails (mapv :email (filter #(= :external-email (:kind %)) recipients))}
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

;; ------------------------------------------------------------------------------------------------;;
;;                                           Alerts                                                ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/email :notification/alert] :- [:sequential EmailMessage]
  [_channel-type {:keys [payload] :as notification-payload} template recipients]
  (let [{:keys [card_part
                alert
                card]}     payload
        timezone           (channel.render/defaulted-timezone card)
        rendered-card      (render-part timezone card_part {:channel.render/include-title? true})
        icon-attachment    (apply make-message-attachment (icon-bundle :bell))
        attachments        (concat [icon-attachment]
                                   (email-attachment rendered-card
                                                     (assoc-attachment-booleans [alert] [card_part])))
        message-context-fn (fn [non-user-email]
                             (assoc notification-payload
                                    :computed {:subject         (case (messages/pulse->alert-condition-kwd alert)
                                                                  :meets (trs "Alert: {0} has reached its goal" (:name card))
                                                                  :below (trs "Alert: {0} has gone below its goal" (:name card))
                                                                  :rows  (trs "Alert: {0} has results" (:name card)))
                                               :icon_cid        (:content-id icon-attachment)
                                               :alert_content   (html (:content rendered-card))
                                               :alert_schedule  (messages/alert-schedule-text (:schedule alert))
                                               :management_text (if (nil? non-user-email)
                                                                  "Manage your subscriptions"
                                                                  "Unsubscribe")
                                               :management_url  (if (nil? non-user-email)
                                                                  (urls/notification-management-url)
                                                                  (unsubscribe-url-for-non-user (:id alert) non-user-email))}))]
    (construct-emails template message-context-fn attachments recipients)))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Dashboard Subscriptions                                      ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- render-filters
  [parameters]
  (let [cells (map
               (fn [filter]
                 [:td {:class "filter-cell"
                       :style (channel.render/style {:width "50%"
                                                     :padding "0px"
                                                     :vertical-align "baseline"})}
                  [:table {:cellpadding "0"
                           :cellspacing "0"
                           :width "100%"
                           :height "100%"}
                   [:tr
                    [:td
                     {:style (channel.render/style {:color channel.render/color-text-medium
                                                    :min-width "100px"
                                                    :width "50%"
                                                    :padding "4px 4px 4px 0"
                                                    :vertical-align "baseline"})}
                     (:name filter)]
                    [:td
                     {:style (channel.render/style {:color channel.render/color-text-dark
                                                    :min-width "100px"
                                                    :width "50%"
                                                    :padding "4px 16px 4px 8px"
                                                    :vertical-align "baseline"})}
                     (shared.params/value-string filter (public-settings/site-locale))]]]])
               parameters)
        rows  (partition-all 2 cells)]
    (html
     [:table {:style (channel.render/style {:table-layout    :fixed
                                            :border-collapse :collapse
                                            :cellpadding     "0"
                                            :cellspacing     "0"
                                            :width           "100%"
                                            :font-size       "12px"
                                            :font-weight     700
                                            :margin-top      "8px"})}
      (for [row rows]
        [:tr {} row])])))

(mu/defmethod channel/render-notification [:channel/email :notification/dashboard-subscription] :- [:sequential EmailMessage]
  [_channel-type {:keys [payload] :as notification-payload} template recipients]
  (let [{:keys [dashboard_parts
                dashboard_subscription
                parameters
                dashboard]} payload
        timezone            (some->> dashboard_parts (some :card) channel.render/defaulted-timezone)
        rendered-cards      (mapv #(render-part timezone % {:channel.render/include-title? true}) dashboard_parts)
        icon-attachment     (apply make-message-attachment (icon-bundle :dashboard))
        attachments         (concat
                             [icon-attachment]
                             (email-attachment rendered-cards (assoc-attachment-booleans
                                                               (:dashboard_subscription_dashcards dashboard_subscription)
                                                               dashboard_parts)))
        message-context-fn  (fn [non-user-email]
                              (-> notification-payload
                                  (assoc :computed {:dashboard_content  (html (vec (cons :div (map :content rendered-cards))))
                                                    :icon_cid           (:content-id icon-attachment)
                                                    :dashboard_has_tabs (some-> dashboard :tabs seq)
                                                    :management_text    (if (nil? non-user-email)
                                                                          "Manage your subscriptions"
                                                                          "Unsubscribe")
                                                    :management_url     (if (nil? non-user-email)
                                                                          (urls/notification-management-url)
                                                                          (unsubscribe-url-for-non-user (:id dashboard_subscription) non-user-email))
                                                    :filters           (when parameters
                                                                         (render-filters parameters))})
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
                                    :notification-recipient/external-email
                                    [(:email details)]
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
   template             :- models.channel/ChannelTemplate
   recipients           :- [:sequential models.notification/NotificationRecipient]]
  (assert (some? template) "Template is required for system event notifications")
  [(construct-email (channel.params/substitute-params (-> template :details :subject) notification-payload)
                    (notification-recipients->emails recipients notification-payload)
                    [{:type    "text/html; charset=utf-8"
                      :content (render-body template notification-payload)}]
                    (-> template :details :recipient-type keyword))])
