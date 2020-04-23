(ns metabase.util.stats-test
  (:require [clojure.test :refer :all]
            [metabase
             [email :as email]
             [util :as u]]
            [metabase.integrations.slack :as slack]
            [metabase.models
             [card :refer [Card]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [query-execution :refer [QueryExecution]]]
            [metabase.test.fixtures :as fixtures]
            [metabase.util.stats :as stats-util :refer :all]
            [toucan.db :as db]
            [toucan.util.test :as tt]))

(use-fixtures :once (fixtures/initialize :db))

(deftest bin-small-number-test
  (are [expected n] (= expected
                       (#'stats-util/bin-small-number n))
    "0"     0
    "1-5"   1
    "1-5"   5
    "6-10"  6
    "6-10"  10
    "11-25" 11
    "11-25" 25
    "25+"   26
    "25+"   500))

(deftest bin-medium-number-test
  (are [expected n] (= expected
                       (#'stats-util/bin-medium-number n))
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

(deftest bin-large-number-test
  (are [expected n] (= expected
                       (#'stats-util/bin-large-number n))
    "0"      0
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
    (let [stats (anonymous-usage-stats)]
      (doseq [[k expected] {:running_on        :unknown
                            :check_for_updates true
                            :site_name         true
                            :friendly_names    true
                            :email_configured  false
                            :slack_configured  false
                            :sso_configured    false
                            :has_sample_data   false}]
        (testing k
          (is (= expected
                 (get stats k))))))))

(deftest conversion-test
  (is (= #{true}
         (let [system-stats (get-in (anonymous-usage-stats) [:stats :system])]
           (into #{} (map #(contains? system-stats %) [:java_version :java_runtime_name :max_memory]))))
      "Spot checking a few system stats to ensure conversion from property names and presence in the anonymous-usage-stats"))

(def ^:private large-histogram (partial #'stats-util/histogram #'stats-util/bin-large-number))

(defn- old-execution-metrics []
  (let [executions (db/select [QueryExecution :executor_id :running_time :error])]
    {:executions     (count executions)
     :by_status      (frequencies (for [{error :error} executions]
                                    (if error
                                      "failed"
                                      "completed")))
     :num_per_user   (large-histogram executions :executor_id)
     :num_by_latency (frequencies (for [{latency :running_time} executions]
                                    (#'stats-util/bin-large-number (/ latency 1000))))}))

(deftest new-impl-test
  (is (= (old-execution-metrics)
         (#'stats-util/execution-metrics))
      "the new lazy-seq version of the executions metrics works the same way the old one did"))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Pulses & Alerts                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; make sure we get some reasonable Pulses & Alert metrics, and they filter each other out as appropriate

;;  alert_condition character varying(254), -- Condition (i.e. "rows" or "goal") used as a guard for alerts
;;  alert_first_only boolean, -- True if the alert should be disabled after the first notification
;;  alert_above_goal boolean, -- For a goal condition, alert when above the goal
(deftest pulses-and-alerts-test
  (tt/with-temp* [Card         [c]
                  ;; ---------- Pulses ----------
                  Pulse        [p1]
                  Pulse        [p2]
                  Pulse        [p3]
                  PulseChannel [_ {:pulse_id (u/get-id p1), :schedule_type "daily", :channel_type "email"}]
                  PulseChannel [_ {:pulse_id (u/get-id p1), :schedule_type "weekly", :channel_type "email"}]
                  PulseChannel [_ {:pulse_id (u/get-id p2), :schedule_type "daily", :channel_type "slack"}]
                  ;; Pulse 1 gets 2 Cards (1 CSV)
                  PulseCard    [_ {:pulse_id (u/get-id p1), :card_id (u/get-id c)}]
                  PulseCard    [_ {:pulse_id (u/get-id p1), :card_id (u/get-id c), :include_csv true}]
                  ;; Pulse 2 gets 1 Card
                  PulseCard    [_ {:pulse_id (u/get-id p1), :card_id (u/get-id c)}]
                  ;; Pulse 3 gets 7 Cards (1 CSV, 2 XLS, 2 BOTH)
                  PulseCard    [_ {:pulse_id (u/get-id p3), :card_id (u/get-id c)}]
                  PulseCard    [_ {:pulse_id (u/get-id p3), :card_id (u/get-id c)}]
                  PulseCard    [_ {:pulse_id (u/get-id p3), :card_id (u/get-id c), :include_csv true}]
                  PulseCard    [_ {:pulse_id (u/get-id p3), :card_id (u/get-id c), :include_xls true}]
                  PulseCard    [_ {:pulse_id (u/get-id p3), :card_id (u/get-id c), :include_xls true}]
                  PulseCard    [_ {:pulse_id (u/get-id p3), :card_id (u/get-id c), :include_csv true, :include_xls true}]
                  PulseCard    [_ {:pulse_id (u/get-id p3), :card_id (u/get-id c), :include_csv true, :include_xls true}]
                  ;; ---------- Alerts ----------
                  Pulse        [a1 {:alert_condition "rows", :alert_first_only false}]
                  Pulse        [a2 {:alert_condition "rows", :alert_first_only true }]
                  Pulse        [a3 {:alert_condition "goal", :alert_first_only false}]
                  Pulse        [a4 {:alert_condition "goal", :alert_first_only false, :alert_above_goal true}]
                  ;; Alert 1 is Email, Alert 2 is Email & Slack, Alert 3 is Slack-only
                  PulseChannel [_ {:pulse_id (u/get-id a1), :channel_type "email"}]
                  PulseChannel [_ {:pulse_id (u/get-id a1), :channel_type "email"}]
                  PulseChannel [_ {:pulse_id (u/get-id a2), :channel_type "slack"}]
                  PulseChannel [_ {:pulse_id (u/get-id a3), :channel_type "slack"}]
                  ;; Alert 1 gets 2 Cards (1 CSV)
                  PulseCard    [_ {:pulse_id (u/get-id a1), :card_id (u/get-id c)}]
                  PulseCard    [_ {:pulse_id (u/get-id a1), :card_id (u/get-id c), :include_csv true}]
                  ;; Alert 2 gets 1 Card
                  PulseCard    [_ {:pulse_id (u/get-id a1), :card_id (u/get-id c)}]
                  ;; Alert 3 gets 7 Cards (1 CSV, 2 XLS, 2 BOTH)
                  PulseCard    [_ {:pulse_id (u/get-id a3), :card_id (u/get-id c)}]
                  PulseCard    [_ {:pulse_id (u/get-id a3), :card_id (u/get-id c)}]
                  PulseCard    [_ {:pulse_id (u/get-id a3), :card_id (u/get-id c), :include_csv true}]
                  PulseCard    [_ {:pulse_id (u/get-id a3), :card_id (u/get-id c), :include_xls true}]
                  PulseCard    [_ {:pulse_id (u/get-id a3), :card_id (u/get-id c), :include_xls true}]
                  PulseCard    [_ {:pulse_id (u/get-id a3), :card_id (u/get-id c), :include_csv true, :include_xls true}]
                  PulseCard    [_ {:pulse_id (u/get-id a3), :card_id (u/get-id c), :include_csv true, :include_xls true}]
                  ;; Alert 4 gets 3 Cards
                  PulseCard    [_ {:pulse_id (u/get-id a3), :card_id (u/get-id c)}]
                  PulseCard    [_ {:pulse_id (u/get-id a3), :card_id (u/get-id c)}]
                  PulseCard    [_ {:pulse_id (u/get-id a3), :card_id (u/get-id c)}]]
    (is (= {:pulses               3
            :with_table_cards     2
            :pulse_types          {"slack" 1, "email" 2}
            :pulse_schedules      {"daily" 2, "weekly" 1}
            :num_pulses_per_user  {"1-5" 1}
            :num_pulses_per_card  {"6-10" 1}
            :num_cards_per_pulses {"1-5" 1, "6-10" 1}}
           (#'metabase.util.stats/pulse-metrics)))
    (is (= {:alerts               4
            :with_table_cards     2
            :first_time_only      1
            :above_goal           1
            :alert_types          {"slack" 2, "email" 2}
            :num_alerts_per_user  {"1-5" 1}
            :num_alerts_per_card  {"11-25" 1}
            :num_cards_per_alerts {"1-5" 1, "6-10" 1}}
           (#'metabase.util.stats/alert-metrics)))))
