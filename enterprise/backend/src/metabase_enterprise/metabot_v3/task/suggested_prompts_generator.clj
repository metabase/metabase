(ns metabase-enterprise.metabot-v3.task.suggested-prompts-generator
  "Job to execute on start of an instance"
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.metabot-v3.config :as metabot-v3.config]
   [metabase-enterprise.metabot-v3.suggested-prompts :as metabot-v3.suggested-prompts]
   [metabase.premium-features.core :as premium-features]
   [metabase.request.core :as request]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private generator-job-key (jobs/key "metabase.task.metabot-v3.suggested-prompts-generator.job"))
(def ^:private generator-trigger-key (triggers/key "metabase.task.metabot-v3.suggested-prompts-generator.trigger"))

(defn- maybe-generate-suggested-prompts! []
  (try
    (when (premium-features/has-feature? :metabot-v3)
      ;; Run as admin since this is a system task generating prompts for all content in scope.
      ;; Users will only see prompts for content they have access to (filtered at query time).
      (request/as-admin
        (let [metabot-eid (get-in metabot-v3.config/metabot-config
                                  [metabot-v3.config/internal-metabot-id :entity-id])
              metabot-id (t2/select-one-pk :model/Metabot :entity_id metabot-eid)
              suggested-prompts-cnt (t2/count :model/MetabotPrompt :metabot_id metabot-id)]
          (if (zero? suggested-prompts-cnt)
            (do
              (log/info "No suggested prompts found. Generating suggested prompts.")
              (metabot-v3.suggested-prompts/generate-sample-prompts metabot-id)
              (log/info "Suggested prompts generated successfully."))
            (log/info "Suggested prompts are present. Not generating.")))))
    (catch Exception e
      (log/errorf "Suggested prompts generation failed: %s" (.getMessage e)))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Initial _suggested prompts_ generation for internal Metabot."}
  SuggestedPromptsGenerator [_ctx]
  (maybe-generate-suggested-prompts!))

(defmethod task/init! ::SuggestedPromptsGenerator
  [_]
  (when (premium-features/has-feature? :metabot-v3)
    (let [job
          (jobs/build
           (jobs/of-type SuggestedPromptsGenerator)
           (jobs/with-identity generator-job-key))
          trigger (triggers/build
                   (triggers/with-identity generator-trigger-key)
                   ;; Start the job a moment after startup.
                   (triggers/start-at (Date/from (.plusSeconds (Instant/now) 10))))]
      (task/schedule-task! job trigger))))
