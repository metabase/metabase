(ns metabase.util.stats
  "Functions which summarize the usage of an instance"
  (:require [clojure.tools.logging :as log]
            [clj-http.client :as client]
            [toucan.db :as db]
            [metabase.api.session :as session-api]
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.email :as email]
            [metabase.integrations.slack :as slack]
            (metabase.models [card :refer [Card]]
                             [card-label :refer [CardLabel]]
                             [collection :refer [Collection]]
                             [dashboard :refer [Dashboard]]
                             [dashboard-card :refer [DashboardCard]]
                             [database :refer [Database]]
                             [field :refer [Field]]
                             [humanization :as humanization]
                             [label :refer [Label]]
                             [metric :refer [Metric]]
                             [permissions-group :refer [PermissionsGroup]]
                             [pulse :refer [Pulse]]
                             [pulse-card :refer [PulseCard]]
                             [pulse-channel :refer [PulseChannel]]
                             [query-execution :refer [QueryExecution]]
                             [segment :refer [Segment]]
                             [table :refer [Table]]
                             [user :refer [User]])
            [metabase.public-settings :as public-settings]
            [metabase.util :as u]))

(def ^:private ^:const ^String metabase-usage-url "https://xuq0fbkk0j.execute-api.us-east-1.amazonaws.com/prod")

(def ^:private ^Integer anonymous-id
  "Generate an anonymous id. Don't worry too much about hash collisions or localhost cases, etc.
   The goal is to be able to get a rough sense for how many different hosts are throwing a specific error/event."
  (hash (str (java.net.InetAddress/getLocalHost))))

(defn- one-if
  "Return `1` if CONDITION is truthy, otherwise return `0`."
  [condition]
  (if condition 1 0))


(defn- bin-micro-number
  "Return really small bin number. Assumes positive inputs."
  [x]
  (case x
    0 "0"
    1 "1"
    2 "2"
    "3+"))


(defn- bin-small-number
  "Return small bin number. Assumes positive inputs."
  [x]
  (cond
    (= 0 x)      "0"
    (<= 1 x 5)   "1-5"
    (<= 6 x 10)  "6-10"
    (<= 11 x 25) "11-25"
    (> x 25)     "25+"))

(defn- bin-medium-number
  "Return medium bin number. Assumes positive inputs."
  [x]
  (cond
    (= 0 x)        "0"
    (<= 1 x 5)     "1-5"
    (<= 6 x 10)    "6-10"
    (<= 11 x 25)   "11-25"
    (<= 26 x 50)   "26-50"
    (<= 51 x 100)  "51-100"
    (<= 101 x 250) "101-250"
    (> x 250)      "250+"))


(defn- bin-large-number
  "Return large bin number. Assumes positive inputs."
  [x]
  (cond
    (= 0 x)           "0"
    (< x 1)           "< 1"
    (<= 1 x 10)       "1-10"
    (<= 11 x 50)      "11-50"
    (<= 51 x 250)     "51-250"
    (<= 251 x 1000)   "251-1000"
    (<= 1001 x 10000) "1001-10000"
    (> x 10000)       "10000+"))

(defn- value-frequencies
  "Go through a bunch of maps and count the frequency a given key's values."
  [many-maps k]
  (frequencies (map k many-maps)))

(defn- histogram
  "Bin some frequencies using a passed in BINNING-FN."
  [binning-fn many-maps k]
  (frequencies (map binning-fn (vals (value-frequencies many-maps k)))))

(def ^:private micro-histogram
  "Return a histogram for micro numbers."
  (partial histogram bin-micro-number))

(def ^:private small-histogram
  "Return a histogram for small numbers."
  (partial histogram bin-small-number))

(def ^:private medium-histogram
  "Return a histogram for medium numbers."
  (partial histogram bin-medium-number))

(def ^:private large-histogram
  "Return a histogram for large numbers."
  (partial histogram bin-large-number))

