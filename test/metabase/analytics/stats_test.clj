(ns metabase.analytics.stats-test
  (:require
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.analytics.stats :as stats :refer [anonymous-usage-stats]]
   [metabase.core :as mbc]
   [metabase.db :as mdb]
   [metabase.email :as email]
   [metabase.integrations.slack :as slack]
   [metabase.models.card :refer [Card]]
   [metabase.models.pulse :refer [Pulse]]
   [metabase.models.pulse-card :refer [PulseCard]]
   [metabase.models.pulse-channel :refer [PulseChannel]]
   [metabase.models.query-execution :refer [QueryExecution]]
   [metabase.query-processor.util :as qp.util]
   [metabase.test :as mt]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.malli.schema :as ms]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

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

(deftest ^:parallel bin-large-number-test
  (are [expected n] (= expected
                       (#'stats/bin-large-number n))
    "0"          0
    "1-10"       1
    "1-10"       10
    "11-50"      11
    "11-50"      50
    "51-250"     51
    "51-250"     250
    "251-1000"   251
    "251-1000"   1000
    "1001-10000" 1001
    "1001-10000" 10000
    "10000+"     10001
    "10000+"     100000))

(deftest anonymous-usage-stats-test
  (with-redefs [email/email-configured? (constantly false)
                slack/slack-configured? (constantly false)]
    (mt/with-temporary-setting-values [site-name          "Metabase"
                                       startup-time-millis 1234.0
                                       google-auth-enabled false
                                       enable-embedding    false]
      (t2.with-temp/with-temp [:model/Database _ {:is_sample true}]
        (let [stats (anonymous-usage-stats)]
          (is (partial= {:running_on                           :unknown
                         :check_for_updates                    true
                         :startup_time_millis                  1234.0
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
        (t2.with-temp/with-temp [:model/Database _ {:is_sample true}]
          (let [stats (anonymous-usage-stats)]
            (is (partial= {:running_on                           :unknown
                           :check_for_updates                    true
                           :startup_time_millis                  1234.0
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
         (let [system-stats (get-in (anonymous-usage-stats) [:stats :system])]
           (into #{} (map #(contains? system-stats %) [:java_version :java_runtime_name :max_memory]))))
      "Spot checking a few system stats to ensure conversion from property names and presence in the anonymous-usage-stats"))

(def ^:private large-histogram (partial #'stats/histogram #'stats/bin-large-number))

(defn- old-execution-metrics []
  (let [executions (t2/select [QueryExecution :executor_id :running_time :error])]
    {:executions     (count executions)
     :by_status      (frequencies (for [{error :error} executions]
                                    (if error
                                      "failed"
                                      "completed")))
     :num_per_user   (large-histogram executions :executor_id)
     :num_by_latency (frequencies (for [{latency :running_time} executions]
                                    (#'stats/bin-large-number (/ latency 1000))))}))

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
  (mt/with-temp [QueryExecution _ (merge query-execution-defaults
                                         {:error "some error"})
                 QueryExecution _ (merge query-execution-defaults
                                         {:error "some error"})
                 QueryExecution _ query-execution-defaults]
    (is (= (old-execution-metrics)
           (#'stats/execution-metrics))
        "the new lazy-seq version of the executions metrics works the same way the old one did")))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Pulses & Alerts                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; make sure we get some reasonable Pulses & Alert metrics, and they filter each other out as appropriate

;;  alert_condition character varying(254), -- Condition (i.e. "rows" or "goal") used as a guard for alerts
;;  alert_first_only boolean, -- True if the alert should be disabled after the first notification
;;  alert_above_goal boolean, -- For a goal condition, alert when above the goal
(deftest pulses-and-alerts-test
  (t2.with-temp/with-temp [Card         c {}
                           ;; ---------- Pulses ----------
                           Pulse        p1 {}
                           Pulse        p2 {}
                           Pulse        p3 {}
                           PulseChannel _ {:pulse_id (u/the-id p1), :schedule_type "daily", :channel_type "email"}
                           PulseChannel _ {:pulse_id (u/the-id p1), :schedule_type "weekly" :schedule_day "sun", :channel_type "email"}
                           PulseChannel _ {:pulse_id (u/the-id p2), :schedule_type "daily", :channel_type "slack"}
                           ;; Pulse 1 gets 2 Cards (1 CSV)
                           PulseCard    _ {:pulse_id (u/the-id p1), :card_id (u/the-id c)}
                           PulseCard    _ {:pulse_id (u/the-id p1), :card_id (u/the-id c), :include_csv true}
                           ;; Pulse 2 gets 1 Card
                           PulseCard    _ {:pulse_id (u/the-id p1), :card_id (u/the-id c)}
                           ;; Pulse 3 gets 7 Cards (1 CSV, 2 XLS, 2 BOTH)
                           PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c)}
                           PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c)}
                           PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c), :include_csv true}
                           PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c), :include_xls true}
                           PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c), :include_xls true}
                           PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c), :include_csv true, :include_xls true}
                           PulseCard    _ {:pulse_id (u/the-id p3), :card_id (u/the-id c), :include_csv true, :include_xls true}
                           ;; ---------- Alerts ----------
                           Pulse        a1 {:alert_condition "rows", :alert_first_only false}
                           Pulse        a2 {:alert_condition "rows", :alert_first_only true}
                           Pulse        a3 {:alert_condition "goal", :alert_first_only false}
                           Pulse        _  {:alert_condition "goal", :alert_first_only false, :alert_above_goal true}
                           ;; Alert 1 is Email, Alert 2 is Email & Slack, Alert 3 is Slack-only
                           PulseChannel _ {:pulse_id (u/the-id a1), :channel_type "email"}
                           PulseChannel _ {:pulse_id (u/the-id a1), :channel_type "email"}
                           PulseChannel _ {:pulse_id (u/the-id a2), :channel_type "slack"}
                           PulseChannel _ {:pulse_id (u/the-id a3), :channel_type "slack"}
                           ;; Alert 1 gets 2 Cards (1 CSV)
                           PulseCard    _ {:pulse_id (u/the-id a1), :card_id (u/the-id c)}
                           PulseCard    _ {:pulse_id (u/the-id a1), :card_id (u/the-id c), :include_csv true}
                           ;; Alert 2 gets 1 Card
                           PulseCard    _ {:pulse_id (u/the-id a1), :card_id (u/the-id c)}
                           ;; Alert 3 gets 7 Cards (1 CSV, 2 XLS, 2 BOTH)
                           PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c)}
                           PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c)}
                           PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c), :include_csv true}
                           PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c), :include_xls true}
                           PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c), :include_xls true}
                           PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c), :include_csv true, :include_xls true}
                           PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c), :include_csv true, :include_xls true}
                           ;; Alert 4 gets 3 Cards
                           PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c)}
                           PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c)}
                           PulseCard    _ {:pulse_id (u/the-id a3), :card_id (u/the-id c)}]
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
