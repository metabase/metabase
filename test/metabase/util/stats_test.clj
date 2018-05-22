(ns metabase.util.stats-test
  (:require [expectations :refer :all]
            [metabase.models.query-execution :refer [QueryExecution]]
            [metabase.test.util :as tu]
            [metabase.util.stats :as stats-util :refer :all]
            [toucan.db :as db]))

(expect "0" (#'stats-util/bin-micro-number 0))
(expect "1" (#'stats-util/bin-micro-number 1))
(expect "2" (#'stats-util/bin-micro-number 2))
(expect "3+" (#'stats-util/bin-micro-number 3))
(expect "3+" (#'stats-util/bin-micro-number 100))

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

;;Spot checking a few system stats to ensure conversion from property
;;names and presence in the anonymous-usage-stats
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
