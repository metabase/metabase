(ns metabase.task.follow-up-emails
  "Tasks which follow up with Metabase users."
  (:require [clj-time.coerce :as c]
            [clj-time.core :as t]
            [clojure.tools.logging :as log]
            (clojurewerkz.quartzite [jobs :as jobs]
                                    [triggers :as triggers])
            [clojurewerkz.quartzite.schedule.cron :as cron]
            [korma.core :as k]
            [metabase.db :as db]
            [metabase.email :as email]
            [metabase.email.messages :as messages]
            [metabase.models.activity :as activity]
            [metabase.models.setting :as setting]
            [metabase.models.user :as user]
            [metabase.models.view-log :as view-log]
            [metabase.task :as task]))


(declare send-follow-up-email!)

(def ^:private ^:const follow-up-emails-job-key     "metabase.task.follow-up-emails.job")
(def ^:private ^:const follow-up-emails-trigger-key "metabase.task.follow-up-emails.trigger")

(defonce ^:private follow-up-emails-job (atom nil))
(defonce ^:private follow-up-emails-trigger (atom nil))

(setting/defsetting follow-up-email-sent "have we sent a follow up email to the instance admin?" false :internal true)

;; triggers the sending of all pulses which are scheduled to run in the current hour
(jobs/defjob FollowUpEmail
             [ctx]
             ;; 1. if we've already sent the follow-up email then we are done
             (when-not (= "true" (follow-up-email-sent))
               ;; figure out when we consider the instance created (join date of oldest user)
               (when-let [instance-created (-> (k/select user/User
                                                 (k/fields :date_joined)
                                                 (k/order :date_joined :ASC)
                                                 (k/limit 1))
                                               first
                                               :date_joined
                                               .getTime)]
                 ;; 2. we need to be 2+ weeks (14 days) from creation to send the follow up
                 (when (< (* 14 24 60 60 1000)
                          (- (System/currentTimeMillis) instance-created))
                   ;; 3. we need  access to email AND the instance must be opted into anonymous tracking
                   (when (and (email/email-configured?)
                              (let [tracking? (setting/get :anon-tracking-enabled)]
                                (or (nil? tracking?) (= "true" tracking?))))
                     (send-follow-up-email!))))))

(defn task-init
  "Automatically called during startup; start the job for sending pulses."
  []
  ;; build our job
  (reset! follow-up-emails-job (jobs/build
                                 (jobs/of-type FollowUpEmail)
                                 (jobs/with-identity (jobs/key follow-up-emails-job-key))))
  ;; build our trigger
  (reset! follow-up-emails-trigger (triggers/build
                                     (triggers/with-identity (triggers/key follow-up-emails-trigger-key))
                                     (triggers/start-now)
                                     (triggers/with-schedule
                                       ;; run once a day
                                       (cron/cron-schedule "0 0 12 * * ? *"))))
  ;; submit ourselves to the scheduler
  (task/schedule-task! @follow-up-emails-job @follow-up-emails-trigger))


(defn- send-follow-up-email!
  "Send an email to the instance admin following up on their experience with Metabase thus far."
  []
  (try
    ;; grab the oldest admins email address, that's who we'll send to
    (when-let [admin (db/sel :one user/User :is_superuser true (k/order :date_joined))]
      ;; check for activity and use that to determine which email we'll send
      ;; inactive = no users created, no activity created, no dash/card views (past 7 days)
      (let [last-user      (c/from-sql-time (db/sel :one :field [user/User :date_joined] (k/order :date_joined :DESC) (k/limit 1)))
            last-activity  (c/from-sql-time (db/sel :one :field [activity/Activity :timestamp] (k/order :timestamp :DESC) (k/limit 1)))
            last-view      (c/from-sql-time (db/sel :one :field [view-log/ViewLog :timestamp] (k/order :timestamp :DESC) (k/limit 1)))
            seven-days-ago (t/minus (t/now) (t/days 7))
            message-type   (if (and (t/before? last-user seven-days-ago)
                                    (t/before? last-activity seven-days-ago)
                                    (t/before? last-view seven-days-ago))
                             "inactive"
                             "active")]
        (messages/send-follow-up-email (:email admin) message-type)))
    (catch Throwable t
      (log/error "Problem sending follow-up email" t))
    (finally
      (setting/set :follow-up-email-sent "true"))))