(defn- instance-start-date
  "Pull up the first user account and use that date"
  []
  (db/select-one-field :date_joined User {:order-by [[:date_joined :desc]]}))

(defn- environment-type
  "Figure out what we're running under"
  []
  (cond
    (= (config/config-str :mb-client) "OSX") :osx
    (config/config-str :rds-hostname)        :elastic-beanstalk
    (config/config-str :database-url)        :heroku ;; Putting this last as 'database-url' seems least specific
    :default                                 :unknown))

(defn- instance-settings
  "Figure out global info about his instance"
  []
  {:version              (config/mb-version-info :tag)
   :running_on           (environment-type)
   :application_database (config/config-str :mb-db-type)
   :check_for_updates    (public-settings/check-for-updates)
   :site_name            (not= (public-settings/site-name) "Metabase")
   :report_timezone      (driver/report-timezone)
   :friendly_names       (humanization/enable-advanced-humanization)
   :email_configured     (email/email-configured?)
   :slack_configured     (slack/slack-configured?)
   :sso_configured       (boolean (session-api/google-auth-client-id))
   :instance_started     (instance-start-date)
   :has_sample_data      (db/exists? Database, :is_sample true)})

;; util function
(def ^:private add-summaries
  "add up some dictionaries"
  (partial merge-with +))

;; User metrics
(defn- user-dims
  "Characterize a USER record."
  [user]
  {:total     1
   :active    (one-if (:is_active user)) ;; HOW DO I GET THE LIST OF ALL USERS INCLUDING INACTIVES?
   :admin     (one-if (:is_superuser user))
   :logged_in (one-if (:last_login user))
   :sso       (one-if (:google_auth user))})


(defn- user-metrics
  "Get metrics based on user records.
  TODO: get activity in terms of created questions, pulses and dashboards"
  []
  (let [users (db/select [User :is_active :is_superuser :last_login :google_auth])]
    {:users (apply add-summaries (map user-dims users))}))


(defn- group-metrics
  "Get metrics based on groups:
  TODO characterize by # w/ sql access, # of users, no self-serve data access"
  []
  {:groups (db/count PermissionsGroup)})

;; Artifact Metrics
(defn- question-dims
  "Characterize a saved QUESTION.
  TODO: characterize by whether it has params, # of revisions, created by an admin"
  [{query-type :query_type}]
    {:total  1
     :native (one-if (= query-type "native"))
     :gui    (one-if (not= query-type "native"))})

(defn- question-metrics
  "Get metrics based on questions
  TODO characterize by # executions and avg latency"
  []
  (let [questions (db/select [Card :id :query_type])]
    {:questions (apply add-summaries (map question-dims questions))}))

(defn- dashboard-metrics
  "Get metrics based on dashboards
  TODO characterize by # of revisions, and created by an admin"
  []
  (let [dashboards (db/select [Dashboard :id :creator_id])
        dashcards  (db/select [DashboardCard :id :card_id :dashboard_id])]
    {:dashboards         (count dashboards)
     :num_dashs_per_user (medium-histogram dashboards :creator_id)
     :num_cards_per_dash (medium-histogram dashcards :dashboard_id)
     :num_dashs_per_card (medium-histogram dashcards :card_id)}))

(defn- pulse-metrics
  "Get mes based on pulses
  TODO: characterize by non-user account emails, # emails"
  []
  (let [pulses         (db/select [Pulse :id :creator_id])
        pulse-cards    (db/select [PulseCard :id :card_id :pulse_id])
        pulse-channels (db/select [PulseChannel :channel_type :schedule_type])]
    {:pulses               (count pulses)
     :pulse_types          (frequencies (map :channel_type pulse-channels))
     :pulse_schedules      (frequencies (map :schedule_type pulse-channels))
     :num_pulses_per_user  (medium-histogram pulses :creator_id)
     :num_pulses_per_card  (medium-histogram pulse-cards :card_id)
     :num_cards_per_pulses (medium-histogram pulse-cards :pulse_id)}))


