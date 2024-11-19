(ns metabase.analytics.stats
  "Functions which summarize the usage of an instance"
  (:require
   [cheshire.core :as json]
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [clojure.walk :as walk]
   [environ.core :as env]
   [java-time.api :as t]
   [medley.core :as m]
   [metabase.analytics.snowplow :as snowplow]
   [metabase.config :as config]
   [metabase.db :as db]
   [metabase.db.query :as mdb.query]
   [metabase.driver :as driver]
   [metabase.eid-translation :as eid-translation]
   [metabase.email :as email]
   [metabase.embed.settings :as embed.settings]
   [metabase.integrations.google :as google]
   [metabase.integrations.slack :as slack]
   [metabase.models
    :refer [Card Collection Dashboard DashboardCard Database Field
            LegacyMetric PermissionsGroup Pulse PulseCard PulseChannel
            QueryCache Segment Table User]]
   [metabase.models.humanization :as humanization]
   [metabase.models.interface :as mi]
   [metabase.models.setting :as setting]
   [metabase.public-settings :as public-settings]
   [metabase.public-settings.premium-features :as premium-features :refer [defenterprise]]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- merge-count-maps
  "Merge sequence of maps `ms` by summing counts inside them. Non-integer values are allowed; truthy values are
  considered to add a count of `1`, while non-truthy values do not affect the result count."
  [ms]
  (reduce (partial merge-with +)
          {}
          (for [m ms]
            (m/map-vals #(cond
                           (number? %) %
                           %           1
                           :else       0)
                        m))))

(def ^:private ^String metabase-usage-url "https://xuq0fbkk0j.execute-api.us-east-1.amazonaws.com/prod")

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

(def ^:private medium-histogram
  "Return a histogram for medium numbers."
  (partial histogram bin-medium-number))

(defn environment-type
  "Figure out what we're running under"
  []
  (cond
    (config/config-str :rds-hostname)        :elastic-beanstalk
    (config/config-str :database-url)        :heroku ;; Putting this last as 'database-url' seems least specific
    :else                                    :unknown))

