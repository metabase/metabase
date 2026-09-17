(ns metabase-enterprise.metabot.task.conversation-recall
  "Resumable conversation-index backfill and freshness sweep."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.metabot.conversation-recall-index :as recall-index]
   [metabase.metabot.config :as metabot.config]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Backfill a page of Metabot conversation excerpts."}
  ConversationRecall [_ctx]
  (when (metabot.config/any-metabot-enabled?)
    (try
      (recall-index/backfill!)
      (catch Exception e
        (log/warn e "Conversation recall backfill unavailable; retrying next minute")))))

(defmethod task/init! ::ConversationRecall [_]
  (let [job-key (jobs/key "metabase.metabot.conversation-recall")]
    (task/schedule-task!
     (jobs/build (jobs/of-type ConversationRecall) (jobs/with-identity job-key))
     (triggers/build
      (triggers/with-identity (triggers/key "metabase.metabot.conversation-recall.trigger"))
      (triggers/for-job job-key)
      (triggers/with-schedule (simple/schedule (simple/with-interval-in-seconds 60)
                                               (simple/repeat-forever)))))))
