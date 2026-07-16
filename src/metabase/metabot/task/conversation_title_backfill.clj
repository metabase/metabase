(ns metabase.metabot.task.conversation-title-backfill
  "Backfill for historical Metabot conversations with missing titles."
  (:require
   [clojurewerkz.quartzite.conversion :as qc]
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase.events.core :as events]
   [metabase.metabot.config :as metabot.config]
   [metabase.metabot.conversation-title :as conversation-title]
   [metabase.metabot.persistence :as metabot.persistence]
   [metabase.metabot.settings :as metabot.settings]
   [metabase.metabot.usage :as metabot.usage]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [toucan2.core :as t2])
  (:import
   (java.time Instant)
   (java.util Date)
   (java.util.concurrent Future)
   (org.quartz DisallowConcurrentExecution JobExecutionContext)))

(set! *warn-on-reflection* true)

(def ^:private conversation-page-size 25)
(def ^:private generation-limit 10)
(def ^:private startup-delay-seconds 30)
(def ^:private continuation-delay-seconds 60)
(def ^:private setting-update-delay-seconds 1)
(def ^:private paused-retry-delay-seconds (* 60 60))

(def ^:private job-key (jobs/key "metabase.task.metabot.conversation-title-backfill.job"))
(def ^:private trigger-key (triggers/key "metabase.task.metabot.conversation-title-backfill.trigger"))

(defn- readiness
  []
  (cond
    (not (metabot.config/any-metabot-enabled?))          :metabot-disabled
    (not (metabot.settings/llm-metabot-configured?))     :provider-unconfigured
    (metabot.usage/managed-free-limit-reached?)          :managed-limit-reached
    :else                                                :ready))

;; these pauses only end when a setting changes, and `handle-setting-update!` already reschedules
;; on that. any other pause has no such signal, so the job must schedule its own next attempt.
(def ^:private event-driven-pause? #{:metabot-disabled :provider-unconfigured})

(defn- log-pause
  [reason]
  (case reason
    :metabot-disabled
    (log/info "Skipping Metabot conversation title backfill because Metabot is disabled.")

    :provider-unconfigured
    (log/info "Skipping Metabot conversation title backfill because the AI provider is not configured.")

    :managed-limit-reached
    (log/info "Skipping Metabot conversation title backfill because the managed AI limit has been reached.")

    nil))

(defn- titleless-conversation-ids
  [after-id]
  (t2/select-fn-vec :id :model/MetabotConversation
                    {:where    (cond-> [:and [:= :title nil]]
                                 after-id (conj [:> :id after-id]))
                     :order-by [[:id :asc]]
                     :limit    conversation-page-size}))

(defn- title-source
  [conversation-id]
  (metabot.persistence/first-valid-user-message
   (metabot.persistence/opening-messages conversation-id)))

(defn- generate-title!
  [conversation-id {:keys [content profile-id]}]
  (try
    (let [{:keys [status future]} (conversation-title/ensure-title!
                                   conversation-id
                                   (metabot.usage/valid-usage-profile-id profile-id)
                                   content)]
      (case status
        :ready   :already-titled
        :pending (if (some-> ^Future future .get) :generated :failed)
        :missing :failed
        :failed))
    (catch InterruptedException _
      (.interrupt (Thread/currentThread))
      :failed)
    (catch Throwable e
      (log/warn e "Failed to backfill Metabot conversation title"
                {:conversation-id conversation-id})
      :failed)))

(defn- finish-result
  ([status cursor counts]
   (assoc counts :status status :cursor cursor))
  ([status cursor counts reason]
   (assoc counts :status status :cursor cursor :reason reason)))

(defn- run-backfill-page!
  [after-id]
  (let [initial-readiness (readiness)]
    (if (not= initial-readiness :ready)
      (do
        (log-pause initial-readiness)
        (finish-result :paused after-id {:attempted 0 :generated 0 :failed 0 :skipped 0} initial-readiness))
      (let [conversation-ids (titleless-conversation-ids after-id)
            full-page?       (= conversation-page-size (count conversation-ids))]
        (loop [remaining conversation-ids
               cursor    after-id
               counts    {:attempted 0 :generated 0 :failed 0 :skipped 0}]
          (cond
            (>= (:attempted counts) generation-limit)
            (finish-result :more cursor counts)

            (empty? remaining)
            (finish-result (if full-page? :more :complete) cursor counts)

            :else
            (let [conversation-id (first remaining)]
              (if-let [source (title-source conversation-id)]
                (let [current-readiness (readiness)]
                  (if (not= current-readiness :ready)
                    (do
                      (log-pause current-readiness)
                      (finish-result :paused cursor counts current-readiness))
                    (let [outcome (generate-title! conversation-id source)]
                      (recur (rest remaining)
                             conversation-id
                             (-> counts
                                 (update :attempted inc)
                                 (update (case outcome
                                           :generated       :generated
                                           :already-titled :skipped
                                           :failed          :failed)
                                         inc))))))
                (recur (rest remaining) conversation-id (update counts :skipped inc))))))))))

(declare schedule-run!)

(defn- next-run-delay-seconds
  [{:keys [status reason]}]
  (case status
    :more   continuation-delay-seconds
    :paused (when-not (event-driven-pause? reason) paused-retry-delay-seconds)
    nil))

(task/defjob ^{DisallowConcurrentExecution true
               :doc "Backfill missing Metabot conversation titles."}
  ConversationTitleBackfill [ctx]
  (let [ctx      ^JobExecutionContext ctx
        after-id (get (qc/from-job-data ctx) "after-id")
        result   (run-backfill-page! after-id)]
    (log/info "Metabot conversation title backfill batch complete" result)
    (when-let [delay-seconds (next-run-delay-seconds result)]
      (schedule-run! (.getScheduler ctx) (:cursor result) delay-seconds))))

(defn- build-job
  []
  (jobs/build
   (jobs/with-description "Backfill missing Metabot conversation titles")
   (jobs/of-type ConversationTitleBackfill)
   (jobs/with-identity job-key)))

(defn- build-trigger
  [after-id delay-seconds]
  (triggers/build
   (triggers/with-identity trigger-key)
   (triggers/for-job job-key)
   (triggers/using-job-data (cond-> {} after-id (assoc "after-id" after-id)))
   (triggers/start-at (Date/from (.plusSeconds (Instant/now) (long delay-seconds))))
   (triggers/with-schedule
    (simple/schedule (simple/with-misfire-handling-instruction-fire-now)))))

(defn- schedule-run!
  [scheduler after-id delay-seconds]
  (task/schedule-task! scheduler (build-job) (build-trigger after-id delay-seconds)))

(defmethod task/init! ::ConversationTitleBackfill
  [_]
  (let [current-readiness (readiness)]
    (cond
      (= current-readiness :ready)
      (schedule-run! (task/scheduler) nil startup-delay-seconds)

      (event-driven-pause? current-readiness)
      (log-pause current-readiness)

      :else
      (do (log-pause current-readiness)
          (schedule-run! (task/scheduler) nil paused-retry-delay-seconds)))))

(derive :event/setting-update ::setting-update)

(defn- handle-setting-update!
  [event]
  (when (and (metabot.settings/llm-configuration-setting? (get-in event [:details :key]))
             (= :ready (readiness)))
    (schedule-run! (task/scheduler) nil setting-update-delay-seconds)))

(methodical/defmethod events/publish-event! ::setting-update
  [_topic event]
  (handle-setting-update! event))
