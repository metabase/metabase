(ns metabase.analytics.stats-test
  (:require
   [clojure.java.io :as io]
   [clojure.set :as set]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.analytics.stats :as stats :refer [legacy-anonymous-usage-stats]]
   [metabase.config :as config]
   [metabase.core :as mbc]
   [metabase.db :as mdb]
   [metabase.email :as email]
   [metabase.integrations.slack :as slack]
   [metabase.premium-features.core :as premium-features]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]))

(use-fixtures :once (fixtures/initialize :db))

(deftest merge-count-maps-test
  (testing "Merging maps with various scenarios"
    (are [expected input-maps _description]
         (= expected (#'stats/merge-count-maps input-maps))

      {:a 1, :b 2}
      [{:a 1} {:b 2}]
      "Merging two maps with non-overlapping keys"

      {:a 3, :b 2}
      [{:a 1, :b 2} {:a 2}]
      "Merging two maps with overlapping keys"

      {:a 1, :b 22, :c 30}
      [{:a 1, :b 2} {:b 20, :c 30} {}]
      "Merging more than two maps"

      {:a 1, :b 1}
      [{:a 1} {:b "other values, like strings, are considered to be 1"}]
      "Handling string values"

      {:a 1, :b 22, :c 30, :d 1}
      [{:a 1, :b 2} {:b 20, :c 30} {:d "strings count as one"}]
      "Comprehensive test with all scenarios"

      {}
      [{} {} {}]
      "Merging empty maps"

      {:a 1, :b 2}
      [{:a 1, :b 2}]
      "Merging a single map")))

(deftest ^:parallel bin-small-number-test
  (are [expected n] (= expected
                       (#'stats/bin-small-number n))
    "0"     0
    "1-5"   1
    "1-5"   5
    "6-10"  6
    "6-10"  10
    "11-25" 11
    "11-25" 25
    "25+"   26
    "25+"   500))

(deftest ^:parallel bin-medium-number-test
  (are [expected n] (= expected
                       (#'stats/bin-medium-number n))
    "0"       0
    "1-5"     1
    "1-5"     5
    "6-10"    6
    "6-10"    10
    "11-25"   11
    "11-25"   25
    "26-50"   26
    "26-50"   50
    "51-100"  51
    "51-100"  100
    "101-250" 101
    "101-250" 250
    "250+"    251
    "250+"    5000))

(deftest anonymous-usage-stats-test
  (with-redefs [email/email-configured? (constantly false)
                slack/slack-configured? (constantly false)]
    (mt/with-temporary-setting-values [site-name          "Metabase"
                                       startup-time-millis 1234.0
                                       google-auth-enabled false
                                       enable-embedding    false]
      (mt/with-temp [:model/Database _ {:is_sample true}]
        (let [stats (legacy-anonymous-usage-stats)]
          (is (partial= {:running_on                           :unknown
                         :check_for_updates                    true
                         :startup_time_millis                  1234
                         :friendly_names                       false
                         :email_configured                     false
                         :slack_configured                     false
                         :sso_configured                       false
                         :has_sample_data                      true
                         :enable_embedding                     false
                         :embedding_app_origin_set             false
                         :appearance_site_name                 false
                         :appearance_help_link                 :metabase
                         :appearance_logo                      false
                         :appearance_favicon                   false
                         :appearance_loading_message           false
                         :appearance_metabot_greeting          false
                         :appearance_login_page_illustration   "default"
                         :appearance_landing_page_illustration "default"
                         :appearance_no_data_illustration      "default"
                         :appearance_no_object_illustration    "default"
                         :appearance_ui_colors                 false
                         :appearance_chart_colors              false
                         :appearance_show_mb_links             false}
                        stats))
          (is (malli= [:map-of :string ms/IntGreaterThanOrEqualToZero]
                      (-> stats :stats :database :dbms_versions))))))))

(deftest anonymous-usage-stats-test-ee-with-values-changed
  ; some settings are behind the whitelabel feature flag
  (mt/with-premium-features #{:whitelabel}
    (with-redefs [email/email-configured? (constantly false)
                  slack/slack-configured? (constantly false)]
      (mt/with-temporary-setting-values [site-name                   "My Company Analytics"
                                         startup-time-millis          1234.0
                                         google-auth-enabled          false
                                         enable-embedding             true
                                         embedding-app-origin         "localhost:8888"
                                         help-link                    :hidden
                                         application-logo-url         "http://example.com/logo.png"
                                         application-favicon-url      "http://example.com/favicon.ico"
                                         loading-message              :running-query
                                         show-metabot                 false
                                         login-page-illustration      "default"
                                         landing-page-illustration    "custom"
                                         no-data-illustration         "none"
                                         no-object-illustration       "custom"
                                         application-colors           {:brand "#123456"}
                                         show-metabase-links          false]
        (mt/with-temp [:model/Database _ {:is_sample true}]
          (let [stats (legacy-anonymous-usage-stats)]
            (is (partial= {:running_on                           :unknown
                           :check_for_updates                    true
                           :startup_time_millis                  1234
                           :friendly_names                       false
                           :email_configured                     false
                           :slack_configured                     false
                           :sso_configured                       false
                           :has_sample_data                      true
                           :enable_embedding                     true
                           :embedding_app_origin_set             false
                           :appearance_site_name                 true
                           :appearance_help_link                 :hidden
                           :appearance_logo                      true
                           :appearance_favicon                   true
                           :appearance_loading_message           true
                           :appearance_metabot_greeting          true
                           :appearance_login_page_illustration   "default"
                           :appearance_landing_page_illustration "custom"
                           :appearance_no_data_illustration      "none"
                           :appearance_no_object_illustration    "custom"
                           :appearance_ui_colors                 true
                           :appearance_chart_colors              false
                           :appearance_show_mb_links             true}
                          stats))
            (is (malli= [:map-of :string ms/IntGreaterThanOrEqualToZero]
                        (-> stats :stats :database :dbms_versions)))))))))

(deftest ^:parallel conversion-test
  (is (= #{true}
         (let [system-stats (get-in (legacy-anonymous-usage-stats) [:stats :system])]
           (into #{} (map #(contains? system-stats %) [:java_version :java_runtime_name :max_memory]))))
      "Spot checking a few system stats to ensure conversion from property names and presence in the anonymous-usage-stats"))

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

(def ^:private large-histogram (partial #'stats/histogram bin-large-number))

(defn- old-execution-metrics []
  (let [executions (t2/select [:model/QueryExecution :executor_id :running_time :error])]
    {:executions     (count executions)
     :by_status      (frequencies (for [{error :error} executions]
                                    (if error
                                      "failed"
                                      "completed")))
     :num_per_user   (large-histogram executions :executor_id)
     :num_by_latency (frequencies (for [{latency :running_time} executions]
                                    (bin-large-number (/ latency 1000))))}))

(def query-execution-defaults
  {:hash         (qp.util/query-hash {})
   :running_time 1
   :result_rows  1
   :native       false
   :executor_id  nil
   :card_id      nil
   :context      :ad-hoc
   :started_at   (t/offset-date-time)})

(deftest new-impl-test
  (mt/with-temp [:model/QueryExecution _ (merge query-execution-defaults
                                                {:error "some error"})
                 :model/QueryExecution _ (merge query-execution-defaults
                                                {:error "some error"})
                 :model/QueryExecution _ query-execution-defaults]
    (is (= (old-execution-metrics)
           (#'stats/execution-metrics))
        "the new version of the executions metrics works the same way the old one did")))

(deftest execution-metrics-started-at-test
  (testing "execution metrics should not be sensitive to the app db time zone\n"
    (doseq [tz ["Pacific/Auckland" "Europe/Helsinki"]]
      (testing tz
        (mt/with-app-db-timezone-id! tz
          (let [get-executions #(:executions (#'stats/execution-metrics))
                before         (get-executions)]
            (mt/with-temp [:model/QueryExecution _ (merge query-execution-defaults
                                                          {:started_at (-> (t/offset-date-time (t/zone-id "UTC"))
                                                                           (t/minus (t/days 30))
                                                                           (t/plus (t/minutes 10)))})]
              (is (= (inc before)
                     (get-executions))
                  "execution metrics include query executions since 30 days ago"))
            (mt/with-temp [:model/QueryExecution _ (merge query-execution-defaults
                                                          {:started_at (-> (t/offset-date-time (t/zone-id "UTC"))
                                                                           (t/minus (t/days 30))
                                                                           (t/minus (t/minutes 10)))})]
              (is (= before
                     (get-executions))
                  "the executions metrics exclude query executions before 30 days ago"))))))))

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Pulses & Alerts                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; make sure we get some reasonable Pulses & Alert metrics, and they filter each other out as appropriate

;;  alert_condition character varying(254), -- Condition (i.e. "rows" or "goal") used as a guard for alerts
;;  alert_first_only boolean, -- True if the alert should be disabled after the first notification
;;  alert_above_goal boolean, -- For a goal condition, alert when above the goal
(deftest pulses-and-alerts-test
  (mt/with-temp [:model/Card         c {}
                 ;; ---------- Pulses ----------
                 :model/Pulse        p1 {}
                 :model/Pulse        p2 {}
                 :model/Pulse        p3 {}
                 :model/PulseChannel _ {:pulse_id (u/the-id p1), :schedule_type "daily", :channel_type "email"}
                 :model/PulseChannel _ {:pulse_id (u/the-id p1), :schedule_type "weekly" :schedule_day "sun", :channel_type "email"}
                 :model/PulseChannel _ {:pulse_id (u/the-id p2), :schedule_type "daily", :channel_type "slack"}
                 ;; Pulse 1 gets 2 Cards (1 CSV)
                 :model/PulseCard    _ {:pulse_id (u/the-id p1), :card_id (u/the-id c)}
                 :model/PulseCard    _ {:pulse_id (u/the-id p1), :card_id (u/the-id c), :include_csv true}
                 ;; Pulse 2 gets 1 Card
                 :model/PulseCard    _ {:pulse_id (u/the-id p1), :card_id (u/the-id c)}
                 ;; Pulse 3 gets 7 Cards (1 CSV, 2 XLS, 2 BOTH)
                 :model/PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c)}
                 :model/PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c)}
                 :model/PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c), :include_csv true}
                 :model/PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c), :include_xls true}
                 :model/PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c), :include_xls true}
                 :model/PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c), :include_csv true, :include_xls true}
                 :model/PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c), :include_csv true, :include_xls true}
                 ;; ---------- Alerts ----------
                 :model/Pulse        a1 {:alert_condition "rows", :alert_first_only false}
                 :model/Pulse        a2 {:alert_condition "rows", :alert_first_only true}
                 :model/Pulse        a3 {:alert_condition "goal", :alert_first_only false}
                 :model/Pulse        _  {:alert_condition "goal", :alert_first_only false, :alert_above_goal true}
                 ;; Alert 1 is Email, Alert 2 is Email & Slack, Alert 3 is Slack-only
                 :model/PulseChannel _ {:pulse_id (u/the-id a1), :channel_type "email"}
                 :model/PulseChannel _ {:pulse_id (u/the-id a1), :channel_type "email"}
                 :model/PulseChannel _ {:pulse_id (u/the-id a2), :channel_type "slack"}
                 :model/PulseChannel _ {:pulse_id (u/the-id a3), :channel_type "slack"}
                 ;; Alert 1 gets 2 Cards (1 CSV)
                 :model/PulseCard    _ {:pulse_id (u/the-id a1), :card_id (u/the-id c)}
                 :model/PulseCard    _ {:pulse_id (u/the-id a1), :card_id (u/the-id c), :include_csv true}
                 ;; Alert 2 gets 1 Card
                 :model/PulseCard    _ {:pulse_id (u/the-id a1), :card_id (u/the-id c)}
                 ;; Alert 3 gets 7 Cards (1 CSV, 2 XLS, 2 BOTH)
                 :model/PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c)}
                 :model/PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c)}
                 :model/PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c), :include_csv true}
                 :model/PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c), :include_xls true}
                 :model/PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c), :include_xls true}
                 :model/PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c), :include_csv true, :include_xls true}
                 :model/PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c), :include_csv true, :include_xls true}
                 ;; Alert 4 gets 3 Cards
                 :model/PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c)}
                 :model/PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c)}
                 :model/PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c)}]
    (is (malli= [:map
                 [:pulses               [:int {:min 3}]]
                 [:with_table_cards     [:int {:min 2}]]
                 [:pulse_types          [:map
                                         ["slack" [:int {:min 1}]]
                                         ["email" [:int {:min 2}]]]]
                 [:pulse_schedules      [:map
                                         ["daily"  [:int {:min 2}]]
                                         ["weekly" [:int {:min 1}]]]]
                 [:num_pulses_per_user  [:map
                                         ["1-5" [:int {:min 1}]]]]
                 [:num_pulses_per_card  [:map
                                         ["6-10" [:int {:min 1}]]]]
                 [:num_cards_per_pulses [:map
                                         ["1-5"  [:int {:min 1}]]
                                         ["6-10" [:int {:min 1}]]]]]
                (#'stats/pulse-metrics)))
    (is (malli= [:map
                 [:alerts               [:int {:min 4}]]
                 [:with_table_cards     [:int {:min 2}]]
                 [:first_time_only      [:int {:min 1}]]
                 [:above_goal           [:int {:min 1}]]
                 [:alert_types          [:map
                                         ["slack" [:int {:min 2}]]
                                         ["email" [:int {:min 2}]]]]
                 [:num_alerts_per_user  [:map
                                         ["1-5" [:int {:min 1}]]]]
                 [:num_alerts_per_card  [:map
                                         ["11-25" [:int {:min 1}]]]]
                 [:num_cards_per_alerts [:map
                                         ["1-5"  [:int {:min 1}]]
                                         ["6-10" [:int {:min 1}]]]]]
                (#'stats/alert-metrics)))))

(deftest internal-content-metrics-test
  (testing "Internal content doesn't contribute to stats"
    (mt/with-temp-empty-app-db [_conn :h2]
      (mdb/setup-db! :create-sample-content? true)
      (mbc/ensure-audit-db-installed!)
      (testing "sense check: internal content exists"
        (is (true? (t2/exists? :model/User)))
        (is (true? (t2/exists? :model/Database)))
        (is (true? (t2/exists? :model/Table)))
        (is (true? (t2/exists? :model/Field)))
        (is (true? (t2/exists? :model/Collection)))
        (is (true? (t2/exists? :model/Dashboard)))
        (is (true? (t2/exists? :model/Card))))
      (testing "All metrics should be empty"
        (is (= {:users {}}
               (#'stats/user-metrics)))
        (is (= {:databases {}, :dbms_versions {}}
               (#'stats/database-metrics)))
        (is (= {:tables 0, :num_per_database {}, :num_per_schema {}}
               (#'stats/table-metrics)))
        (is (= {:num_per_table {}, :fields 0}
               (#'stats/field-metrics)))
        (is (= {:collections 0, :cards_in_collections 0, :cards_not_in_collections 0, :num_cards_per_collection {}}
               (#'stats/collection-metrics)))
        (is (= {:questions {}, :public {}, :embedded {}}
               (#'stats/question-metrics)))
        (is (= {:dashboards         0
                :with_params        0
                :num_dashs_per_user {}
                :num_cards_per_dash {}
                :num_dashs_per_card {}
                :public             {}
                :embedded           {}}
               (#'stats/dashboard-metrics)))))))

(deftest activation-signals-test
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? true)

    (testing "sufficient-users? correctly counts the number of users within three days of instance creation"
      (is (false? (@#'stats/sufficient-users? 1)))

      (mt/with-temp [:model/User _ {:date_joined
                                    (t/plus (t/offset-date-time) (t/days 4))}]
        (is (false? (@#'stats/sufficient-users? 1))))

      (mt/with-temp [:model/User _ {:date_joined (t/offset-date-time)}]
        (is (true? (@#'stats/sufficient-users? 1)))))

    (testing "sufficient-queries? correctly counts the number of queries"
      (is (false? (@#'stats/sufficient-queries? 1)))
      (mt/with-temp [:model/QueryExecution _ query-execution-defaults]
        (is (true? (@#'stats/sufficient-queries? 1)))))))

(deftest csv-upload-available-test
  (mt/with-temp-empty-app-db [_conn :h2]
    (mdb/setup-db! :create-sample-content? true)

    (testing "csv-upload-available? currently detects upload availability based on the current MB version"
      (mt/with-temp [:model/Database _ {:engine :postgres}]
        (with-redefs [config/current-major-version (constantly 46)
                      config/current-minor-version (constantly 0)]
          (is false? (@#'stats/csv-upload-available?)))

        (with-redefs [config/current-major-version (constantly 47)
                      config/current-minor-version (constantly 1)]
          (is true? (@#'stats/csv-upload-available?))))

      (mt/with-temp [:model/Database _ {:engine :redshift}]
        (with-redefs [config/current-major-version (constantly 49)
                      config/current-minor-version (constantly 5)]
          (is false? (@#'stats/csv-upload-available?)))

        (with-redefs [config/current-major-version (constantly 49)
                      config/current-minor-version (constantly 6)]
          (is true? (@#'stats/csv-upload-available?))))

      ;; If we can't detect the MB version, return nil
      (with-redefs [config/current-major-version (constantly nil)
                    config/current-minor-version (constantly nil)]
        (is false? (@#'stats/csv-upload-available?))))))

(deftest deployment-model-test
  (testing "deployment model correctly reports cloud/docker/jar"
    (with-redefs [premium-features/is-hosted? (constantly true)]
      (is (= "cloud" (@#'stats/deployment-model))))

    ;; Lets just mock io/file to always return an existing (temp) file, to validate that we're doing a filesystem check
    ;; to determine whether we're in a Docker container
    (mt/with-temp-file [mock-file]
      (spit mock-file "Temp file!")
      (with-redefs [premium-features/is-hosted? (constantly false)
                    io/file                     (constantly (java.io.File. mock-file))]
        (is (= "docker" (@#'stats/deployment-model)))))

    (with-redefs [premium-features/is-hosted? (constantly false)
                  stats/in-docker?            (constantly false)]
      (is (= "jar" (@#'stats/deployment-model))))))

(deftest no-features-enabled-but-not-available-test
  (testing "Ensure that a feature cannot be reported as enabled if it is not also available"
    ;; Clear premium features so (most of) the features are considered unavailable
    (mt/with-premium-features #{}
      ;; Temporarily create an official collection so that the stats code detects at least one feature as "enabled"
      (mt/with-temp [:model/Collection {} {:name "Temp Official Collection" :authority_level "official"}]
        (let [features (@#'stats/snowplow-features)
              enabled-not-available (filter
                                     (fn [feature]
                                       (and (get feature "enabled")
                                            (not (get feature "available"))))
                                     features)]
          ;; No features should be considered enabled which are not also considered available
          (is (= [] enabled-not-available)))))))

(def ^:private excluded-features
  "Set of features intentionally excluded from the daily stats ping. If you add a new feature, either add it to the stats ping
  or to this set, so that [[every-feature-is-accounted-for-test]] passes."
  #{:audit-app ;; tracked under :mb-analytics
    :enhancements
    :embedding
    :embedding-sdk
    :collection-cleanup
    :llm-autodescription
    :query-reference-validation
    :session-timeout-config})

(deftest every-feature-is-accounted-for-test
  (testing "Is every premium feature either tracked under the :features key, or intentionally excluded?"
    (let [included-features     (->> (concat (@#'stats/snowplow-features-data) (@#'stats/ee-snowplow-features-data))
                                     (map :name))
          included-features-set (set included-features)
          all-features      @premium-features/premium-features]
      ;; make sure features are not missing
      (is (empty? (set/difference all-features included-features-set excluded-features)))

      ;; make sure features are not duplicated
      (is (= (count included-features) (count included-features-set))))))

(deftest snowplow-grouped-metric-info-test
  (testing "query_executions"
    (let [{:keys [query_executions query_executions_24h]} (#'stats/->snowplow-grouped-metric-info)]
      (doseq [k (keys query_executions)]
        (testing (str "> key " k))
        (is (contains? query_executions_24h k))
        (is (not (< (get query_executions k)
                    (get query_executions_24h k)))
            "There are never more query executions in the 24h version than all-of-time.")))))

(deftest query-execution-24h-filtering-test
  (let [before (#'stats/->snowplow-grouped-metric-info)]
    ;; run 2 internal queries, set one to happen a year ago:
    (mt/with-temp [:model/QueryExecution _internal-year-ago
                   (merge query-execution-defaults
                          {:started_at (-> (t/offset-date-time) (t/minus (t/years 1)))})
                   :model/QueryExecution _internal-new query-execution-defaults]
      (let [after (#'stats/->snowplow-grouped-metric-info)
            before-internal (-> before :query-executions (get "internal"))
            after-internal (-> after :query-executions (get "internal"))
            before-24h-internal (-> before :query-executions-24h (get "internal"))
            after-24h-internal (-> after :query-executions-24h (get "internal"))]
        (is (= 2 (- after-internal before-internal)))
        (is (= 1 (- after-24h-internal before-24h-internal)))))))
