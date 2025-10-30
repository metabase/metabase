(ns metabase.users.task.invitation-reminder
  "Scheduled task to send reminder emails to users who were invited 3 days ago but haven't joined yet."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.appearance.core :as appearance]
   [metabase.events.core :as events]
   [metabase.session.core :as session]
   [metabase.sso.core :as sso]
   [metabase.system.core :as system]
   [metabase.task.core :as task]
   [metabase.users.models.user :as user]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(def ^:private job-key "metabase.task.invitation-reminder.job")
(def ^:private trigger-key "metabase.task.invitation-reminder.trigger")

(defn- join-url
  [user-id]
  (let [reset-token               (user/set-password-reset-token! user-id)
        should-link-to-login-page (and (sso/sso-enabled?)
                                       (not (session/enable-password-login)))]
    (if should-link-to-login-page
      (str (system/site-url) "/auth/login")
      ;; NOTE: the new user join url is a password reset route with an indicator that this is a first time user.
      (str (user/form-password-reset-url reset-token) "#new"))))

(defn- users-invited-3-days-ago
  "Find all users who were invited 3 days ago (same calendar day, 3 days back)
  and still haven't logged in (last_login is null)."
  []
  (let [today           (t/local-date)
        three-days-ago  (t/minus today (t/days 3))
        start-of-day    (t/zoned-date-time three-days-ago (t/local-time 0 0 0) (t/zone-id "UTC"))
        end-of-day      (t/zoned-date-time three-days-ago (t/local-time 23 59 59) (t/zone-id "UTC"))]
    (t2/select :model/User
               {:where [:and
                        [:= :is_active true]
                        [:is :last_login nil]
                        [:>= :date_joined start-of-day]
                        [:<= :date_joined end-of-day]]})))

(defn- send-invitation-reminder!
  "Send a reminder email to a user who was invited but hasn't joined yet."
  [{:keys [id email]}]
  (log/infof "Sending invitation reminder to user %d (%s)" id email)
  (events/publish-event! :event/user-invitation-reminder {:object {:id id :email email}}))

(defn- send-invitation-reminders!
  "Main task function that finds users invited 3 days ago and sends them reminder emails."
  []
  (log/info "Starting invitation reminder task")
  (let [users (users-invited-3-days-ago)]
    (if (seq users)
      (do
        (log/infof "Found %d users to send invitation reminders to" (count users))
        (doseq [user users]
          (try
            (send-invitation-reminder! user)
            (catch Exception e
              (log/errorf e "Failed to send invitation reminder to user %d" (:id user))))))
      (log/info "No users found who need invitation reminders"))
    (log/info "Invitation reminder task completed")))

(task/defjob ^{:doc "Send reminder emails to users invited 3 days ago who haven't joined yet"}
  InvitationReminder
  [_job-context]
  (send-invitation-reminders!))

(defmethod task/init! ::InvitationReminder
  [_]
  (let [job     (jobs/build
                 (jobs/of-type InvitationReminder)
                 (jobs/with-identity (jobs/key job-key))
                 (jobs/with-description "Send invitation reminder emails to users invited 3 days ago")
                 (jobs/store-durably))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/for-job (jobs/key job-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; Run every day at 10 AM
                  (cron/schedule
                   (cron/cron-schedule "0 0 10 * * ? *")
                   (cron/with-misfire-handling-instruction-do-nothing))))]
    (task/schedule-task! job trigger)))
