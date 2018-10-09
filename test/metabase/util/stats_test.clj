(ns metabase.util.stats-test
  (:require [expectations :refer :all]
            [metabase.models [query-execution :refer [QueryExecution]]
             [pulse :refer [Pulse]]
             [pulse-channel :refer [PulseChannel]]
             [card :refer [Card]]
             [pulse-card :refer [PulseCard]]]
            [metabase.test.util :as tu]
            [metabase.util.stats :as stats-util :refer :all]
            [toucan.db :as db]
            [metabase.util :as u]
            [toucan.util.test :as tt]))

#_(expect "0" (#'stats-util/bin-micro-number 0))
#_(expect "1" (#'stats-util/bin-micro-number 1))
#_(expect "2" (#'stats-util/bin-micro-number 2))
#_(expect "3+" (#'stats-util/bin-micro-number 3))
#_(expect "3+" (#'stats-util/bin-micro-number 100))

(expect "0" (#'stats-util/bin-small-number 0))
(expect "1-5" (#'stats-util/bin-small-number 1))
(expect "1-5" (#'stats-util/bin-small-number 5))
(expect "6-10" (#'stats-util/bin-small-number 6))
(expect "6-10" (#'stats-util/bin-small-number 10))
(expect "11-25" (#'stats-util/bin-small-number 11))
(expect "11-25" (#'stats-util/bin-small-number 25))
(expect "25+" (#'stats-util/bin-small-number 26))
(expect "25+" (#'stats-util/bin-small-number 500))

(expect "0" (#'stats-util/bin-medium-number 0))
(expect "1-5" (#'stats-util/bin-medium-number 1))
(expect "1-5" (#'stats-util/bin-medium-number 5))
(expect "6-10" (#'stats-util/bin-medium-number 6))
(expect "6-10" (#'stats-util/bin-medium-number 10))
(expect "11-25" (#'stats-util/bin-medium-number 11))
(expect "11-25" (#'stats-util/bin-medium-number 25))
(expect "26-50" (#'stats-util/bin-medium-number 26))
(expect "26-50" (#'stats-util/bin-medium-number 50))
(expect "51-100" (#'stats-util/bin-medium-number 51))
(expect "51-100" (#'stats-util/bin-medium-number 100))
(expect "101-250" (#'stats-util/bin-medium-number 101))
(expect "101-250" (#'stats-util/bin-medium-number 250))
(expect "250+" (#'stats-util/bin-medium-number 251))
(expect "250+" (#'stats-util/bin-medium-number 5000))


(expect "0" (#'stats-util/bin-large-number 0))
(expect "1-10" (#'stats-util/bin-large-number 1))
(expect "1-10" (#'stats-util/bin-large-number 10))

(expect "11-50" (#'stats-util/bin-large-number 11))
(expect "11-50" (#'stats-util/bin-large-number 50))
(expect "51-250" (#'stats-util/bin-large-number 51))
(expect "51-250" (#'stats-util/bin-large-number 250))
(expect "251-1000" (#'stats-util/bin-large-number 251))
(expect "251-1000" (#'stats-util/bin-large-number 1000))
(expect "1001-10000" (#'stats-util/bin-large-number 1001))
(expect "1001-10000" (#'stats-util/bin-large-number 10000))
(expect "10000+" (#'stats-util/bin-large-number 10001))
(expect "10000+" (#'stats-util/bin-large-number 100000))


(expect :unknown ((anonymous-usage-stats) :running_on))
(expect true ((anonymous-usage-stats) :check_for_updates))
(expect true ((anonymous-usage-stats) :site_name))
(expect true ((anonymous-usage-stats) :friendly_names))
(expect false ((anonymous-usage-stats) :email_configured))
(expect false ((anonymous-usage-stats) :slack_configured))
(expect false ((anonymous-usage-stats) :sso_configured))
(expect false ((anonymous-usage-stats) :has_sample_data))

;; Spot checking a few system stats to ensure conversion from property
;; names and presence in the anonymous-usage-stats
(expect
  #{true}
  (let [system-stats (get-in (anonymous-usage-stats) [:stats :system])]
    (into #{} (map #(contains? system-stats %) [:java_version :java_runtime_name :max_memory]))))

;;; check that the new lazy-seq version of the executions metrics works the same way the old one did
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

(expect
  (old-execution-metrics)
  (#'stats-util/execution-metrics))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                Pulses & Alerts                                                 |
;;; +----------------------------------------------------------------------------------------------------------------+

;; make sure we get some reasonable Pulses & Alert metrics, and they filter each other out as appropriate

;;  alert_condition character varying(254), -- Condition (i.e. "rows" or "goal") used as a guard for alerts
;;  alert_first_only boolean, -- True if the alert should be disabled after the first notification
;;  alert_above_goal boolean, -- For a goal condition, alert when above the goal
(defn- x []
  {:pulses {:pulses               3
            :with_table_cards     2
            :pulse_types          {"slack" 1, "email" 2}
            :pulse_schedules      {"daily" 2, "weekly" 1}
            :num_pulses_per_user  {"1-5" 1}
            :num_pulses_per_card  {"6-10" 1}
            :num_cards_per_pulses {"1-5" 1, "6-10" 1}}
   :alerts {:alerts               4
            :with_table_cards     2
            :first_time_only      1
            :above_goal           1
            :alert_types          {"slack" 2, "email" 2}
            :num_alerts_per_user  {"1-5" 1}
            :num_alerts_per_card  {"11-25" 1}
            :num_cards_per_alerts {"1-5" 1, "6-10" 1}}}
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
    {:pulses (#'metabase.util.stats/pulse-metrics)
     :alerts (#'metabase.util.stats/alert-metrics)}))