(defn- label-metrics
  "Get metrics based on labels"
  []
  (let [card-labels (db/select [CardLabel :card_id :label_id])]
    {:labels              (db/count Label)
     :num_labels_per_card (micro-histogram card-labels :card_id)
     :num_cards_per_label (medium-histogram card-labels :label_id)}))


(defn- collection-metrics
  "Get metrics on collection usage"
  []
  (let [collections (db/select Collection)
        cards       (db/select [Card :collection_id])]
    {:collections              (count collections)
     :cards_in_collections     (count (filter (comp nil?) (map :collection_id cards)))
     :cards_not_in_collections (count (filter nil? (map :collection_id cards)))
     :num_cards_per_collection (medium-histogram cards :collection_id)}))

;; Metadata Metrics
(defn- database-dims
  "characterize a database record"
  [database]
  {:total    1
   :analyzed (one-if (:is_full_sync database))})

(defn- database-metrics
  "Get metrics based on databases"
  []
  (let [databases (db/select [Database :id :is_full_sync])]
    {:databases (apply add-summaries (map database-dims databases))}))


(defn- table-metrics
  "Get metrics based on tables"
  []
  (let [tables (db/select [Table :id :db_id :schema])]
    {:tables           (count tables)
     :num_per_database (medium-histogram tables :db_id)
     :num_per_schema   (medium-histogram tables :schema)}))


(defn- field-metrics
  "Get metrics based on fields"
  []
  (let [fields (db/select [Field :table_id])]
    {:fields        (count fields)
     :num_per_table (medium-histogram fields :table_id)}))

(defn- segment-metrics
  "Get metrics based on segments."
  []
  {:segments (db/count Segment)})


(defn- metric-metrics
  "Get metrics based on metrics"
  []
  {:metrics (db/count Metric)})


(defn- bin-latencies
  "Bin latencies, which are in milliseconds"
  [query-executions]
  (let [latency-vals (map #(/ % 1000) (map :running_time query-executions))]
    (frequencies (map bin-large-number latency-vals))))


;; Execution Metrics
(defn- execution-metrics
  "Get metrics based on executions.
  This should be done in a single pass, as there might
  be a LOT of query executions in a normal instance."
  ;; TODO - This looks dangerous, pulling the entire set of QueryExecutions into memory at once to calculate these metrics (!)
  []
  (let [executions (db/select [QueryExecution :executor_id :running_time :status])]
    {:executions     (count executions)
     :by_status      (frequencies (map :status executions))
     :num_per_user   (large-histogram executions :executor_id)
     :num_by_latency (bin-latencies executions)}))


(defn anonymous-usage-stats
  "generate a map of the usage stats for this instance"
  []
  (merge (instance-settings)
         {:uuid anonymous-id, :timestamp (java.util.Date.)}
         {:stats {:user       (user-metrics)
                  :question   (question-metrics)
                  :dashboard  (dashboard-metrics)
                  :database   (database-metrics)
                  :table      (table-metrics)
                  :field      (field-metrics)
                  :pulse      (pulse-metrics)
                  :segment    (segment-metrics)
                  :metric     (metric-metrics)
                  :group      (group-metrics)
                  :label      (label-metrics)
                  :collection (collection-metrics)
                  :execution  (execution-metrics)}}))


(defn- send-stats!
  "send stats to Metabase tracking server"
  [stats]
   (try
      (client/post metabase-usage-url {:form-params stats, :content-type :json, :throw-entire-message? true})
      (catch Throwable e
       (log/error "Sending usage stats FAILED:" (.getMessage e)))))


(defn phone-home-stats!
  "Collect usage stats and phone them home"
  []
  (when (public-settings/anon-tracking-enabled)
    (send-stats! (anonymous-usage-stats))))
