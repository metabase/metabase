(ns metabase.task.sweep-query-analysis
  "A background worker making sure that analyze the queries for all active cards, and that it is up-to-date."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.public-settings :as public-settings]
   [metabase.query-analysis :as query-analysis]
   [metabase.task :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private has-run?
  "Has the sweeper been run before, in this process?"
  (atom false))

;; This number has not been chosen scientifically.
(def ^:private max-delete-batch-size 1000)

(defn- analyze-cards-without-complete-analysis!
  ([]
   (analyze-cards-without-complete-analysis! query-analysis/queue-analysis!))
  ([analyze-fn]
   (let [cards (t2/reducible-select [:model/Card :id]
                                    {:left-join [[:query_analysis :qa]
                                                 [:and
                                                  [:= :qa.card_id :report_card.id]
                                                  [:= :qa.status "complete"]]]
                                     :where     [:and
                                                 [:not :report_card.archived]
                                                 [:= :qa.id nil]]})]
     (run! analyze-fn cards))))

(defn- analyze-stale-cards!
  ([]
   (analyze-cards-without-complete-analysis! query-analysis/queue-analysis!))
  ([analyze-fn]
   ;; TODO once we are storing the hash of the query used for analysis, we'll be able to filter this properly.
   (let [cards (t2/reducible-select [:model/Card :id])]
     (run! analyze-fn cards))))

(defn- delete-orphan-analysis! []
  (transduce
   (comp (map :id)
         (partition-all max-delete-batch-size))
   (fn
     ([final-count] final-count)
     ([running-count ids]
      (t2/delete! :model/QueryAnalysis :id [:in ids])
      (+ running-count (count ids))))
   0
   (t2/reducible-select [:model/QueryAnalysis :id]
                        {:join  [[:report_card :c] [:= :c.id :query_analysis.card_id]]
                         :where :c.archived})))

(defn- sweep-query-analysis-loop!
  ([]
   (sweep-query-analysis-loop! (not @has-run?))
   (reset! has-run? true))
  ([first-time?]
   (sweep-query-analysis-loop! first-time?
                               (fn [card-or-id]
                                 (log/debugf "Queueing card %s for query analysis" (u/the-id card-or-id))
                                 (query-analysis/queue-analysis! card-or-id))))
  ([first-time? analyze-fn]
   ;; prioritize cards that are missing analysis
   (log/info "Calculating analysis for cards without any")
   (analyze-cards-without-complete-analysis! analyze-fn)

   ;; we run through all the existing analysis on our first run, as it may be stale due to an old macaw version, etc.
   (when first-time?
     (log/info "Recalculating potentially stale analysis")
     ;; this will repeat the cards we've just back-filled, but in the steady state there should be none of those.
     ;; in the future, we will track versions, hashes, and timestamps to reduce the cost of this operation.
     (analyze-stale-cards! analyze-fn))

   ;; empty out useless records
   (log/info "Deleting analysis for archived cards")
   (log/infof "Deleted analysis for %s cards" (delete-orphan-analysis!))))

(jobs/defjob ^{DisallowConcurrentExecution true
               :doc                        "Backfill QueryField for cards created earlier. Runs once per instance."}
  SweepQueryAnalysis [_ctx]
  (when (public-settings/query-analysis-enabled)
    (sweep-query-analysis-loop!)))

(defmethod task/init! ::SweepQueryAnalysis [_]
  (let [job-key (jobs/key "metabase.task.backfill-query-fields.job")
        job     (jobs/build
                 (jobs/of-type SweepQueryAnalysis)
                 (jobs/with-identity job-key)
                 (jobs/store-durably)
                 (jobs/request-recovery))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key "metabase.task.backfill-query-fields.trigger"))
                 (triggers/start-now)
                 (triggers/with-schedule
                  (cron/schedule
                   (cron/cron-schedule
                       ;; run every 4 hours at a random minute:
                    (format "0 %d 0/4 1/1 * ? *" (rand-int 60)))
                   (cron/with-misfire-handling-instruction-ignore-misfires))))]
    ;; Schedule the repeats
    (task/schedule-task! job trigger)
    ;; Don't wait, try to kick it off immediately
    (task/trigger-now! job-key)))
