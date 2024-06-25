(ns metabase.channel.email
  (:require
   [metabase.channel.core :as channel]
   [metabase.channel.shared :as channel.shared]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(def ^:private EmailMessage
  [:map
   [:subject      :string]
   [:recipients   [:sequential ms/Email]]
   [:message-type [:enum :attachments :html :text]]
   [:message      :any]])

(defn- construct-pulse-email [subject recipients message]
  {:subject      subject
   :recipients   recipients
   :message-type :attachments
   :message      message})

(defn- recipients->emails
  [recipients]
  (update-vals
   {:user-emails     (mapv (comp :email :user) (filter #(= :user (:kind %)) recipients))
    :non-user-emails (mapv :email (filter #(= :external-email (:kind %)) recipients))}
   #(filter u/email? %)))

;; ------------------------------------------------------------------------------------------------;;
;;                                           Alerts                                                ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- find-goal-value
  "The goal value can come from a progress goal or a graph goal_value depending on it's type"
  [card]
  (case (:display card)

    (:area :bar :line)
    (get-in card [:visualization_settings :graph.goal_value])

    :progress
    (get-in card [:visualization_settings :progress.goal])

    nil))

(mu/defmethod channel/send! :channel/email
  [_channel-type {:keys [subject recipients message-type message]} :- EmailMessage]
  (email/send-message-or-throw! {:subject      subject
                                 :recipients   recipients
                                 :message-type message-type
                                 :message      message
                                 :bcc?         (email/bcc-enabled?)}))

(mu/defmethod channel/render-notification [:channel/email :notification/alert] :- [:sequential EmailMessage]
  [_channel-type {:keys [payload context]} recipients]
  (let [{:keys [card
                pulse
                trigger]}         context
        condition-kwd             (messages/pulse->alert-condition-kwd pulse)
        email-subject             (case condition-kwd
                                    :meets (trs "Alert: {0} has reached its goal" (:name card))
                                    :below (trs "Alert: {0} has gone below its goal" (:name card))
                                    :rows  (trs "Alert: {0} has results" (:name card)))
        {:keys [user-emails
                non-user-emails]} (recipients->emails recipients)
        timezone                  (channel.shared/defaulted-timezone card)
        goal                      (find-goal-value card)
        email-to-users            (when (> (count user-emails) 0)
                                    (construct-pulse-email
                                     email-subject user-emails
                                     (messages/render-alert-email timezone pulse trigger
                                                                  [payload]
                                                                  goal
                                                                  nil)))
        email-to-nonusers         (for [non-user-email non-user-emails]
                                    (construct-pulse-email
                                     email-subject [non-user-email]
                                     (messages/render-alert-email timezone pulse trigger
                                                                  [payload]
                                                                  goal
                                                                  non-user-email)))]
    (filter some? (conj email-to-nonusers email-to-users))))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Dashboard Subscriptions                                      ;;
;; ------------------------------------------------------------------------------------------------;;

(mu/defmethod channel/render-notification [:channel/email :notification/dashboard-subscription] :- [:sequential EmailMessage]
  [_channel-details {:keys [payload context]} recipients]
  (let [{dashsub :dashboard-subscription
         dashboard :dashboard}       context
        {:keys [user-emails
                non-user-emails]} (recipients->emails recipients)
        timezone                  (some->> payload (some :card) channel.shared/defaulted-timezone)
        email-subject             (:name dashboard)
        email-to-users            (when (seq user-emails)
                                    (construct-pulse-email
                                     email-subject
                                     user-emails
                                     (messages/render-pulse-email timezone dashsub dashboard payload nil)))
        email-to-nonusers         (for [non-user-email non-user-emails]
                                    (construct-pulse-email
                                     email-subject
                                     [non-user-email]
                                     (messages/render-pulse-email timezone dashsub dashboard payload non-user-email)))]
    (filter some? (conj email-to-nonusers email-to-users))))
