(ns metabase.metabot.task.metabot-conversation-trimmer
  "Scheduled task to delete `metabot_conversation` rows older than the configured
  `ai-usage-max-retention-days`. The FK from `metabot_message.conversation_id` is
  `ON DELETE CASCADE`, so child messages (and, in turn, their `metabot_feedback`
  and `metabot_source_feedback` rows, which cascade off `metabot_message.id`)
  are removed by the database."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private trimmer-job-key (jobs/key "metabase.task.metabot.conversation-trimmer.job"))
(def ^:private trimmer-trigger-key (triggers/key "metabase.task.metabot.conversation-trimmer.trigger"))

(defn- trim-old-conversations!
  []
  (let [retention-days (metabot.settings/ai-usage-max-retention-days)]
    (if (nil? retention-days)
      (log/info "Skipping metabot conversation cleanup; ai-usage-max-retention-days is 0 (infinite retention).")
      (do
        (log/infof "Trimming metabot_conversation rows older than %d days." (long retention-days))
        (let [cutoff  (t/minus (t/offset-date-time) (t/days (long retention-days)))
              deleted (t2/delete! :model/MetabotConversation {:where [:< :created_at cutoff]})]
          (log/infof "Metabot conversation cleanup complete. Deleted %d conversations (messages/feedback removed by ON DELETE CASCADE)."
                     (or deleted 0)))))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Delete old metabot_conversation rows (cascades to metabot_message)"}
  MetabotConversationTrimmer [_ctx]
  (trim-old-conversations!))

(defmethod task/init! ::MetabotConversationTrimmer
  [_]
  (let [job (jobs/build
             (jobs/of-type MetabotConversationTrimmer)
             (jobs/with-identity trimmer-job-key))
        trigger (triggers/build
                 (triggers/with-identity trimmer-trigger-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; daily at 23:16:37 — 2 minutes after ai-usage-trimmer
                  (cron/cron-schedule "37 16 23 * * ?")))]
    (task/schedule-task! job trigger)))
