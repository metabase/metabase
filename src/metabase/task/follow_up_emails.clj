(ns metabase.task.follow-up-emails
  "Tasks which follow up with Metabase users."
  (:require [clojure.tools.logging :as log]
            [clojurewerkz.quartzite
             [jobs :as jobs]
             [triggers :as triggers]]
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [java-time :as t]
            [metabase
             [email :as email]
             [public-settings :as public-settings]
             [task :as task]]
            [metabase.email.messages :as messages]
            [metabase.models
             [activity :refer [Activity]]
             [setting :as setting]
             [user :as user :refer [User]]
             [view-log :refer [ViewLog]]]
            [metabase.util
             [date-2 :as u.date]
             [i18n :refer [trs]]]
            [schema.core :as s]
            [toucan.db :as db])
  (:import java.time.temporal.Temporal))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             send follow-up emails                                              |
;;; +----------------------------------------------------------------------------------------------------------------+

(setting/defsetting ^:private follow-up-email-sent
  ;; No need to i18n this as it's not user facing
  "Have we sent a follow up email to the instance admin?"
  :type       :boolean
  :default    false
  :visibility :internal)

(defn- send-follow-up-email!
  "Send an email to the instance admin following up on their experience with Metabase thus far."
  []
  ;; we need access to email AND the instance must be opted into anonymous tracking. Make sure email hasn't been sent yet
  (when (and (email/email-configured?)
             (public-settings/anon-tracking-enabled)
             (not (follow-up-email-sent)))
    ;; grab the oldest admins email address (likely the user who created this MB instance), that's who we'll send to
    ;; TODO - Does it make to send to this user instead of `(public-settings/admin-email)`?
    (when-let [admin (User :is_superuser true, :is_active true, {:order-by [:date_joined]})]
      (try
        (messages/send-follow-up-email! (:email admin) "follow-up")
        (catch Throwable e
          (log/error "Problem sending follow-up email:" e))
        (finally
          (follow-up-email-sent true))))))

(defn- instance-creation-timestamp
  "The date this Metabase instance was created. We use the `:date_joined` of the first `User` to determine this."
  ^java.time.temporal.Temporal []
  (db/select-one-field :date_joined User, {:order-by [[:date_joined :asc]]}))

;; this sends out a general 2 week email follow up email
(jobs/defjob FollowUpEmail [_]
  ;; if we've already sent the follow-up email then we are done
  (when-not (follow-up-email-sent)
    ;; figure out when we consider the instance created
    (when-let [instance-created (instance-creation-timestamp)]
      ;; we need to be 2+ weeks from creation to send the follow up
      (when (u.date/older-than? instance-created (t/weeks 2))
        (send-follow-up-email!)))))

(def ^:private follow-up-emails-job-key     "metabase.task.follow-up-emails.job")
(def ^:private follow-up-emails-trigger-key "metabase.task.follow-up-emails.trigger")

(defmethod task/init! ::SendFollowUpEmails [_]
  (let [job     (jobs/build
                 (jobs/of-type FollowUpEmail)
                 (jobs/with-identity (jobs/key follow-up-emails-job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key follow-up-emails-trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; run once a day
                   (cron/cron-schedule "0 0 12 * * ? *")))]
    (task/schedule-task! job trigger)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                             send abandoment emails                                             |
;;; +----------------------------------------------------------------------------------------------------------------+

(setting/defsetting ^:private abandonment-email-sent
  "Have we sent an abandonment email to the instance admin?"
  :type       :boolean
  :default    false
  :visibility :internal)

(s/defn ^:private should-send-abandoment-email?
  ([]
   (should-send-abandoment-email?
    (instance-creation-timestamp)
    (db/select-one [User [:%max.date_joined :last-user]])
    (db/select-one [Activity [:%max.timestamp :last-activity]])
    (db/select-one [ViewLog [:%max.timestamp :last-view]])))

  ([instance-creation :- (s/maybe Temporal)
    last-user         :- (s/maybe Temporal)
    last-activity     :- (s/maybe Temporal)
    last-view         :- (s/maybe Temporal)]
   (boolean
    (and instance-creation
         (u.date/older-than? instance-creation (t/weeks 4))
         (or (not last-user)     (u.date/older-than? last-user     (t/weeks 2)))
         (or (not last-activity) (u.date/older-than? last-activity (t/weeks 2)))
         (or (not last-view)     (u.date/older-than? last-view     (t/weeks 2)))))))

(defn- send-abandoment-email-if-needed!
  "Send an email to the instance admin about why Metabase usage has died down."
  []
  ;; grab the oldest admins email address, that's who we'll send to
  (when-let [admin-email (db/select-one-field :email User :is_superuser true, {:order-by [:date_joined]})]
    (when (should-send-abandoment-email?)
      (log/info (trs "Sending abandonment email!"))
      (try
        (messages/send-follow-up-email! admin-email "abandon")
        (catch Throwable e
          (log/error e (trs "Problem sending abandonment email")))
        (finally
          (abandonment-email-sent true))))))

;; this sends out an email any time after 30 days if the instance has stopped being used for 14 days
(jobs/defjob AbandonmentEmail [_]
  ;; if we've already sent the abandonment email then we are done
  (when-not (abandonment-email-sent)
    ;; we need access to email AND the instance must be opted into anonymous tracking
    (when (and (email/email-configured?)
               (public-settings/anon-tracking-enabled))
      (send-abandoment-email-if-needed!))))

(def ^:private abandonment-emails-job-key     "metabase.task.abandonment-emails.job")
(def ^:private abandonment-emails-trigger-key "metabase.task.abandonment-emails.trigger")

(defmethod task/init! ::SendAbandomentEmails [_]
  (let [job     (jobs/build
                 (jobs/of-type AbandonmentEmail)
                 (jobs/with-identity (jobs/key abandonment-emails-job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key abandonment-emails-trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                   ;; run once a day
                   (cron/cron-schedule "0 0 12 * * ? *")))]
    (task/schedule-task! job trigger)))
