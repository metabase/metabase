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
   [metabase.models.setting :as setting]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features]
   [metabase.task :as task]
   [metabase.util.i18n :refer [deferred-tru]]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(setting/defsetting ^:private no-surveys
  (deferred-tru "Enable or disable creator sentiment emails")
  :type       :boolean
  :default    true
  :visibility :internal
  :audit      :getter)

(defn- fetch-creators
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
                     (when has-whitelabelling? [:= :user.is_superuser true])]
             :group-by [:u.id]
             :having [:and
                      [:>= [:count [:distinct :rc.id]] 10]
                      [:>= [:count [:distinct [:case [:= :rc.query_type "native"] :rc.id]]] 2]
                      [:>= [:count [:distinct :d.id]] 1]]}))

(defn- fetch-num-users []
  (->
   (t2/query-one {:select [[:%count.* :num_users]]
                  :from [[:core_user :u]]
                  :where [:and
                          [:= :u.is_active true]
                          [:= :u.type "personal"]]})
   :num_users))

(defn- fetch-num-dashboards []
  (->
   (t2/query-one {:select [[:%count.* :num_dashboards]]
                  :from [[:report_dashboard :d]]
                  :where [:= :d.archived false]})
   :num_dashboards))

(defn- fetch-num-cards []
  (t2/query-one {:select [[[:count [:distinct [:case [:and [:= :rc.type "question"] [:= :rc.archived false]] :rc.id]]] :num_questions]
                          [[:count [:distinct [:case [:and [:= :rc.type "model"] [:= :rc.archived false]] :rc.id]]] :num_models]]
                 :from [[:report_card :rc]]}))

(defn- fetch-plan-info []
  (cond
    (and config/ee-available? (premium-features/is-hosted?) (premium-features/has-any-features?)) "pro-cloud/enterprise-cloud"
    (and config/ee-available? (premium-features/is-hosted?) (not (premium-features/has-any-features?))) "starter"
    (and config/ee-available? (not (premium-features/is-hosted?))) "pro-self-hosted/enterprise-self-hosted"
    (not config/ee-available?) "oss"
    :else "unknown"))

(defn- fetch-instance-data
  [tracking-enabled]
  (when tracking-enabled
    (let [num-cards (fetch-num-cards)]
      {:created_at (snowplow/instance-creation)
       :plan (fetch-plan-info)
       :verison (config/mb-version-info :tag)
       :num_users (fetch-num-users)
       :num_dashboards (fetch-num-dashboards)
       :num_questions (:num_questions num-cards)
       :num_models (:num_models num-cards)})))

(defn- send-creator-sentiment-emails!
  "Send an email to the instance admin following up on their experience with Metabase thus far."
  []
  ;; we need access to email AND the instance must have surveys enabled.
  (when (and (email/email-configured?)
             (not (no-surveys)))
    (let [instance-data (fetch-instance-data (public-settings/anon-tracking-enabled))
          creators (fetch-creators (premium-features/enable-whitelabeling?))
          month (- (.getValue (t/month)) 1)]
      (doseq [creator creators]
        ;; Send the email if the creator's email hash matches the current month
        (when (= (-> creator :email hash (mod 12)) month)
          (try
            (messages/send-creator-sentiment-email! creator instance-data)
            (catch Throwable e
              (log/error "Problem sending creator sentiment email:" e))))))))

(jobs/defjob ^{:doc "Sends out a general 2 week email follow up email"} CreatorSentimentEmail [_]
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
                   ;; Fire at 9:15am on the 1st day of every month
                   (cron/cron-schedule "0 15 9 1 * ?")))]
    (task/schedule-task! job trigger)))
