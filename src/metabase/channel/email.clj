(ns metabase.channel.email
  (:require
   [metabase.channel.core :as channel]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(mu/defn defaulted-timezone :- :string
  "Returns the timezone ID for the given `card`. Either the report timezone (if applicable) or the JVM timezone."
  [card :- (ms/InstanceOf :model/Card)]
  (or (some->> card :database_id (t2/select-one :model/Database :id) qp.timezone/results-timezone-id)
      (qp.timezone/system-timezone-id)))

(defn- construct-pulse-email [subject recipients message]
  {:subject      subject
   :recipients   recipients
   :message-type :attachments
   :message      message})

(defn- send-emails!
  [emails]
  (doseq [{:keys [subject recipients message-type message]} emails]
    (email/send-message-or-throw! {:subject      subject
                                   :recipients   recipients
                                   :message-type message-type
                                   :message      message
                                   :bcc?         (email/bcc-enabled?)})))

(defn- recipients->emails
  [recipients]
  {:user-emails     (mapv (comp :email :user) (filter #(= :user (:kind %)) recipients))
   :non-user-emails (mapv :recipient (filter #(= :external-email (:kind %)) recipients))})

;; ------------------------------------------------------------------------------------------------;;
;;                                           Alerts                                                ;;
;; ------------------------------------------------------------------------------------------------;;

(defn- alert-condition-type->description [condition-type]
  (case (keyword condition-type)
    :meets (trs "reached its goal")
    :below (trs "gone below its goal")
    :rows  (trs "results")))

(defn- find-goal-value
  "The goal value can come from a progress goal or a graph goal_value depending on it's type"
  [card]
  (case (:display card)

    (:area :bar :line)
    (get-in card [:visualization_settings :graph.goal_value])

    :progress
    (get-in card [:visualization_settings :progress.goal])

    nil))

(def ^:private EmailMessage
  [:map
   [:subject :string]
   ;; :email
   [:recipients [:sequential :string]]
   [:message-type [:enum :attachments :html :text]]
   [:message      :any]])

(mu/defmethod channel/send! :channel/email
  [_channel-type {:keys [subject recipients message-type message] :as email-message} :- EmailMessage]
  (def email-message email-message)
  (email/send-message-or-throw! {:subject      subject
                                 :recipients   recipients
                                 :message-type message-type
                                 :message      message
                                 :bcc?         (email/bcc-enabled?)}))

(defmethod channel/render-notification [:channel/email :notification/alert]
  [_channel-type notification-content recipients]
  (let [{:keys [card alert
                payload]}         notification-content
        condition-kwd             (messages/pulse->alert-condition-kwd alert)
        email-subject             (trs "Alert: {0} has {1}"
                                       (get-in notification-content [:card :name])
                                       (alert-condition-type->description condition-kwd))
        {:keys [user-emails
                non-user-emails]} (recipients->emails recipients)
        timezone                  (defaulted-timezone card)
        pc                        (t2/select-one :model/PulseChannel :enabled true :pulse_id (:id alert))
        goal                      (find-goal-value card)
        email-to-users            (when (> (count user-emails) 0)
                                    (construct-pulse-email email-subject user-emails
                                                           (messages/render-alert-email timezone alert pc
                                                                                        [payload]
                                                                                        goal
                                                                                        nil)))
        email-to-nonusers         (for [non-user-email non-user-emails]
                                    (construct-pulse-email email-subject [non-user-email]
                                                           (messages/render-alert-email timezone alert pc
                                                                                        [payload]
                                                                                        goal
                                                                                        non-user-email)))]
    (filter some? (conj email-to-nonusers email-to-users))))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Dashboard Subscriptions                                      ;;
;; ------------------------------------------------------------------------------------------------;;

(defmethod channel/render-notification [:channel/email :notification/dashboard-subscription]
  [_channel-details notification-content recipients]
  (let [{:keys [dashboard
                payload
                dashboard-subscription]} notification-content
        {:keys [user-emails
                non-user-emails]} (recipients->emails recipients)
        timezone            (some->> payload (some :card) defaulted-timezone)
        email-subject       (:name dashboard)
        email-to-users      (when (seq user-emails)
                              (construct-pulse-email email-subject user-emails (messages/render-pulse-email timezone dashboard-subscription dashboard payload nil)))
        email-to-nonusers   (for [non-user-email non-user-emails]
                              (construct-pulse-email email-subject [non-user-email] (messages/render-pulse-email timezone dashboard-subscription dashboard payload non-user-email)))]
    (filter some? (conj email-to-nonusers email-to-users))))
