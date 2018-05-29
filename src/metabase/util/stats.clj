(ns metabase.util.stats
  "Functions which summarize the usage of an instance"
  (:require [clj-http.client :as client]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [medley.core :as m]
            [metabase
             [config :as config]
             [driver :as driver]
             [email :as email]
             [public-settings :as public-settings]
             [util :as u]]
            [metabase.api.session :as session-api]
            [metabase.integrations.slack :as slack]
            [metabase.models
             [card :refer [Card]]
             [collection :refer [Collection]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [database :refer [Database]]
             [field :refer [Field]]
             [humanization :as humanization]
             [metric :refer [Metric]]
             [permissions-group :refer [PermissionsGroup]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [query-cache :refer [QueryCache]]
             [query-execution :refer [QueryExecution]]
             [segment :refer [Segment]]
             [table :refer [Table]]
             [user :refer [User]]]
            [toucan.db :as db])
  (:import java.util.Date))

(defn- merge-count-maps
  "Merge sequence of maps MS by summing counts inside them.
   Non-integer values are allowed; truthy values are considered to add a count of `1`, while non-truthy
   values do not affect the result count."
  [ms]
  (reduce (partial merge-with +)
          (for [m ms]
            (m/map-vals #(cond
                           (number? %) %
                           %           1
                           :else       0)
                        m))))

(def ^:private ^:const ^String metabase-usage-url "https://xuq0fbkk0j.execute-api.us-east-1.amazonaws.com/prod")


#_(defn- bin-micro-number
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
  "Bin some frequencies using a passed in `binning-fn`.

     ;; Generate histogram for values of :a; `1` appears 3 times and `2` and `3` both appear once
     (histogram bin-micro-number [{:a 1} {:a 1} {:a 1} {:a 2} {:a 3}] :a)
     ;; -> {\"3+\" 1, \"1\" 2}

     ;; (or if you already have the counts)
     (histogram bin-micro-number [3 1 1])
     ;; -> {\"3+\" 1, \"1\" 2}"
  ([binning-fn counts]
   (frequencies (map binning-fn counts)))
  ([binning-fn many-maps k]
   (histogram binning-fn (vals (value-frequencies many-maps k)))))

#_(def ^:private micro-histogram
  "Return a histogram for micro numbers."
  (partial histogram bin-micro-number))

(def ^:private medium-histogram
  "Return a histogram for medium numbers."
  (partial histogram bin-medium-number))

(defn- instance-start-date
  "Return the data at which the very first User account was created."
  []
  (:min (db/select-one [User [:%min.date_joined :min]])))

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
   :friendly_names       (= (humanization/humanization-strategy) "advanced")
   :email_configured     (email/email-configured?)
   :slack_configured     (slack/slack-configured?)
   :sso_configured       (boolean (session-api/google-auth-client-id))
   :instance_started     (instance-start-date)
   :has_sample_data      (db/exists? Database, :is_sample true)})

(defn- user-metrics
  "Get metrics based on user records.
  TODO: get activity in terms of created questions, pulses and dashboards"
  []
  {:users (merge-count-maps (for [user (db/select [User :is_active :is_superuser :last_login :google_auth])]
                              {:total     1
                               :active    (:is_active    user)
                               :admin     (:is_superuser user)
                               :logged_in (:last_login   user)
                               :sso       (:google_auth  user)}))})

(defn- group-metrics
  "Get metrics based on groups:
  TODO characterize by # w/ sql access, # of users, no self-serve data access"
  []
  {:groups (db/count PermissionsGroup)})

(defn- card-has-params? [card]
  (boolean (get-in card [:dataset_query :native :template_tags])))

(defn- question-metrics
  "Get metrics based on questions
  TODO characterize by # executions and avg latency"
  []
  (let [cards (db/select [Card :query_type :public_uuid :enable_embedding :embedding_params :dataset_query])]
    {:questions (merge-count-maps (for [card cards]
                                    (let [native? (= (keyword (:query_type card)) :native)]
                                      {:total       1
                                       :native      native?
                                       :gui         (not native?)
                                       :with_params (card-has-params? card)})))
     :public    (merge-count-maps (for [card  cards
                                        :when (:public_uuid card)]
                                    {:total       1
                                     :with_params (card-has-params? card)}))
     :embedded  (merge-count-maps (for [card  cards
                                        :when (:enable_embedding card)]
                                    (let [embedding-params-vals (set (vals (:embedding_params card)))]
                                      {:total                1
                                       :with_params          (card-has-params? card)
                                       :with_enabled_params  (contains? embedding-params-vals "enabled")
                                       :with_locked_params   (contains? embedding-params-vals "locked")
                                       :with_disabled_params (contains? embedding-params-vals "disabled")})))}))

