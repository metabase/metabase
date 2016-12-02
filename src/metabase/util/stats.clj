(ns metabase.util.stats
  "Functions which summarize the usage of an instance"
  (:require [clojure.tools.logging :as log]
            [clj-http.client :as client]
            (metabase [config :as config]
                      [db :as db])
            (metabase.models [field :as field]
                             [humanization :as humanization]
                             [table :as table]
                             [setting :as setting])
            [metabase.public-settings :as public-settings]
            [metabase.util :as u]))

(def ^:private ^:const ^String metabase-usage-url "https://xuq0fbkk0j.execute-api.us-east-1.amazonaws.com/prod")

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
  (case x
    0 "0"
    1 "1"
    2 "2"
    "3+"))


(defn- bin-small-number
  "Return small bin number. Assumes positive inputs"
  [x]
  (cond
    (= 0 x) "0"
    (<= 1 x 5) "1-5"
    (<= 6 x 10) "6-10"
    (<= 11 x 25) "11-25"
    (> x 25) "25+"))

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
    (> x 250) "250+"))


(defn- bin-large-number
  "Return large bin number. Assumes positive inputs"
  [x]
  (cond
    (= 0 x) "0"
    (< x 1) "< 1"
    (<= 1 x 10) "1-10"
    (<= 11 x 50) "11-50"
    (<= 51 x 250) "51-250"
    (<= 251 x 1000) "251-1000"
    (<= 1001 x 10000) "1001-10000"
    (> x 10000) "10000+"))

(defn- value-frequencies
  "go through a bunch of maps and count the frequency a given key's values"
  [many-maps k]
  (frequencies (map k many-maps)))

(defn- histogram
  "Bin some frequencies using a passed in binning function"
  [binning-fn many-maps k]
  (frequencies (map binning-fn (vals (value-frequencies many-maps k)))))

(def micro-histogram
  "Return a histogram for micro numbers"
  (partial histogram bin-micro-number))

(def small-histogram
  "Return a histogram for small numbers"
  (partial histogram bin-small-number))

(def medium-histogram
  "Return a histogram for medium numbers"
  (partial histogram bin-medium-number))

(def large-histogram
  "Return a histogram for large numbers"
  (partial histogram bin-large-number))

