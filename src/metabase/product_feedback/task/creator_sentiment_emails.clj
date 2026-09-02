(ns metabase.product-feedback.task.creator-sentiment-emails
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.analytics.core :as analytics]
   [metabase.app-db.core :as mdb]
   [metabase.channel.email.messages :as messages]
   [metabase.channel.settings :as channel.settings]
   [metabase.config.core :as config]
   [metabase.premium-features.core :as premium-features]
   [metabase.product-feedback.queries :as product-feedback.queries]
   [metabase.task.core :as task]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log])
  (:import
   (java.time.temporal WeekFields)
   (java.util Locale)))

(set! *warn-on-reflection* true)

(defn- fetch-creators
  "Fetch the creators who are eligible for a creator sentiment email. Which are users who, in the past 2 months:
    - Created at least 10 questions total
    - Created at least 2 SQL questions
    - Created at least 1 dashboard
    - Only admins if whitelabeling is enabled"
  [has-whitelabelling?]
  (product-feedback.queries/creator-sentiment-candidates
   (h2x/add-interval-honeysql-form (mdb/db-type) :%now -2 :month)
   (when has-whitelabelling? [:= :u.is_superuser true])))

(defn fetch-plan-info
  "Figure out what plan this Metabase instance is on."
  []
  (cond
    (and config/ee-available? (premium-features/is-hosted?))
    (if (premium-features/has-any-features?)
      "pro-cloud/enterprise-cloud"
      "starter")

    config/ee-available? "pro-self-hosted/enterprise-self-hosted"
    :else                "unknown"))

(defn- fetch-instance-data []
  {:created_at     (analytics/instance-creation)
   :plan           (fetch-plan-info)
   :version        (config/mb-version-info :tag)
   :num_users      (product-feedback.queries/active-personal-user-count)
   :num_dashboards (product-feedback.queries/unarchived-dashboard-count)
   :num_databases  (product-feedback.queries/non-audit-database-count)
   :num_questions  (product-feedback.queries/unarchived-card-count "question")
   :num_models     (product-feedback.queries/unarchived-card-count "model")})

(defn- user-instance-info
  "Create a blob of instance/user data to be sent to the creator sentiment survey."
  [instance-data {:keys [created_at num_dashboards num_questions num_models]}]
  {:instance instance-data
   :user     {:created_at     created_at
              :num_dashboards num_dashboards
              :num_questions  num_questions
              :num_models     num_models}})

(defn- send-creator-sentiment-emails!
  "Send an email to the instance admin following up on their experience with Metabase thus far."
  [current-week]
  ;; we need access to email AND the instance must have surveys enabled.
  (when (and (channel.settings/email-configured?)
             (channel.settings/surveys-enabled))
    (let [instance-data (fetch-instance-data)
          all-creators  (fetch-creators (premium-features/enable-whitelabeling?))
          this-week?    (fn [c] (= current-week (-> c :email hash (mod 52))))
          recipients    (filter this-week? all-creators)
          blob          (if (analytics/anon-tracking-enabled)
                          (fn [creator]
                            (user-instance-info instance-data creator))
                          (constantly nil))]
      (log/infof "Sending surveys to %d creators of a total %d"
                 (count all-creators) (count recipients))
      (doseq [creator recipients]
        (try
          (messages/send-creator-sentiment-email! creator (blob creator))
          (catch Throwable e
            (log/errorf "Problem sending creator sentiment email: %s" (ex-message e))))))))

(task/defjob ^{:doc "Sends out a monthly survey to a portion of the creators."} CreatorSentimentEmail [_]
  (let [current-week (.get (t/local-date) (.weekOfWeekBasedYear (WeekFields/of (Locale/getDefault))))]
    (send-creator-sentiment-emails! current-week)))

(def ^:private creator-sentiment-emails-job-key     "metabase.task.creator-sentiment-emails.job")
(def ^:private creator-sentiment-emails-trigger-key "metabase.task.creator-sentiment-emails.trigger")

(defmethod task/init! ::SendCreatorSentimentEmails [_]
  (let [job     (jobs/build
                 (jobs/of-type CreatorSentimentEmail)
                 (jobs/with-identity (jobs/key creator-sentiment-emails-job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key creator-sentiment-emails-trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; Fire at 2am every saturday
                  (cron/cron-schedule "0 0 2 ? * 7")))]
    (task/schedule-task! job trigger)))
