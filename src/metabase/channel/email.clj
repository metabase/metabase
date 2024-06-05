(ns metabase.channel.email
  (:require
   [metabase.channel.interface :as channel.interface]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [metabase.util.ui-logic :as ui-logic]
   [toucan2.core :as t2]))

(defn- alert-condition-type->description [condition-type]
  (case (keyword condition-type)
    :meets (trs "reached its goal")
    :below (trs "gone below its goal")
    :rows  (trs "results")))

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

(defn- find-goal-value
  "The goal value can come from a progress goal or a graph goal_value depending on it's type"
  [card]
  (case (:display card)

    (:area :bar :line)
    (get-in card [:visualization_settings :graph.goal_value])

    :progress
    (get-in card [:visualization_settings :progress.goal])

    nil))

(defmethod channel.interface/deliver! [:email :alert]
  [_channel-details payload recipients _template]
  (def payload payload)
  (def recipients recipients)
  (let [{:keys [card alert]} payload
        condition-kwd        (messages/pulse->alert-condition-kwd alert)
        email-subject        (trs "Alert: {0} has {1}"
                                  (get-in payload [:card :name])
                                  (alert-condition-type->description condition-kwd))
        user-recipients      (filter #(= :user (:kind %)) recipients)
        non-user-recipients  (filter #(= :external-email (:kind %)) recipients)
        timezone             (defaulted-timezone card)
        email-to-users       (when (> (count user-recipients) 0)
                               (construct-pulse-email email-subject (mapv (comp :email :user) user-recipients)
                                                      (messages/render-alert-email timezone alert {:needed-only-to-get-the-schedule 1
                                                                                                   :schedule_type :hourly} [(assoc payload :type :card)] (find-goal-value card) nil)))
        email-to-nonusers    (for [non-user (map :recipient non-user-recipients)]
                               (construct-pulse-email email-subject [(mapv :email non-user)]
                                                      (messages/render-alert-email timezone alert {:needed-only-to-get-the-schedule 1
                                                                                                   :schedule_type :hourly} [(assoc payload :type :card)] (find-goal-value card) non-user)))
        emails               (if email-to-users
                               (conj email-to-nonusers email-to-users)
                               email-to-nonusers)]
    (doseq [{:keys [subject recipients message-type message]} emails]
     (email/send-message-or-throw! {:subject      subject
                                    :recipients   #p recipients
                                    :message-type message-type
                                    :message      message
                                    :bcc?         (email/bcc-enabled?)}))))