(defn- instance-start-date
  "Pull up the first user account and use that date"
  []
  (db/select-one-field :date_joined 'User {:order-by [[:date_joined :desc]]}))

(defn- environment-type
  "Figure out what we're running under"
  []
  (cond
    (= (config/config-str :mb-client) "OSX") :osx
    (config/config-str :rds-hostname) :elastic-beanstalk
    (config/config-str :database-url) :heroku ;; Putting this last as 'database-url' seems least specific
    :default :unknown))

(defn- instance-settings
  "Figure out global info about his instance"
  []
  {:version               (config/mb-version-info :tag)
   :running_on            (environment-type)
   :application_database  (config/config-str :mb-db-type)
   :check_for_updates     (setting/get :check-for-updates)
   :site_name             (not= (public-settings/site-name) "Metabase")
   :report_timezone       (setting/get :report-timezone)
   :friendly_names        (humanization/enable-advanced-humanization)
   :email_configured      ((resolve 'metabase.email/email-configured?))
   :slack_configured      ((resolve 'metabase.integrations.slack/slack-configured?))
   :sso_configured        (boolean ((resolve 'metabase.api.session/google-auth-client-id)))
   :instance_started      (instance-start-date)
   :has_sample_data       (db/exists? 'Database, :is_sample true)})

;; util function
(def add-summaries
  "add up some dictionaries"
  (partial merge-with +))

;; User metrics
(defn- user-dims
  "characterize a user record"
  [user]
  {:total 1
   :active (if (:is_active user) 1 0) ;; HOW DO I GET THE LIST OF ALL USERS INCLUDING INACTIVES?
   :admin (if (:is_superuser user) 1 0)
   :logged_in (if (nil? (:last_login user)) 0 1)
   :sso (if (nil? (:google_auth user)) 0 1)})


(defn- user-metrics
  "Get metrics based on user records
  TODO: get activity in terms of created questions, pulses and dashboards"
  []
  (let [users (db/select 'User)]
    {:users (apply add-summaries (map user-dims users))}))


(defn- group-metrics
  "Get metrics based on groups:
  TODO characterize by # w/ sql access, # of users, no self-serve data access"
  []
  (let [groups (db/select 'PermissionsGroup)]
    {:groups (count groups)}))

;; Artifact Metrics
(defn- question-dims
  "characterize a saved question
  TODO: characterize by whether it has params, # of revisions, created by an admin"
  [question]
    {:total 1
     :native (if (= (:query_type question) "native") 1 0)
     :gui (if (not= (:query_type question) "native") 1 0)})

(defn- question-metrics
  "Get metrics based on questions
  TODO characterize by # executions and avg latency"
  []
  (let [questions (db/select 'Card)]
    {:questions (apply add-summaries (map question-dims questions))}))

(defn- dashboard-metrics
  "Get metrics based on dashboards
  TODO characterize by # of revisions, and created by an admin"
  []
  (let [dashboards (db/select 'Dashboard)
        dashcards (db/select 'DashboardCard)]
    {:dashboards (count dashboards)
     :num_dashs_per_user (medium-histogram dashboards :creator_id)
     :num_cards_per_dash (medium-histogram dashcards :dashboard_id)
     :num_dashs_per_card (medium-histogram dashcards :card_id)}))

(defn- pulse-metrics
  "Get mes based on pulses
  TODO: characterize by non-user account emails, # emails"
  []
  (let [pulses (db/select 'Pulse)
        pulsecards (db/select 'PulseCard)
        pulsechannels (db/select 'PulseChannel)]
    {:pulses (count pulses)
     :pulse_types (frequencies (map :channel_type pulsechannels))
     :pulse_schedules (frequencies (map :schedule_type pulsechannels))
     :num_pulses_per_user (medium-histogram pulses :creator_id)
     :num_pulses_per_card (medium-histogram pulsecards :card_id)
     :num_cards_per_pulses (medium-histogram pulsecards :pulse_id)}))


(defn- label-metrics
  "Get metrics based on labels"
  []
  (let [labels (db/select 'CardLabel)]
    {:labels (count labels)
     :num_labels_per_card (micro-histogram labels :card_id)
     :num_cards_per_label (medium-histogram labels :label_id)}))

;; Metadata Metrics
(defn- database-dims
  "characterize a database record"
  [database]
  {:total 1
   :analyzed (if (:is_full_sync database) 1 0)})

(defn- database-metrics
  "Get metrics based on databases"
  []
  (let [databases (db/select 'Database)]
    {:databases (apply add-summaries (map database-dims databases))}))


(defn- table-metrics
  "Get metrics based on tables"
  []
  (let [tables (db/select 'Table)]
    {:tables (count tables)
     :num_per_database (medium-histogram tables :db_id)
     :num_per_schema (medium-histogram tables :schema)}))


(defn- field-metrics
  "Get metrics based on fields"
  []
  (let [fields (db/select 'Field)]
    {:fields (count fields)
     :num_per_table (medium-histogram fields :table_id)}))

(defn- segment-metrics
  "Get metrics based on segments"
  []
  (let [segments (db/select 'Segment)]
    {:segments (count segments)}))


(defn- metric-metrics
  "Get metrics based on metrics"
  []
  (let [metrics (db/select 'Metric)]
    {:metrics (count metrics)}))


(defn- bin-latencies
  "Bin latencies, which are in milliseconds"
  [query-executions]
  (let [latency-vals (map #(/ % 1000) (map :running_time query-executions))]
    (frequencies (map bin-large-number latency-vals))))


;; Execution Metrics
(defn- execution-metrics
  "Get metrics based on executions.
  This should be done in a single pass, as there might
  be a LOT of query executions in a normal instance
  TODO: characterize by ad hoc vs cards"
  []
  (let [executions (db/select ['QueryExecution :executor_id :running_time :status])]
    {:executions (count executions)
     :by_status (frequencies (map :status executions))
     :num_per_user (large-histogram executions :executor_id)
     :num_by_latency (bin-latencies executions)}))


(defn anonymous-usage-stats
  "generate a map of the usage stats for this instance"
  []
  (merge (instance-settings)
           {:uuid anonymous-id :timestamp (new java.util.Date)}
            {:stats {:user (user-metrics)
                     :question (question-metrics)
                     :dashboard (dashboard-metrics)
                     :database (database-metrics)
                     :table (table-metrics)
                     :field (field-metrics)
                     :pulse (pulse-metrics)
                     :segment (segment-metrics)
                     :metric (metric-metrics)
                     :group (group-metrics)
                     :label (label-metrics)
                     :execution (execution-metrics)}}))


(defn- send-stats!
  "send stats to Metabase tracking server"
  [stats]
   (try
      (client/post metabase-usage-url {:form-params stats, :content-type :json, :throw-entire-message? true})
      (catch Throwable e
       (log/error "Sending usage stats FAILED: " (.getMessage e)))))


(defn phone-home-stats!
  "Collect usage stats and phone them home"
  []
  (when (anon-tracking-enabled?)
    (let [stats (anonymous-usage-stats)]
      (send-stats! stats))))