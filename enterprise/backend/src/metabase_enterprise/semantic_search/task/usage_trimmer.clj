(ns metabase-enterprise.semantic-search.task.usage-trimmer
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.semantic-search.util :as semantic.u]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.sql Timestamp)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private trimmer-job-key (jobs/key "metabase.task.semantic-search.usage-trimmer.job"))
(def ^:private trimmer-trigger-key (triggers/key "metabase.task.semantic-search.usage-trimmer.trigger"))

(def ^:private storage-months 2)

(defn- trim-old-token-data!
  []
  (when (semantic.u/semantic-search-available?)
    (log/info "Attempting to delete old semantic search usage data.")
    (let [t (Timestamp/valueOf (.minusMonths (java.time.LocalDateTime/now) storage-months))]
      (t2/delete! :model/SemanticSearchTokenTracking {:where [:< :created_at t]}))
    (log/info "Semantic search old data cleanup successful.")))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Clean up inactive semantic search index tables"}
  SemanticSearchUsageTrimmer [_ctx]
  (trim-old-token-data!))

(defmethod task/init! ::SemanticSearchUsageTrimmer
  [_]
  (when (semantic.u/semantic-search-available?)
    (let [job (jobs/build
               (jobs/of-type SemanticSearchUsageTrimmer)
               (jobs/with-identity trimmer-job-key))
          trigger (triggers/build
                   (triggers/with-identity trimmer-trigger-key)
                   (triggers/start-now)
                   (triggers/with-schedule
                     ;; daily at 22:59:42
                    (cron/cron-schedule "42 59 22 * * ?")))]
      (task/schedule-task! job trigger))))
