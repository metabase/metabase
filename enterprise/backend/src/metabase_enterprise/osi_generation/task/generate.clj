(ns metabase-enterprise.osi-generation.task.generate
  "Quartz job running the OSI metadata generation loop weekly.

  The body self-gates (setting, license, LLM configuration), so a disabled or unlicensed instance
  fires a no-op — Quartz reports healthy runs either way, which is why the manual API 400s on the
  same gates instead of queuing quietly."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.osi-generation.core :as osi-generation]
   [metabase-enterprise.osi-generation.settings :as osi-generation.settings]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.util :as u]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def generation-task-history-name
  "The task-history name used for every scheduled or manually triggered generation attempt."
  "osi-generation")

(defn- nonordinary-cause
  [e]
  (some #(when (or (instance? InterruptedException %)
                   (instance? Error %))
           %)
        (take 10 (take-while some? (iterate #(some-> ^Throwable % .getCause) e)))))

(defn- run!*
  "The job body, separated so tests can drive the gate chain without a scheduler."
  []
  (cond
    (not (osi-generation.settings/osi-generation-enabled))
    {:outcome :skipped, :reason :disabled}

    (not (osi-generation/available?))
    {:outcome :skipped, :reason :unlicensed}

    ;; enabled and licensed but no reachable LLM: log which credential path failed to resolve, once
    ;; per run, so the provider fallback choice is observable.
    (not (osi-generation.settings/configured?))
    (let [credentials-source (osi-generation.settings/credentials-source
                              (osi-generation.settings/osi-generation-model))]
      (log/warn "OSI generation is enabled but no LLM is configured; skipping run"
                {:credentials-source credentials-source})
      {:outcome :skipped, :reason :llm-unconfigured, :credentials_source credentials-source})

    :else
    (try
      (let [summary (osi-generation/run-generation!)]
        (log/info "OSI generation run finished" summary)
        {:outcome :completed, :summary summary})
      (catch Exception e
        (if-let [cause (nonordinary-cause e)]
          (do
            (when (instance? InterruptedException cause)
              (.interrupt (Thread/currentThread)))
            (throw cause))
          ;; Log ordinary failures and move on: the next weekly firing (or a manual trigger) retries
          ;; from appdb state. Cancellation and fatal errors remain visible to Quartz.
          (do
            (log/error e "OSI generation run failed")
            {:outcome        :failed
             :message        (ex-message e)
             :exception_class (str (class e))}))))))

(def ^:private task-detail-key-rank
  (zipmap [:outcome :reason :credentials_source :message :exception_class :summary
           :candidates :generated :already-approved :restamped :skipped :errors :pending
           :usage :llm-calls :reconcile :entity-type :entity-local-id :duration-ms
           :input-tokens :output-tokens :index :execution
           :inserted :deleted :unchanged :waited_ms :ran_ms]
          (range)))

(defn- canonical-task-details
  "Recursively order task details for stable stored JSON and predictable demo output. Known fields use
  a semantic order; any future fields follow deterministically by key name."
  [value]
  (cond
    (map? value)
    (u/for-ordered-map [key (sort-by (juxt #(get task-detail-key-rank % Long/MAX_VALUE) str) (keys value))]
                       [key (canonical-task-details (get value key))])

    (sequential? value)
    (mapv canonical-task-details value)

    :else
    value))

(defn- history-update
  [history result]
  (assoc history
         :status (if (= :failed (:outcome result)) :failed :success)
         :task_details (canonical-task-details result)))

(defn- run-with-history!
  []
  (task-history/with-task-history {:task generation-task-history-name, :on-success-info history-update}
    (run!*)))

(task/defjob ^{org.quartz.DisallowConcurrentExecution true
               :doc "Generates OSI ai_context metadata for library entities."}
  OsiAiContextGeneration [_ctx]
  (run-with-history!))

(def ^:private generation-trigger-key
  (triggers/key "metabase-enterprise.osi-generation.generate.trigger"))

(defmethod task/init! ::OsiAiContextGeneration [_]
  ;; Scheduling is unconditional — deliberately NOT gated the way entity-retrieval's sync task gates
  ;; on pgvector-configured?: generation needs no boot-fixed config, the body self-gates, and an
  ;; unregistered job would make the manual API 400 forever on a non-pgvector instance.
  (let [job      (jobs/build
                  (jobs/of-type OsiAiContextGeneration)
                  (jobs/store-durably)
                  (jobs/with-identity osi-generation/generation-job-key))
        ;; Weekly, Sunday 03:00 UTC with a random minute chosen when the trigger is first created and
        ;; then persisted, so a fleet does not hit the LLM provider in the same instant (precedent:
        ;; security_center's SyncAdvisories).
        cron-str (format "0 %d 3 ? * 1 *" (rand-int 60))
        trigger  (triggers/build
                  (triggers/with-identity generation-trigger-key)
                  (triggers/for-job osi-generation/generation-job-key)
                  (triggers/start-now)
                  (triggers/with-schedule
                   (cron/schedule
                    (cron/cron-schedule cron-str)
                    (cron/in-time-zone (java.util.TimeZone/getTimeZone "UTC"))
                    ;; a missed weekly run should run late, not skip a week
                    (cron/with-misfire-handling-instruction-fire-and-proceed))))]
    ;; Keep the persisted trigger on restart so Quartz can apply its fire-and-proceed policy to a
    ;; past-due firing. `schedule-task!` reschedules an existing trigger and would replace that missed
    ;; firing with this new trigger's next weekly time. Refresh the durable job definition separately;
    ;; only create a trigger when none exists yet.
    (if (and (task/job-exists? osi-generation/generation-job-key)
             (seq (task/existing-triggers osi-generation/generation-job-key generation-trigger-key)))
      (task/add-job! job)
      (task/schedule-task! job trigger))))