(defn- dashboard-metrics
  "Get metrics based on dashboards
  TODO characterize by # of revisions, and created by an admin"
  []
  (let [dashboards (db/select [Dashboard :creator_id :public_uuid :parameters :enable_embedding :embedding_params])
        dashcards  (db/select [DashboardCard :card_id :dashboard_id])]
    {:dashboards         (count dashboards)
     :with_params        (count (filter (comp seq :parameters) dashboards))
     :num_dashs_per_user (medium-histogram dashboards :creator_id)
     :num_cards_per_dash (medium-histogram dashcards :dashboard_id)
     :num_dashs_per_card (medium-histogram dashcards :card_id)
     :public             (merge-count-maps (for [dash  dashboards
                                                 :when (:public_uuid dash)]
                                             {:total       1
                                              :with_params (seq (:parameters dash))}))
     :embedded           (merge-count-maps (for [dash  dashboards
                                                 :when (:enable_embedding dash)]
                                             (let [embedding-params-vals (set (vals (:embedding_params dash)))]
                                               {:total                1
                                                :with_params          (seq (:parameters dash))
                                                :with_enabled_params  (contains? embedding-params-vals "enabled")
                                                :with_locked_params   (contains? embedding-params-vals "locked")
                                                :with_disabled_params (contains? embedding-params-vals "disabled")})))}))

