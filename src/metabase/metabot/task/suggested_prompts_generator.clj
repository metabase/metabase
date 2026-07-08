(ns metabase.metabot.task.suggested-prompts-generator
  "Job to execute on start of an instance"
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.suggested-prompts :as metabot.suggested-prompts]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.request.core :as request]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)
   (java.util Date)
   (org.quartz DisallowConcurrentExecution)))

(set! *warn-on-reflection* true)

(def ^:private generator-job-key (jobs/key "metabase.task.metabot.suggested-prompts-generator.job"))
(def ^:private generator-trigger-key (triggers/key "metabase.task.metabot.suggested-prompts-generator.trigger"))

(defn- enabled-builtin-metabots
  "Built-in Metabot config IDs to seed, each gated on its own enabled setting."
  []
  ;; Internal and embedded both serve prompts from the same per-`metabot_id` endpoint, so each
  ;; enabled bot needs its own seed.
  (cond-> []
    (metabot.settings/metabot-enabled?)          (conj metabot.config/internal-metabot-id)
    (metabot.settings/embedded-metabot-enabled?) (conj metabot.config/embedded-metabot-id)))

(defn- generate-suggested-prompts-for-metabot! [config-id]
  (let [metabot-eid (get-in metabot.config/metabot-config [config-id :entity-id])
        metabot-id  (t2/select-one-pk :model/Metabot :entity_id metabot-eid)]
    (cond
      (nil? metabot-id)
      (log/warnf "No Metabot instance found for %s. Skipping suggested prompt generation." config-id)

      (pos? (t2/count :model/MetabotPrompt :metabot_id metabot-id))
      (log/infof "Suggested prompts are present for %s. Not generating." config-id)

      :else
      (do
        (log/infof "No suggested prompts found for %s. Generating suggested prompts." config-id)
        (metabot.suggested-prompts/generate-sample-prompts metabot-id)
        (log/infof "Suggested prompts generated successfully for %s." config-id)))))

(defn- maybe-generate-suggested-prompts! []
  (try
    (let [config-ids (enabled-builtin-metabots)]
      (cond
        (empty? config-ids)
        (log/info "Metabot is disabled. Skipping suggested prompt generation.")

        ;; Pre-check so a locked managed-AI instance logs a clean info-level skip instead of bubbling
        ;; the 402 from `generate-sample-prompts` up into the catch as a noisy startup error.
        (metabot.usage/managed-free-limit-reached?)
        (log/info "Managed AI free limit reached. Skipping suggested prompt generation.")

        :else
        ;; Run as admin since this is a system task generating prompts for all content in scope.
        ;; Users will only see prompts for content they have access to (filtered at query time).
        (request/as-admin
          (run! generate-suggested-prompts-for-metabot! config-ids))))
    (catch Exception e
      (log/errorf "Suggested prompts generation failed: %s" (.getMessage e)))))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Initial _suggested prompts_ generation for the enabled built-in Metabot instances."}
  SuggestedPromptsGenerator [_ctx]
  (maybe-generate-suggested-prompts!))

(defmethod task/init! ::SuggestedPromptsGenerator
  [_]
  (let [job     (jobs/build
                 (jobs/of-type SuggestedPromptsGenerator)
                 (jobs/with-identity generator-job-key))
        trigger (triggers/build
                 (triggers/with-identity generator-trigger-key)
                 ;; Start the job a moment after startup.
                 (triggers/start-at (Date/from (.plusSeconds (Instant/now) 10))))]
    (task/schedule-task! job trigger)))
