(ns metabase.util.stats
  "Functions which summarize the usage of an instance"
  (:require [clojure.tools.logging :as log]
            [clj-http.client :as client]
            (metabase [config :as config]
                      [db :as db])
            [metabase.public-settings :as settings]
            (metabase.models [field :as field]
                             [table :as table]
                             [setting :as setting])           
            [metabase.util :as u]))

(def ^:private ^:const ^String metabase-usage-url "https://kqatai1z3c.execute-api.us-east-1.amazonaws.com/prod/ServerStatsCollector")

(def ^:private ^Integer anonymous-id
  "Generate an anonymous id. Don't worry too much about hash collisions or localhost cases, etc.
   The goal is to be able to get a rough sense for how many different hosts are throwing a specific error/event." 
  (hash (str (java.net.InetAddress/getLocalHost))))


(defn- anon-tracking-enabled? 
  "To avoid a circular reference"
  []
  (require 'metabase.public-settings)
  (resolve 'metabase.public-settings/anon-tracking-enabled))



(defn- bin-micro-number 
  "Return really small bin number. Assumes positive inputs"
  [x]
  (cond
    (= 0 x) "0"
    (= 1 x) "1"
    (= 2 x) "2"
    (> x 2) "3+")
  )


(defn- bin-small-number 
  "Return small bin number. Assumes positive inputs"
  [x]
  (cond
    (= 0 x) "0"
    (<= 1 x 5) "1-5"
    (<= 6 x 10) "6-10"
    (<= 11 x 25) "11-25"
    (> x 25) "25+")
  )

(defn- bin-medium-number 
  "Return medium bin number. Assumes positive inputs"
  [x]
  (cond
    (= 0 x) "0"
    (<= 1 x 5) "1-5"
    (<= 6 x 10) "6-10"
    (<= 11 x 25) "11-25"  
    (<= 26 x 50) "26-50"
    (<= 51 x 100) "51-100"
    (<= 101 x 250) "101-250"
    (> x 250) "250+")
  )


(defn- bin-large-number 
  "Return large bin number. Assumes positive inputs"
  [x]
  (cond
    (= 0 x) "0"
    (<= 1 x 10) "1-10"
    (<= 11 x 50) "11-50"
    (<= 51 x 250) "51-250"  
    (<= 251 x 1000) "251-1000"
    (<= 1001 x 10000) "1001-10000"
    (> x 10000) "10000+")
  )


(defn- get-settings 
  "Figure out global info aboutt his instance"
  []
  {:version               (config/mb-version-info :tag)
   :running_on            "unknown" ;; HOW DO I GET THIS? beanstalk vs heroku vs mac vs 'unknown'
   :application_database  (config/config-str :mb-db-type)
   :check_for_updates     (setting/get :check-for-updates)
   :site_name             (not= settings/site-name "Metabase")
   :report_timezone       (setting/get :report-timezone)
   :friendly_names        true ;; HOW DO I GET THIS?
   :email_configured      ((resolve 'metabase.email/email-configured?))
   :slack_configured      ((resolve 'metabase.integrations.slack/slack-configured?))
   :sso_configured        true ;; HOW DO I GET THIS?
   :instance_started      (new java.util.Date) ;; HOW DO I GET THIS?
   :has_sample_data       (db/exists? 'Database, :is_sample true)
   }
  )

;; util function
(def add-summaries 
  "add up some dictionaries"
  (partial merge-with +)
  )

;; User metrics
(defn user-dims 
  "characterize a user record"
  [user]
  {:total 1
   :active (if (user :is_active) 1 0) ;; HOW DO I GET THE LIST OF ALL USERS INCLUDING INACTIVES?
   :admin (if (user :is_superuser) 1 0)
   :logged-in (if (nil? (user :last_login)) 0 1)
   :sso (if (nil? (user :google_auth)) 0 1)}
  )


(defn get-user-metrics 
  "Get metrics based on user records
  TODO: get activity in terms of created questions, pulses and dashboards"
  []
  (let [users (db/select 'User)]   
    {:users (apply add-summaries (map user-dims users))}))


(defn get-group-metrics 
  "Get metrics based on groups:
  TODO characterize by # w/ sql access, # of users, no self-serve data access"
  []
  (let [groups (db/select 'PermissionsGroup)]
    {:groups (count groups)}))

;; Artifact Metrics
(defn question-dims 
  "characterize a saved question
  TODO: characterize by whether it has params, # of revisions, created by an admin"
  [question]
  (print question)
    {:total 1
     :native (if (= (question :iquery_type) "native") 1 0)
     :gui (if (not= (question :iquery_type) "native") 1 0)}
  )

(defn get-question-metrics 
  "Get metrics based on questions
  TODO characterize by # of labels
       characterize by # executions and avg latency"
  []
  (let [questions (db/select 'Card)]
    {:questions (count questions)}))

(defn get-dashboard-metrics 
  "Get metrics based on dashboards
  TODO characterize by # of cards, # of revisions, and created by an admin"
  []
  (let [dashboards (db/select 'Dashboard)]
    {:dashboards (count dashboards)}))

(defn get-pulse-metrics 
  "Get metrics based on pulses
  TODO: characterize by # of cards, non-user account emails, slack vs email, # emails"
  []
  (let [pulses (db/select 'Pulse)]
    {:pulses (count pulses)}))

(defn get-label-metrics 
  "Get metrics based on labels
  TODO: characterize by the # of cards each label has + how many cards are unlabeled"
  []
  (let [labels (db/select 'CardLabel)]
    {:labels (count labels)}))

;; Metadata Metrics
(defn get-database-metrics 
  "Get metrics based on databases
  TODO: characterize by # of schemas, tables, fields
        characterize by in-depth analysis enabled "
  []
  (let [databases (db/select 'Database)]
    {:databases (count databases)}))

(defn get-schema-metrics 
  "Get metrics based on schemas
  TODO merge this w/ tables?
       characterize by # tables"
  []
  (let [schemas (db/select 'Table)]
    {:schemas (count schemas)}))


(defn get-table-metrics 
  "Get metrics based on tables
  TODO characterize by # fields"
  []
  (let [tables (db/select 'Table)]
    {:tables (count tables)}))


(defn get-field-metrics 
  "Get metrics based on fields"
  []
  (let [fields (db/select 'Field)]
    {:fields (count fields)}))



(defn get-segment-metrics 
  "Get metrics based on segments"
  []
  (let [segments (db/select 'Segment)]
    {:segments (count segments)}))


(defn get-metric-metrics 
  "Get metrics based on metrics"
  []
  (let [metrics (db/select 'Metric)]
    {:metrics (count metrics)}))

;; Execution Metrics
(defn get-execution-metrics 
  "Get metrics based on executions. 
  This should be done in a single pass, as there might 
  be a LOT of query executions in a normal instance
  TODO: characterize by ad hoc vs cards
        characterize by latency
        characterize by error status"
  []
  (let [executions (db/select 'QueryExecution)]
    {:executions (count executions)}))

(defn get-map-metrics 
  "Get metrics based on custom geojson maps
  TODO figure out how to get at these"
  []
  (let [maps (db/select 'Segment)]
    {:maps (count maps)}))


(defn get-anonymous-usage-stats 
  "generate a map of the usage stats for this instance"
  []
  (when [setting/get :anon-tracking-enabled]
    ;do stuff
    (merge (get-settings)
           {:uuid anonymous-id :timestamp (new java.util.Date)}
            {:stats {
              :user (get-user-metrics)
              :question (get-question-metrics)
              :dashboard (get-dashboard-metrics)
              :database (get-database-metrics)
              :table (get-table-metrics)
              :field (get-field-metrics)
              :pulse (get-pulse-metrics)
              :segment (get-segment-metrics)
              :metric (get-metric-metrics)
              :group (get-group-metrics)
              :label (get-label-metrics)
              :execution (get-execution-metrics)}})))

(defn- send-stats 
  "send stats to Metabase tracking server"
  [stats]
   (try 
     (print (client/post metabase-usage-url {:form-params stats :content-type :json :throw-entire-message? true}))
      (catch Throwable e
       (log/error "Sending usage stats FAILED: " (.getMessage e)))))

(defn phone-home-stats 
  "doc-string"
  []
  (when (anon-tracking-enabled?)
      (send-stats (get-anonymous-usage-stats))))