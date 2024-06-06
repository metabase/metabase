(ns metabase.channel.email
  (:require
   [metabase.channel.core :as channel]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.pulse.markdown :as markdown]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(channel/register! :channel/slack)

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

(defmethod channel/deliver! [:channel/email :alert]
  [_channel-details payload recipients _template]
  (let [{:keys [card alert]} payload
        condition-kwd        (messages/pulse->alert-condition-kwd alert)
        email-subject        (trs "Alert: {0} has {1}"
                                  (get-in payload [:card :name])
                                  (alert-condition-type->description condition-kwd))
        {:keys [user-emails
                non-user-emails]} (recipients->emails recipients)
        timezone             (defaulted-timezone card)
        email-to-users       (when (> (count user-emails) 0)
                               (construct-pulse-email email-subject user-emails
                                                      (messages/render-alert-email timezone alert {:needed-only-to-get-the-schedule 1
                                                                                                   :schedule_type :hourly}
                                                                                   [(assoc payload :type :card)]
                                                                                   (find-goal-value card)
                                                                                   nil)))
        email-to-nonusers    (for [non-user-email non-user-emails]
                               (construct-pulse-email email-subject [non-user-email]
                                                      (messages/render-alert-email timezone alert {:needed-only-to-get-the-schedule 1
                                                                                                   :schedule_type :hourly} [(assoc payload :type :card)] (find-goal-value card) non-user-email)))]
    (send-emails! (if email-to-users
                    (conj email-to-nonusers email-to-users)
                    email-to-nonusers))))

;; ------------------------------------------------------------------------------------------------;;
;;                                    Dashboard Subscriptions                                      ;;
;; ------------------------------------------------------------------------------------------------;;


(defmethod channel/deliver! [:channel/email :dashboard-subscription]
  [_channel-details payload recipients _template]
  (let [{:keys [dashboard
                dashboard-subscription
                result]}               payload
        {:keys [user-emails
                non-user-emails]} (recipients->emails recipients)
        timezone            (some->> result (some :card) defaulted-timezone)
        email-subject       (trs "Pulse: {0}" (:name dashboard))
        dashboard           (update dashboard :description markdown/process-markdown :html)
        email-to-users      (when (seq user-emails)
                              (construct-pulse-email email-subject user-emails (messages/render-pulse-email timezone dashboard-subscription dashboard result nil)))
        email-to-nonusers   (for [non-user-email non-user-emails]
                              (construct-pulse-email email-subject [non-user-email] (messages/render-pulse-email timezone dashboard-subscription dashboard result non-user-email)))]
    (send-emails! (if email-to-users
                    (conj email-to-nonusers email-to-users)
                    email-to-nonusers))))
