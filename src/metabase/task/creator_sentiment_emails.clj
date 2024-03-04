(ns metabase.task.creator-sentiment-emails
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.config :as config]
   [metabase.db :as mdb]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.email :as email]
   [metabase.email.messages :as messages]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.task :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- fetch-creators
  "Fetch the creators who are eligible for a creator sentiment email. Which are users who, in the past 2 months:
    - Created at least 10 questions total
    - Created at least 2 SQL questions
    - Created at least 1 dashboard
    - Only admins if whitelabeling is enabled"
  [has-whitelabelling?]
  (t2/query {:select [[:u.email :email]
                      [:u.date_joined :created_at]
                      [:u.first_name :first_name]
                      [[:count [:distinct [:case [:= :d.archived false] :d.id]]] :num_dashboards]
                      [[:count [:distinct [:case [:and [:= :rc.type "question"] [:= :rc.archived false]] :rc.id]]] :num_questions]
                      [[:count [:distinct [:case [:and [:= :rc.type "model"] [:= :rc.archived false]] :rc.id]]] :num_models]]
             :from [[:core_user :u]]
             :join [[:report_card :rc] [:= :rc.creator_id :u.id]
                    [:report_dashboard :d] [:= :d.creator_id :u.id]]
             :where [:and
                     [:>= :rc.created_at (sql.qp/add-interval-honeysql-form (mdb/db-type) :%now -2 :month)]
                     [:>= :d.created_at (sql.qp/add-interval-honeysql-form (mdb/db-type) :%now -2 :month)]
                     [:= :u.is_active true]
                     [:= :u.type "personal"]
                     (when has-whitelabelling? [:= :u.is_superuser true])]
             :group-by [:u.id]
             :having [:and
                      [:>= [:count [:distinct :rc.id]] 10]
                      [:>= [:count [:distinct [:case [:= :rc.query_type "native"] :rc.id]]] 2]
                      [:>= [:count [:distinct :d.id]] 1]]}))

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
  {:created_at     (snowplow/instance-creation)
   :plan           (fetch-plan-info)
   :verison        (config/mb-version-info :tag)
   :num_users      (t2/count :model/User :is_active true, :type "personal")
   :num_dashboards (t2/count :model/Dashboard :archived false)
   :num_questions  (t2/count :model/Card :archived false :type "question")
   :num_models     (t2/count :model/Card :archived false :type "model")})

(defn- send-creator-sentiment-emails!
  "Send an email to the instance admin following up on their experience with Metabase thus far."
  []
  ;; we need access to email AND the instance must have surveys enabled.
  (when (and (email/email-configured?)
             (email/surveys-enabled))
    (let [instance-data (when (public-settings/anon-tracking-enabled)
                          (fetch-instance-data))
          all-creators  (fetch-creators (premium-features/enable-whitelabeling?))
          month         (- (.getValue (t/month)) 1)
          this-month    (fn [c] (= month (-> c :email hash (mod 12))))
          recipients    (filter this-month all-creators)]
      (log/infof "Sending surveys to %d creators of a total %d"
                 (count all-creators) (count recipients))
      (doseq [creator recipients]
        ;; Send the email if the creator's email hash matches the current month
        (when (= (-> creator :email hash (mod 12)) month)
          (try
            (messages/send-creator-sentiment-email! creator instance-data)
            (catch Throwable e
              (log/error e "Problem sending creator sentiment email:"))))))))

(jobs/defjob ^{:doc "Sends out a monthly survey to a portion of the creators."} CreatorSentimentEmail [_]
  (send-creator-sentiment-emails!))

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
                   ;; Fire at 2am on the second saturday of the month
                   (cron/cron-schedule "0 0 2 ? * 7#2")))]
    (task/schedule-task! job trigger)))
