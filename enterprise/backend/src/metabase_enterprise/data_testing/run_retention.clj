(ns metabase-enterprise.data-testing.run-retention
  "Prunes the history of test runs. The stored result of a run is kept for a shorter time than the run itself, since
  it is by far the larger part of the row."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.data-testing.db :as data-testing.db]
   [metabase-enterprise.data-testing.settings :as data-testing.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]))

(set! *warn-on-reflection* true)

(def ^:private delete-batch-size 1000)

(mu/defn- cutoff :- [:maybe ms/TemporalInstant]
  "The instant `retention-days` days ago, or nil when `retention-days` is 0 and nothing expires."
  [retention-days :- :int]
  (when (pos-int? retention-days)
    (t/minus (t/offset-date-time) (t/days retention-days))))

(mu/defn clear-expired-run-results! :- :int
  "Clear the stored result of every run that started more than `data-test-run-result-retention-days` days ago, and
  return how many were cleared. The runs stay. Clears nothing when the setting is 0."
  []
  (if-let [cutoff (cutoff (data-testing.settings/data-test-run-result-retention-days))]
    (data-testing.db/clear-test-run-results-before! cutoff)
    0))

(mu/defn delete-expired-runs! :- :int
  "Delete every finished run that started more than `data-test-run-retention-days` days ago, except the newest run of
  each test, and return how many were deleted. Deletes nothing when the setting is 0."
  []
  (if-let [cutoff (cutoff (data-testing.settings/data-test-run-retention-days))]
    (transduce (map #(data-testing.db/delete-test-runs! (vec %)))
               +
               0
               (partition-all delete-batch-size (data-testing.db/expired-test-run-ids cutoff)))
    0))

(task/defjob PruneTestRuns
  "Delete the test runs older than their retention period, and clear the stored results of those older than theirs."
  {:saved-class "metabase_enterprise.data_testing.run_retention.PruneTestRuns"}
  [_]
  (let [deleted (delete-expired-runs!)
        cleared (clear-expired-run-results!)]
    (log/debugf "Deleted %d test runs and cleared the stored results of %d" deleted cleared)))

(def ^:private job-key     "metabase.data-testing.run-retention.job")
(def ^:private trigger-key "metabase.data-testing.run-retention.trigger")

(defmethod task/init! ::PruneTestRuns [_]
  (let [job     (jobs/build
                 (jobs/of-type PruneTestRuns)
                 (jobs/with-identity (jobs/key job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key trigger-key))
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; run every day at midnight
                  (cron/cron-schedule "0 0 0 * * ? *")))]
    (task/schedule-task! job trigger)))