(defn- db-frequencies
  "Fetch the frequencies of a given `column` with a normal SQL `SELECT COUNT(*) ... GROUP BY` query. This is way more
  efficient than fetching every single row and counting them in Clojure-land!

    (db-frequencies Database :engine)
    ;; -> {\"h2\" 2, \"postgres\" 1, ...}

    ;; include `WHERE` conditions or other arbitrary HoneySQL
    (db-frequencies Database :engine {:where [:= :is_sample false]})
    ;; -> {\"h2\" 1, \"postgres\" 1, ...}

    ;; Generate a histogram:
    (micro-histogram (vals (db-frequencies Database :engine)))
    ;; -> {\"2\" 1, \"1\" 1, ...}

    ;; Include `WHERE` clause that includes conditions for a Table related by an FK relationship:
    ;; (Number of Tables per DB engine)
    (db-frequencies Table (db/qualify Database :engine)
      {:left-join [Database [:= (db/qualify Database :id)
                                (db/qualify Table :db_id)]]})
    ;; -> {\"googleanalytics\" 4, \"postgres\" 48, \"h2\" 9}"
  {:style/indent 2}
  [model column & [additonal-honeysql]]
  (into {} (for [{:keys [k count]} (db/select [model [column :k] [:%count.* :count]]
                                     (merge {:group-by [column]}
                                            additonal-honeysql))]
             [k count])))

(defn- num-notifications-with-xls-or-csv-cards
  "Return the number of Notifications that satisfy `where-conditions` that have at least one PulseCard with `include_xls` or
  `include_csv`.

     ;; Pulses only (filter out Alerts)
     (num-notifications-with-xls-or-csv-cards [:= :alert_condition nil])"
  [& where-conditions]
  ;; :%distinct-count is a custom fn we registered in `metabase.util.honeysql-extensions`!
  (-> (db/query {:select    [[:%distinct-count.pulse.id  :count]]
                 :from      [:pulse]
                 :left-join [:pulse_card [:= :pulse.id :pulse_card.pulse_id]]
                 :where     (cons
                             :and
                             (cons
                              [:or [:= :pulse_card.include_csv true]
                               [:= :pulse_card.include_xls true]]
                              where-conditions))})
      first
      :count))

(defn- pulse-metrics
  "Get metrics based on pulses
  TODO: characterize by non-user account emails, # emails"
  []
  (let [pulse-conditions {:left-join [Pulse [:= :pulse.id :pulse_id]], :where [:= :pulse.alert_condition nil]}]
    {:pulses               (db/count Pulse :alert_condition nil)
     ;; "Table Cards" are Cards that include a Table you can download
     :with_table_cards     (num-notifications-with-xls-or-csv-cards [:= :alert_condition nil])
     :pulse_types          (db-frequencies PulseChannel :channel_type  pulse-conditions)
     :pulse_schedules      (db-frequencies PulseChannel :schedule_type pulse-conditions)
     :num_pulses_per_user  (medium-histogram (vals (db-frequencies Pulse     :creator_id (dissoc pulse-conditions :left-join))))
     :num_pulses_per_card  (medium-histogram (vals (db-frequencies PulseCard :card_id    pulse-conditions)))
     :num_cards_per_pulses (medium-histogram (vals (db-frequencies PulseCard :pulse_id   pulse-conditions)))}))

(defn- alert-metrics []
  (let [alert-conditions {:left-join [Pulse [:= :pulse.id :pulse_id]], :where [:not= (db/qualify Pulse :alert_condition) nil]}]
    {:alerts               (db/count Pulse :alert_condition [:not= nil])
     :with_table_cards     (num-notifications-with-xls-or-csv-cards [:not= :alert_condition nil])
     :first_time_only      (db/count Pulse :alert_condition [:not= nil], :alert_first_only true)
     :above_goal           (db/count Pulse :alert_condition [:not= nil], :alert_above_goal true)
     :alert_types          (db-frequencies PulseChannel :channel_type alert-conditions)
     :num_alerts_per_user  (medium-histogram (vals (db-frequencies Pulse     :creator_id (dissoc alert-conditions :left-join))))
     :num_alerts_per_card  (medium-histogram (vals (db-frequencies PulseCard :card_id    alert-conditions)))
     :num_cards_per_alerts (medium-histogram (vals (db-frequencies PulseCard :pulse_id   alert-conditions)))}))


(defn- collection-metrics
  "Get metrics on Collection usage."
  []
  (let [collections (db/select Collection)
        cards       (db/select [Card :collection_id])]
    {:collections              (count collections)
     :cards_in_collections     (count (filter :collection_id cards))
     :cards_not_in_collections (count (remove :collection_id cards))
     :num_cards_per_collection (medium-histogram cards :collection_id)}))

;; Metadata Metrics
(defn- database-metrics
  "Get metrics based on Databases."
  []
  {:databases (merge-count-maps (for [{is-full-sync? :is_full_sync} (db/select [Database :is_full_sync])]
                                  {:total    1
                                   :analyzed is-full-sync?}))})


(defn- table-metrics
  "Get metrics based on Tables."
  []
  (let [tables (db/select [Table :db_id :schema])]
    {:tables           (count tables)
     :num_per_database (medium-histogram tables :db_id)
     :num_per_schema   (medium-histogram tables :schema)}))


(defn- field-metrics
  "Get metrics based on Fields."
  []
  (let [fields (db/select [Field :table_id])]
    {:fields        (count fields)
     :num_per_table (medium-histogram fields :table_id)}))

(defn- segment-metrics
  "Get metrics based on Segments."
  []
  {:segments (db/count Segment)})

(defn- metric-metrics
  "Get metrics based on Metrics."
  []
  {:metrics (db/count Metric)})


;;; Execution Metrics

(defn summarize-executions
  "Summarize `executions`, by incrementing approriate counts in a summary map."
  ([]
   (summarize-executions (db/select-reducible [QueryExecution :executor_id :running_time :error])))
  ([executions]
   (reduce summarize-executions {:executions 0, :by_status {}, :num_per_user {}, :num_by_latency {}} executions))
  ([summary execution]
   (-> summary
       (update :executions u/safe-inc)
       (update-in [:by_status (if (:error execution)
                                "failed"
                                "completed")] u/safe-inc)
       (update-in [:num_per_user (:executor_id execution)] u/safe-inc)
       (update-in [:num_by_latency (bin-large-number (/ (:running_time execution) 1000))] u/safe-inc))))

(defn- summarize-executions-per-user
  "Convert a map of USER-ID->NUM-EXECUTIONS to the histogram output format we expect."
  [user-id->num-executions]
  (frequencies (map bin-large-number (vals user-id->num-executions))))

(defn- execution-metrics
  "Get metrics based on QueryExecutions."
  []
  (-> (summarize-executions)
      (update :num_per_user summarize-executions-per-user)))


;;; Cache Metrics

(defn- cache-metrics
  "Metrics based on use of the QueryCache."
  []
  (let [{:keys [length count]} (db/select-one [QueryCache [:%avg.%length.results :length] [:%count.* :count]])]
    {:average_entry_size (int (or length 0))
     :num_queries_cached (bin-small-number count)}))


;;; System Metrics

(defn- bytes->megabytes [b]
  (Math/round (double (/ b 1024 1024))))

(def ^:private system-property-names
  ["java.version" "java.vm.specification.version"  "java.runtime.name"
   "user.timezone" "user.language" "user.country" "file.encoding"
   "os.name" "os.version"])

(defn- system-metrics
  "Metadata about the environment Metabase is running in"
  []
  (let [runtime (Runtime/getRuntime)]
    (merge
     {:max_memory (bytes->megabytes (.maxMemory runtime))
      :processors (.availableProcessors runtime)}
     (zipmap (map #(keyword (str/replace % \. \_)) system-property-names)
             (map #(System/getProperty %) system-property-names)))))

;;; Combined Stats & Logic for sending them in

(defn anonymous-usage-stats
  "generate a map of the usage stats for this instance"
  []
  (merge (instance-settings)
         {:uuid (public-settings/site-uuid) :timestamp (Date.)}
         {:stats {:cache      (cache-metrics)
                  :collection (collection-metrics)
                  :dashboard  (dashboard-metrics)
                  :database   (database-metrics)
                  :execution  (execution-metrics)
                  :field      (field-metrics)
                  :group      (group-metrics)
                  :metric     (metric-metrics)
                  :pulse      (pulse-metrics)
                  :alert      (alert-metrics)
                  :question   (question-metrics)
                  :segment    (segment-metrics)
                  :system     (system-metrics)
                  :table      (table-metrics)
                  :user       (user-metrics)}}))


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
