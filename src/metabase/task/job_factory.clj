(ns metabase.task.job-factory
  "Provides a job factory for our quartz scheduler. The primary purpose of the custom factory is to prevent us from mark jobs as 'ERROR' when a metabase instance
  picks up a job by cannot find a class to instantiate it. This will occur during rolling upgrades when a newer metabase instance adds a job that an older instance
  does not have a class for."
  (:require
   [metabase.util.log :as log])
  (:import
   (org.quartz Job Scheduler TriggerListener)
   (org.quartz.simpl SimpleJobFactory)
   (org.quartz.spi JobFactory)))

(set! *warn-on-reflection* true)

(defrecord ^:private NoOpJob []
  Job
  (execute [_ _]
    (log/info "No-op job ran")))

(defn- no-op-job
  "Logs the exception and returns a no-op job."
  ^Job [e]
  (log/error e "Failed to load a job class. Usually this means an old version of metabase tried to run a job from a newer version")
  (->NoOpJob))

(defn create
  "Build a JobFactory object which wraps the default `SimpleJobFactory`. The task of this wrapper is to check if a job
  exists on the classpath before trying to run it. If the job does not exist this returns a no-op-Job to the scheduler.

  This can be used with a scheduler by setting it as the scheduler's jobFactory with `.setJobFactory`. It will either create
  a new SimpleJobFactory or wrap an existing factory, so you can reuse an existing job factory with it."
  (^JobFactory []
   (create (SimpleJobFactory.)))
  (^JobFactory [^JobFactory existing-factory]
   (reify JobFactory
     (newJob [_ bundle scheduler]
       (try
         (.newJob existing-factory bundle scheduler)
         (catch java.lang.ClassNotFoundException e (no-op-job e))
         (catch java.lang.NoClassDefFoundError e (no-op-job e)))))))

(def ^:private noop-trigger-listener-name ::noop-trigger-listener)

(defn create-listener
  "Create a TriggerListener that is able to veto executions of no-op jobs"
  ^TriggerListener []
  (reify TriggerListener
    (getName [_]
      (name noop-trigger-listener-name))

    (triggerFired [_ _ _])

    (vetoJobExecution [_ _ job-execution-context]
      (instance? NoOpJob (.getJobInstance job-execution-context)))

    (triggerMisfired [_ _])

    (triggerComplete [_ _ _ _])))

(defn add-to-scheduler
  "Attach the customer job factory to a scheduler instance."
  [^Scheduler scheduler]
  (.setJobFactory scheduler (create))
  (.. scheduler
      getListenerManager
      (addTriggerListener (create-listener))))