(def ^:private ui-colors #{:brand :filter :summarize})

(defn appearance-ui-colors-changed?
  "Returns true if the 'User Interface Colors' have been customized"
  []
  (boolean (seq (select-keys (public-settings/application-colors) ui-colors))))

(defn appearance-chart-colors-changed?
  "Returns true if the 'Chart Colors' have been customized"
  []
  (boolean (seq (apply dissoc (public-settings/application-colors) ui-colors))))

(defn- instance-settings
  "Figure out global info about this instance"
  []
  {:version                              (config/mb-version-info :tag)
   :running_on                           (environment-type)
   :startup_time_millis                  (int (public-settings/startup-time-millis))
   :application_database                 (config/config-str :mb-db-type)
   :check_for_updates                    (public-settings/check-for-updates)
   :report_timezone                      (driver/report-timezone)
   ;; We deprecated advanced humanization but have this here anyways
   :friendly_names                       (= (humanization/humanization-strategy) "advanced")
   :email_configured                     (email/email-configured?)
   :slack_configured                     (slack/slack-configured?)
   :sso_configured                       (google/google-auth-enabled)
   :instance_started                     (snowplow/instance-creation)
   :has_sample_data                      (t2/exists? Database, :is_sample true)
   :enable_embedding                     #_{:clj-kondo/ignore [:deprecated-var]} (embed.settings/enable-embedding)
   :enable_embedding_sdk                 (embed.settings/enable-embedding-sdk)
   :enable_embedding_interactive         (embed.settings/enable-embedding-interactive)
   :enable_embedding_static              (embed.settings/enable-embedding-static)
   :embedding_app_origin_set             (boolean
                                          #_{:clj-kondo/ignore [:deprecated-var]}
                                          (embed.settings/embedding-app-origin))
   :embedding_app_origin_sdk_set         (boolean (let [sdk-origins (embed.settings/embedding-app-origins-sdk)]
                                                    (and sdk-origins (not= "localhost:*" sdk-origins))))
   :embedding_app_origin_interactive_set (embed.settings/embedding-app-origins-interactive)
   :appearance_site_name                 (not= (public-settings/site-name) "Metabase")
   :appearance_help_link                 (public-settings/help-link)
   :appearance_logo                      (not= (public-settings/application-logo-url) "app/assets/img/logo.svg")
   :appearance_favicon                   (not= (public-settings/application-favicon-url) "app/assets/img/favicon.ico")
   :appearance_loading_message           (not= (public-settings/loading-message) :doing-science)
   :appearance_metabot_greeting          (not (public-settings/show-metabot))
   :appearance_login_page_illustration   (public-settings/login-page-illustration)
   :appearance_landing_page_illustration (public-settings/landing-page-illustration)
   :appearance_no_data_illustration      (public-settings/no-data-illustration)
   :appearance_no_object_illustration    (public-settings/no-object-illustration)
   :appearance_ui_colors                 (appearance-ui-colors-changed?)
   :appearance_chart_colors              (appearance-chart-colors-changed?)
   :appearance_show_mb_links             (not (public-settings/show-metabase-links))})

(defn- user-metrics
  "Get metrics based on user records.
  TODO: get activity in terms of created questions, pulses and dashboards"
  []
  {:users (merge-count-maps (for [user (t2/select [User :is_active :is_superuser :last_login :sso_source]
                                                  :type :personal)]
                              {:total     1
                               :active    (:is_active    user)
                               :admin     (:is_superuser user)
                               :logged_in (:last_login   user)
                               :sso       (= :google (:sso_source user))}))})

(defn- group-metrics
  "Get metrics based on groups:
  TODO characterize by # w/ sql access, # of users, no self-serve data access"
  []
  {:groups (t2/count PermissionsGroup)})

(defn- card-has-params? [card]
  (boolean (get-in card [:dataset_query :native :template-tags])))

(defn- question-metrics
  "Get metrics based on questions
  TODO characterize by # executions and avg latency"
  []
  (let [cards (t2/select [:model/Card :query_type :public_uuid :enable_embedding :embedding_params :dataset_query]
                         {:where (mi/exclude-internal-content-hsql :model/Card)})]
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
  (let [dashboards (t2/select [:model/Dashboard :creator_id :public_uuid :parameters :enable_embedding :embedding_params]
                              {:where (mi/exclude-internal-content-hsql :model/Dashboard)})
        dashcards  (t2/query {:select :dc.*
                              :from [[(t2/table-name DashboardCard) :dc]]
                              :join [[(t2/table-name Dashboard) :d] [:= :d.id :dc.dashboard_id]]
                              :where (mi/exclude-internal-content-hsql :model/Dashboard :table-alias :d)})]
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
    (db-frequencies Table (mdb.query/qualify Database :engine)
      {:left-join [Database [:= (mdb.query/qualify Database :id)
                                (mdb.query/qualify Table :db_id)]]})
    ;; -> {\"googleanalytics\" 4, \"postgres\" 48, \"h2\" 9}"
  [model column & [additonal-honeysql]]
  (into {} (for [{:keys [k count]} (t2/select [model [column :k] [:%count.* :count]]
                                              (merge {:group-by [column]}
                                                     additonal-honeysql))]
             [k count])))

(defn- num-notifications-with-xls-or-csv-cards
  "Return the number of Notifications that satisfy `where-conditions` that have at least one PulseCard with `include_xls` or
  `include_csv`.

     ;; Pulses only (filter out Alerts)
     (num-notifications-with-xls-or-csv-cards [:= :alert_condition nil])"
  [& where-conditions]
  (-> (mdb.query/query {:select    [[[::h2x/distinct-count :pulse.id] :count]]
                        :from      [:pulse]
                        :left-join [:pulse_card [:= :pulse.id :pulse_card.pulse_id]]
                        :where     (into
                                    [:and
                                     [:or
                                      [:= :pulse_card.include_csv true]
                                      [:= :pulse_card.include_xls true]]]
                                    where-conditions)})
      first
      :count))

(defn- pulse-metrics
  "Get metrics based on pulses
  TODO: characterize by non-user account emails, # emails"
  []
  (let [pulse-conditions {:left-join [:pulse [:= :pulse.id :pulse_id]], :where [:= :pulse.alert_condition nil]}]
    {:pulses               (t2/count Pulse :alert_condition nil)
     ;; "Table Cards" are Cards that include a Table you can download
     :with_table_cards     (num-notifications-with-xls-or-csv-cards [:= :alert_condition nil])
     :pulse_types          (db-frequencies PulseChannel :channel_type  pulse-conditions)
     :pulse_schedules      (db-frequencies PulseChannel :schedule_type pulse-conditions)
     :num_pulses_per_user  (medium-histogram (vals (db-frequencies Pulse     :creator_id (dissoc pulse-conditions :left-join))))
     :num_pulses_per_card  (medium-histogram (vals (db-frequencies PulseCard :card_id    pulse-conditions)))
     :num_cards_per_pulses (medium-histogram (vals (db-frequencies PulseCard :pulse_id   pulse-conditions)))}))

(defn- alert-metrics []
  (let [alert-conditions {:left-join [:pulse [:= :pulse.id :pulse_id]], :where [:not= (mdb.query/qualify Pulse :alert_condition) nil]}]
    {:alerts               (t2/count Pulse :alert_condition [:not= nil])
     :with_table_cards     (num-notifications-with-xls-or-csv-cards [:not= :alert_condition nil])
     :first_time_only      (t2/count Pulse :alert_condition [:not= nil], :alert_first_only true)
     :above_goal           (t2/count Pulse :alert_condition [:not= nil], :alert_above_goal true)
     :alert_types          (db-frequencies PulseChannel :channel_type alert-conditions)
     :num_alerts_per_user  (medium-histogram (vals (db-frequencies Pulse     :creator_id (dissoc alert-conditions :left-join))))
     :num_alerts_per_card  (medium-histogram (vals (db-frequencies PulseCard :card_id    alert-conditions)))
     :num_cards_per_alerts (medium-histogram (vals (db-frequencies PulseCard :pulse_id   alert-conditions)))}))

(defn- collection-metrics
  "Get metrics on Collection usage."
  []
  (let [collections (t2/select Collection {:where (mi/exclude-internal-content-hsql :model/Collection)})
        cards       (t2/select [Card :collection_id] {:where (mi/exclude-internal-content-hsql :model/Card)})]
    {:collections              (count collections)
     :cards_in_collections     (count (filter :collection_id cards))
     :cards_not_in_collections (count (remove :collection_id cards))
     :num_cards_per_collection (medium-histogram cards :collection_id)}))

;; Metadata Metrics
(defn- database-metrics
  "Get metrics based on Databases."
  []
  (let [databases (t2/select [:model/Database :is_full_sync :engine :dbms_version]
                             {:where (mi/exclude-internal-content-hsql :model/Database)})]
    {:databases (merge-count-maps (for [{is-full-sync? :is_full_sync} databases]
                                    {:total    1
                                     :analyzed is-full-sync?}))
     :dbms_versions (frequencies (map (fn [db]
                                        (-> db
                                            :dbms_version
                                            (assoc :engine (:engine db))
                                            json/generate-string))
                                      databases))}))

(defn- table-metrics
  "Get metrics based on Tables."
  []
  (let [tables (t2/query {:select [:t.db_id :t.schema]
                          :from   [[(t2/table-name :model/Table) :t]]
                          :join   [[(t2/table-name :model/Database) :d] [:= :d.id :t.db_id]]
                          :where  (mi/exclude-internal-content-hsql :model/Database :table-alias :d)})]
    {:tables           (count tables)
     :num_per_database (medium-histogram tables :db_id)
     :num_per_schema   (medium-histogram tables :schema)}))

(defn- field-metrics
  "Get metrics based on Fields."
  []
  (let [fields (t2/query {:select [:f.table_id]
                          :from [[(t2/table-name Field) :f]]
                          :join [[(t2/table-name Table) :t] [:= :t.id :f.table_id]
                                 [(t2/table-name Database) :d] [:= :d.id :t.db_id]]
                          :where (mi/exclude-internal-content-hsql :model/Database :table-alias :d)})]
    {:fields        (count fields)
     :num_per_table (medium-histogram fields :table_id)}))

(defn- segment-metrics
  "Get metrics based on Segments."
  []
  {:segments (t2/count Segment)})

(defn- metric-metrics
  "Get metrics based on Metrics."
  []
  {:metrics (t2/count LegacyMetric)})

;;; Execution Metrics

(defn- execution-metrics-sql []
  ;; Postgres automatically adjusts for daylight saving time when performing time calculations on TIMESTAMP WITH TIME
  ;; ZONE. This can cause discrepancies when subtracting 30 days if the calculation crosses a DST boundary (e.g., in the
  ;; Pacific/Auckland timezone). To avoid this, we ensure all date computations are done in UTC on Postgres to prevent
  ;; any time shifts due to DST. See PR #48204
  (let [thirty-days-ago (case (db/db-type)
                          :postgres "CURRENT_TIMESTAMP AT TIME ZONE 'UTC' - INTERVAL '30 days'"
                          :h2       "DATEADD('DAY', -30, CURRENT_TIMESTAMP)"
                          :mysql    "CURRENT_TIMESTAMP - INTERVAL 30 DAY")
        started-at      (case (db/db-type)
                          :postgres "started_at AT TIME ZONE 'UTC'"
                          :h2       "started_at"
                          :mysql    "started_at")
        timestamp-where (str started-at " > " thirty-days-ago)]
    (str/join
     "\n"
     ["WITH user_executions AS ("
      "    SELECT executor_id, COUNT(*) AS num_executions"
      "    FROM query_execution"
      "    WHERE " timestamp-where
      "    GROUP BY executor_id"
      "),"
      "query_stats_1 AS ("
      "    SELECT"
      "        COUNT(*) AS executions,"
      "        SUM(CASE WHEN error IS NULL OR length(error) = 0 THEN 1 ELSE 0 END) AS by_status__completed,"
      "        SUM(CASE WHEN error IS NOT NULL OR length(error) > 0 THEN 1 ELSE 0 END) AS by_status__failed,"
      "        COALESCE(SUM(CASE WHEN running_time = 0 THEN 1 ELSE 0 END), 0) AS num_by_latency__0,"
      "        COALESCE(SUM(CASE WHEN running_time > 0 AND running_time < 1000 THEN 1 ELSE 0 END), 0) AS num_by_latency__lt_1,"
      "        COALESCE(SUM(CASE WHEN running_time >= 1000 AND running_time < 10000 THEN 1 ELSE 0 END), 0) AS num_by_latency__1_10,"
      "        COALESCE(SUM(CASE WHEN running_time >= 10000 AND running_time < 50000 THEN 1 ELSE 0 END), 0) AS num_by_latency__11_50,"
      "        COALESCE(SUM(CASE WHEN running_time >= 50000 AND running_time < 250000 THEN 1 ELSE 0 END), 0) AS num_by_latency__51_250,"
      "        COALESCE(SUM(CASE WHEN running_time >= 250000 AND running_time < 1000000 THEN 1 ELSE 0 END), 0) AS num_by_latency__251_1000,"
      "        COALESCE(SUM(CASE WHEN running_time >= 1000000 AND running_time < 10000000 THEN 1 ELSE 0 END), 0) AS num_by_latency__1001_10000,"
      "        COALESCE(SUM(CASE WHEN running_time >= 10000000 THEN 1 ELSE 0 END), 0) AS num_by_latency__10000_plus"
      "    FROM query_execution"
      "    WHERE " timestamp-where
      "),"
      "query_stats_2 AS ("
      "    SELECT"
      "        COALESCE(SUM(CASE WHEN num_executions = 0 THEN 1 ELSE 0 END), 0) AS num_per_user__0,"
      "        COALESCE(SUM(CASE WHEN num_executions > 0 AND num_executions < 1 THEN 1 ELSE 0 END), 0) AS num_per_user__lt_1,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 1 AND num_executions < 10 THEN 1 ELSE 0 END), 0) AS num_per_user__1_10,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 10 AND num_executions < 50 THEN 1 ELSE 0 END), 0) AS num_per_user__11_50,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 50 AND num_executions < 250 THEN 1 ELSE 0 END), 0) AS num_per_user__51_250,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 250 AND num_executions < 1000 THEN 1 ELSE 0 END), 0) AS num_per_user__251_1000,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 1000 AND num_executions < 10000 THEN 1 ELSE 0 END), 0) AS num_per_user__1001_10000,"
      "        COALESCE(SUM(CASE WHEN num_executions >= 10000 THEN 1 ELSE 0 END), 0) AS num_per_user__10000_plus"
      "    FROM user_executions"
      ")"
      "SELECT q1.*, q2.* FROM query_stats_1 q1, query_stats_2 q2;"])))

(defn- execution-metrics
  "Get metrics based on QueryExecutions."
  []
  (let [maybe-rename-bin (fn [x]
                           ({"lt_1"       "< 1"
                             "1_10"       "1-10"
                             "11_50"      "11-50"
                             "51_250"     "51-250"
                             "251_1000"   "251-1000"
                             "1001_10000" "1001-10000"
                             "10000_plus" "10000+"} x x))
        raw-results (-> (first (t2/query (execution-metrics-sql)))
                        ;; cast numbers to int because some DBs output bigdecimals
                        (update-vals #(some-> % int)))]
    (reduce (fn [acc [k v]]
              (let [[prefix bin] (str/split (name k) #"__")]
                (if bin
                  (cond-> acc
                    (and (some? v) (pos? v))
                    (update (keyword prefix) #(assoc % (maybe-rename-bin bin) v)))
                  (assoc acc (keyword prefix) v))))
            {:executions     0
             :by_status      {}
             :num_per_user   {}
             :num_by_latency {}}
            raw-results)))

;;; Cache Metrics

(defn- cache-metrics
  "Metrics based on use of the QueryCache."
  []
  (let [{:keys [length count]} (t2/select-one [QueryCache [[:avg [:length :results]] :length] [:%count.* :count]])]
    {:average_entry_size (int (or length 0))
     :num_queries_cached (bin-small-number count)
     ;; this value gets used in the snowplow ping 'metrics' section.
     :num_queries_cached_unbinned count}))

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

(defn legacy-anonymous-usage-stats
  "generate a map of the usage stats for this instance"
  []
  (merge (instance-settings)
         {:uuid      (public-settings/site-uuid)
          :timestamp (t/offset-date-time)
          :stats     {:cache      (cache-metrics)
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

(defn- ^:deprecated send-stats-deprecated!
  "Send stats to Metabase tracking server."
  [stats]
  (try
    (http/post metabase-usage-url {:form-params stats, :content-type :json, :throw-entire-message? true})
    (catch Throwable e
      (log/error e "Sending usage stats FAILED"))))

(defn- in-docker?
  "Is the current Metabase process running in a Docker container?"
  []
  (boolean
   (or (.exists (io/file "/.dockerenv"))
       (when (.exists (io/file "/proc/self/cgroup"))
         (some #(re-find #"docker" %)
               (line-seq (io/reader "/proc/self/cgroup")))))))

(defn- deployment-model
  []
  (cond
    (premium-features/is-hosted?) "cloud"
    (in-docker?)                  "docker"
    :else                         "jar"))

(def ^:private activation-days 3)

(defn- sufficient-users?
  "Returns a Boolean indicating whether the number of non-internal users created within `activation-days` is greater
  than or equal to `num-users`"
  [num-users]
  (let [users-in-activation-period
        (t2/count :model/User {:where [:and
                                       [:<=
                                        :date_joined
                                        (t/plus (t/offset-date-time (setting/get :instance-creation))
                                                (t/days activation-days))]
                                       (mi/exclude-internal-content-hsql :model/User)]
                               :limit (inc num-users)})]
    (>= users-in-activation-period num-users)))

(defn- sufficient-queries?
  "Returns a Boolean indicating whether the number of queries recorded over non-sample content is greater than or equal
  to `num-queries`"
  [num-queries]
  (let [sample-db-id (t2/select-one-pk :model/Database :is_sample true)
        ;; QueryExecution can be large, so let's avoid counting everything
        queries      (t2/select-fn-set :id :model/QueryExecution
                                       {:where [:or
                                                [:not= :database_id sample-db-id]
                                                [:= :database_id nil]]
                                        :limit (inc num-queries)})]
    (>= (count queries) num-queries)))

(defn- completed-activation-signals?
  "If the current plan is Pro or Starter, returns a Boolean indicating whether the instance should be considered to have
  completed activation signals. Returns nil for non-Pro or Starter plans."
  []
  (let [plan     (premium-features/plan-alias)
        pro?     (when plan (str/starts-with? plan "pro"))
        starter? (when plan (str/starts-with? plan "starter"))]
    (cond
      pro?
      (or (sufficient-users? 4) (sufficient-queries? 201))

      starter?
      (or (sufficient-users? 2) (sufficient-queries? 101))

      :else
      nil)))

(defn m->kv-vec
  "Convert a map to a vector of key-value maps with keys 'key' and 'value' for each key-value pair in the map."
  [m]
  (mapv (fn [[k v]] {"key" (name k) "value" v}) m))

(defn- snowplow-instance-attributes
  [stats]
  (let [system-stats (-> stats :stats :system)
        instance-attributes
        (merge
         (dissoc system-stats :user_language)
         {:metabase_plan                    (premium-features/plan-alias)
          :metabase_version                 (-> stats :version)
          :language                         (-> system-stats :user_language)
          :report_timezone                  (-> stats :report_timezone)
          :deployment_model                 (deployment-model)
          :startup_time_millis              (-> stats :startup_time_millis)
          :has_activation_signals_completed (completed-activation-signals?)})]
    (m->kv-vec instance-attributes)))

(mu/defn- get-translation-count
  :- [:map [:ok :int] [:not-found :int] [:invalid-format :int] [:total :int]]
  "Get and clear the entity-id translation counter. This is meant to be called during the daily stats collection process."
  []
  (let [counter (setting/get-value-of-type :json :entity-id-translation-counter)]
    (merge counter {:total (apply + (vals counter))})))

(mu/defn- clear-translation-count!
  "We want to reset the eid translation count on every stat ping, so we do it here."
  []
  (u/prog1 eid-translation/default-counter
    (setting/set-value-of-type! :json :entity-id-translation-counter <>)))

(defn- categorize-query-execution [{client :embedding_client executor :executor_id}]
  (cond
    (= "embedding-sdk-react" client)                     "sdk_embed"
    (and (= "embedding-iframe" client) (some? executor)) "interactive_embed"
    (and (= "embedding-iframe" client) (nil? executor))  "static_embed"
    (and (#{"" nil} client) (nil? executor))             "public_link"
    :else                                                "internal"))

(defn- ->one-day-ago []
  (t/minus (t/offset-date-time) (t/days 1)))

(defn- ->snowplow-grouped-metric-info []
  (let [qe (t2/select [:model/QueryExecution :embedding_client :executor_id :started_at])
        one-day-ago (->one-day-ago)
        ;; reuse the query data:
        qe-24h (filter (fn [{started-at :started_at}] (t/after? one-day-ago started-at)) qe)]
    {:query-executions (merge
                        {"sdk_embed" 0 "interactive_embed" 0 "static_embed" 0 "public_link" 0 "internal" 0}
                        (-> (group-by categorize-query-execution qe)
                            (update-vals count)))
     :query-executions-24h (merge
                            {"sdk_embed" 0 "interactive_embed" 0 "static_embed" 0 "public_link" 0 "internal" 0}
                            (-> (group-by categorize-query-execution qe-24h)
                                (update-vals count)))
     :eid-translations-24h (get-translation-count)}))

(defn- deep-string-keywords
  "Snowplow data will not work if you pass in keywords, but this will let use use keywords all over."
  [data]
  (walk/postwalk
   (fn [x] (if (keyword? x) (-> x u/->snake_case_en name) x))
   data))

(mu/defn- snowplow-grouped-metrics
  :- [:sequential
      [:map
       ["name" :string]
       ["values" [:sequential [:map ["group" :string] ["value" :int]]]]
       ["tags" [:sequential :string]]]]
  [{:keys [eid-translations-24h
           query-executions
           query-executions-24h]
    :as _snowplow-grouped-metric-info}]
  (deep-string-keywords
   [{:name :query_executions_by_source
     :values (mapv (fn [qe-group]
                     {:group qe-group :value (get query-executions qe-group)})
                   ["interactive_embed" "internal" "public_link" "sdk_embed" "static_embed"])
     :tags ["embedding"]}
    {:name :query_executions_by_source_24h
     :values (mapv (fn [qe-group] {:group qe-group :value (get query-executions-24h qe-group)})
                   ["interactive_embed" "internal" "public_link" "sdk_embed" "static_embed"])
     :tags ["embedding"]}
    {:name :entity_id_translations_last_24h
     :values (mapv (fn [[k v]] {:group k :value v}) eid-translations-24h)
     :tags ["embedding"]}]))

(defn- ->snowplow-metric-info
  "Collects Snowplow metrics data that is not in the legacy stats format. Also clears entity id translation count."
  []
  (let [one-day-ago (->one-day-ago)
        total-translation-count (:total (get-translation-count))]
    {:models                          (t2/count :model/Card :type :model :archived false)
     :new_embedded_dashboards         (t2/count :model/Dashboard
                                                :enable_embedding true
                                                :archived false
                                                :created_at [:>= one-day-ago])
     :new_users_last_24h              (t2/count :model/User
                                                :is_active true
                                                :date_joined [:>= one-day-ago])
     :pivot_tables                    (t2/count :model/Card :display :pivot :archived false)
     :query_executions_last_24h       (t2/count :model/QueryExecution :started_at [:>= one-day-ago])
     :entity_id_translations_last_24h total-translation-count
     :scim_users_last_24h             (t2/count :model/User :sso_source :scim
                                                :is_active true
                                                :date_joined [:>= one-day-ago])}))

(mu/defn- snowplow-metrics
  [stats metric-info :- [:map
                         [:models :int]
                         [:new_embedded_dashboards :int]
                         [:new_users_last_24h :int]
                         [:pivot_tables :int]
                         [:query_executions_last_24h :int]
                         [:entity_id_translations_last_24h :int]]]
  (mapv
   (fn [[k v tags]]
     (assert (every? string? tags) "Tags must be strings in snowplow metrics.")
     (assert (some? v) "Cannot have a nil value in snowplow metrics.")
     {"name" (name k) "value" v "tags" (-> tags sort vec)})
   [[:above_goal_alerts               (get-in stats [:stats :alert :above_goal] 0)                    #{"alerts"}]
    [:alerts                          (get-in stats [:stats :alert :alerts] 0)                        #{"alerts"}]
    [:all_time_query_executions       (get-in stats [:stats :execution :executions] 0)                #{"query_executions"}]
    [:analyzed_databases              (get-in stats [:stats :database :databases :analyzed] 0)        #{}]
    [:cache_average_entry_size        (get-in stats [:stats :cache :average_entry_size] 0)            #{"cache"}]
    [:cache_num_queries_cached        (get-in stats [:stats :cache :num_queries_cached_unbinned] 0)   #{"cache"}]
    [:cards_in_collections            (get-in stats [:stats :collection :cards_in_collections] 0)     #{"collections"}]
    [:cards_not_in_collections        (get-in stats [:stats :collection :cards_not_in_collections] 0) #{"collections"}]
    [:collections                     (get-in stats [:stats :collection :collections] 0)              #{"collections"}]
    [:connected_databases             (get-in stats [:stats :database :databases :total] 0)           #{"databases"}]
    [:dashboards_with_params          (get-in stats [:stats :dashboard :with_params] 0)               #{"dashboards"}]
    [:embedded_dashboards             (get-in stats [:stats :dashboard :embedded :total] 0)           #{"dashboards" "embedding"}]
    [:embedded_questions              (get-in stats [:stats :question :embedded :total] 0)            #{"questions" "embedding"}]
    [:entity_id_translations_last_24h (:entity_id_translations_last_24h metric-info 0)                #{"embedding"}]
    [:first_time_only_alerts          (get-in stats [:stats :alert :first_time_only] 0)               #{"alerts"}]
    [:metabase_fields                 (get-in stats [:stats :field :fields] 0)                        #{"fields"}]
    [:metrics                         (get-in stats [:stats :metric :metrics] 0)                      #{"metrics"}]
    [:models                          (:models metric-info 0)                                         #{}]
    [:native_questions                (get-in stats [:stats :question :questions :native] 0)          #{"questions"}]
    [:new_embedded_dashboards         (:new_embedded_dashboards metric-info 0)                        #{}]
    [:new_users_last_24h              (:new_users_last_24h metric-info 0)                             #{"users"}]
    [:permission_groups               (get-in stats [:stats :group :groups] 0)                        #{"permissions"}]
    [:pivot_tables                    (:pivot_tables metric-info 0)                                   #{}]
    [:public_dashboards               (get-in stats [:stats :dashboard :public :total] 0)             #{"dashboards"}]
    [:public_dashboards_with_params   (get-in stats [:stats :dashboard :public :with_params] 0)       #{"dashboards"}]
    [:public_questions                (get-in stats [:stats :question :public :total] 0)              #{"questions"}]
    [:public_questions_with_params    (get-in stats [:stats :question :public :with_params] 0)        #{"questions"}]
    [:query_builder_questions         (get-in stats [:stats :question :questions :total] 0)           #{"questions"}]
    [:query_executions_last_24h       (:query_executions_last_24h metric-info 0)                      #{"query_executions"}]
    [:questions                       (get-in stats [:stats :question :questions :total] 0)           #{"questions"}]
    [:questions_with_params           (get-in stats [:stats :question :questions :with_params] 0)     #{"questions"}]
    [:segments                        (get-in stats [:stats :segment :segments] 0)                    #{"segments"}]
    [:tables                          (get-in stats [:stats :table :tables] 0)                        #{"tables"}]
    [:users                           (get-in stats [:stats :user :users :total] 0)                   #{"users"}]]))

(defn- whitelabeling-in-use?
  "Are any whitelabeling settings set to values other than their default?"
  []
  (let [whitelabel-settings (filter
                             (fn [setting] (= (:feature setting) :whitelabel))
                             (vals @setting/registered-settings))]
    (boolean
     (some
      (fn [setting]
        (not= ((:getter setting))
              (:default setting)))
      whitelabel-settings))))

(def csv-upload-version-availability
  "Map from driver engines to the first version ([major minor]) which introduced support for CSV uploads"
  {:postgres   [47 0]
   :mysql      [47 0]
   :redshift   [49 6]
   :clickhouse [50 0]})

(defn- csv-upload-available?
  "Is CSV upload currently available to be used on this instance?"
  []
  (boolean
   (let [major-version (config/current-major-version)
         minor-version (config/current-minor-version)
         engines       (t2/select-fn-set :engine :model/Database
                                         {:where [:in :engine (map name (keys csv-upload-version-availability))]})]
     (when (and major-version minor-version)
       (some
        (fn [engine]
          (when-let [[required-major required-minor] (csv-upload-version-availability engine)]
            (and (>= major-version required-major)
                 (>= minor-version required-minor))))
        engines)))))

(defn- ee-snowplow-features-data'
  []
  (let [features [:sso-jwt :sso-saml :scim :sandboxes :email-allow-list]]
    (map
     (fn [feature]
       {:name      feature
        :available false
        :enabled   false})
     features)))

(defenterprise ee-snowplow-features-data
  "OSS values to use for features which require calling EE code to check whether they are available/enabled."
  metabase-enterprise.stats
  []
  (ee-snowplow-features-data'))

(defn- snowplow-features-data
  []
  [{:name      :email
    :available true
    :enabled   (email/email-configured?)}
   {:name      :slack
    :available true
    :enabled   (slack/slack-configured?)}
   {:name      :sso-google
    :available true
    :enabled   (google/google-auth-configured)}
   {:name      :sso-ldap
    :available true
    :enabled   (public-settings/ldap-enabled?)}
   {:name      :sample-data
    :available true
    :enabled   (t2/exists? Database, :is_sample true)}
   {:name      :interactive-embedding
    :available (premium-features/hide-embed-branding?)
    :enabled   (and
                (embed.settings/enable-embedding-interactive)
                (boolean (embed.settings/embedding-app-origins-interactive))
                (public-settings/sso-enabled?))}
   {:name      :static-embedding
    :available true
    :enabled   (and
                (embed.settings/enable-embedding-static)
                (or
                 (t2/exists? :model/Dashboard :enable_embedding true)
                 (t2/exists? :model/Card :enable_embedding true)))}
   {:name      :public-sharing
    :available true
    :enabled   (and
                (public-settings/enable-public-sharing)
                (or
                 (t2/exists? :model/Dashboard :public_uuid [:not= nil])
                 (t2/exists? :model/Card :public_uuid [:not= nil])))}
   {:name      :whitelabel
    :available (premium-features/enable-whitelabeling?)
    :enabled   (whitelabeling-in-use?)}
   {:name      :csv-upload
    :available (csv-upload-available?)
    :enabled   (t2/exists? :model/Database :uploads_enabled true)}
   {:name      :mb-analytics
    :available (premium-features/enable-audit-app?)
    :enabled   (premium-features/enable-audit-app?)}
   {:name      :advanced-permissions
    :available (premium-features/enable-advanced-permissions?)
    :enabled   (premium-features/enable-advanced-permissions?)}
   {:name      :serialization
    :available (premium-features/enable-serialization?)
    :enabled   (premium-features/enable-serialization?)}
   {:name      :official-collections
    :available (premium-features/enable-official-collections?)
    :enabled   (t2/exists? :model/Collection :authority_level "official")}
   {:name      :cache-granular-controls
    :available (premium-features/enable-cache-granular-controls?)
    :enabled   (t2/exists? :model/CacheConfig)}
   {:name      :attached-dwh
    :available (premium-features/has-attached-dwh?)
    :enabled   (premium-features/has-attached-dwh?)}
   {:name      :database-auth-providers
    :available (premium-features/enable-database-auth-providers?)
    :enabled   (premium-features/enable-database-auth-providers?)}
   {:name      :config-text-file
    :available (premium-features/enable-config-text-file?)
    :enabled   (some? (get env/env :mb-config-file-path))}
   {:name      :content-verification
    :available (premium-features/enable-content-verification?)
    :enabled   (t2/exists? :model/ModerationReview)}
   {:name      :dashboard-subscription-filters
    :available (premium-features/enable-content-verification?)
    :enabled   (t2/exists? :model/Pulse {:where [:not= :parameters "[]"]})}
   {:name      :disable-password-login
    :available (premium-features/can-disable-password-login?)
    :enabled   (not (public-settings/enable-password-login))}
   {:name      :email-restrict-recipients
    :available (premium-features/enable-email-restrict-recipients?)
    :enabled   (not= (setting/get-value-of-type :keyword :user-visibility) :all)}
   {:name      :upload-management
    :available (premium-features/enable-upload-management?)
    :enabled   (t2/exists? :model/Table :is_upload true)}
   {:name      :snippet-collections
    :available (premium-features/enable-snippet-collections?)
    :enabled   (t2/exists? :model/Collection :namespace "snippets")}])

(defn- snowplow-features
  []
  (let [features (concat (snowplow-features-data) (ee-snowplow-features-data))]
    (mapv
     ;; Convert keys and feature names to strings to match expected Snowplow schema
     (fn [feature]
       (-> (update feature :name name)
           (update :name u/->snake_case_en)
           ;; Ensure that unavailable features are not reported as enabled
           (update :enabled (fn [enabled?] (if-not (:available feature) false enabled?)))
           (walk/stringify-keys)))
     features)))

(defn- snowplow-anonymous-usage-stats
  "Send stats to Metabase's snowplow collector. Transforms stats into the format required by the Snowplow schema."
  [stats]
  (let [instance-attributes (snowplow-instance-attributes stats)
        metrics             (snowplow-metrics stats (->snowplow-metric-info))
        grouped-metrics     (snowplow-grouped-metrics (->snowplow-grouped-metric-info))
        features            (snowplow-features)]
    ;; grouped_metrics and settings are required in the json schema, but their data will be included in the next Milestone:
    {"analytics_uuid"      (snowplow/analytics-uuid)
     "features"            features
     "grouped_metrics"     grouped-metrics
     "instance_attributes" instance-attributes
     "metrics"             metrics
     "settings"             []}))

(defn- generate-instance-stats!
  "Generate stats for this instance as data"
  []
  (let [stats (legacy-anonymous-usage-stats)]
    {:stats (-> stats
                ;; `:num_queries_cached_unbinned` is added to [[legacy-anonymous-usage-stats]]'s return value to make
                ;; computing [[snowplow-anonymous-usage-stats]] more efficient. It shouldn't be sent by
                ;; [[send-stats-deprecited!]].
                (update-in [:stats :cache] dissoc :num_queries_cached_unbinned))
     :snowplow-stats (snowplow-anonymous-usage-stats stats)}))

(defn- stats-post-cleanup []
  (clear-translation-count!))

(defn phone-home-stats!
  "Collect usage stats and phone them home"
  []
  (when (public-settings/anon-tracking-enabled)
    (let [start-time-ms                  (System/currentTimeMillis)
          {:keys [stats snowplow-stats]} (generate-instance-stats!)
          end-time-ms                    (System/currentTimeMillis)
          elapsed-secs                   (quot (- end-time-ms start-time-ms) 1000)
          snowplow-data                  (-> snowplow-stats
                                             (assoc "metadata" [{"key"   "stats_export_time_seconds"
                                                                 "value" elapsed-secs}])
                                             deep-string-keywords)]
      (assert (= #{"analytics_uuid" "features" "grouped_metrics" "instance_attributes" "metadata" "metrics" "settings"}
                 (set (keys snowplow-data)))
              (str "Missing required keys in snowplow-data. got:" (sort (keys snowplow-data))))
      #_{:clj-kondo/ignore [:deprecated-var]}
      (send-stats-deprecated! stats)
      (snowplow/track-event! ::snowplow/instance_stats snowplow-data)
      (stats-post-cleanup))))
