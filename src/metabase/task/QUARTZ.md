# Quartz Scheduler in Metabase

This document provides guidance for developers on how to use the Quartz scheduler in Metabase for background task scheduling.

## Overview

Metabase uses [Quartz](http://www.quartz-scheduler.org/) for scheduling and executing background tasks. The Quartz scheduler is initialized during Metabase startup and manages various tasks like syncing databases, sending pulses, cleaning up sessions, and more.

In Quartz, there are two fundamental concepts:

- **Job**: Represents a unit of work to be executed. Jobs are defined as classes that implement specific interfaces and contain the actual code to be run.
- **Trigger**: Defines when a job should be executed - it can be based on a schedule (like a cron expression), a specific time, or in response to events.

Jobs and triggers are created separately and then associated with each other when scheduled in the Quartz system.

## Use cases at Metabase

This list is not complete and is open to additions. If you have other use cases or patterns for Quartz tasks in Metabase, please feel free to add them here.

### 1. One-Time Startup Tasks

These tasks execute once when Metabase starts up. They're useful for initialization operations.

**Important Note:** In multi-instance deployments (e.g., cloud environments with multiple instances), these tasks will run on EVERY instance when it starts up. Additionally, these tasks will re-execute whenever a process restarts (e.g., after an OOM kill or deployment). This can lead to unexpected behavior if your task isn't idempotent.

**Alternative Approach:** For simple initialization tasks that don't cross-instance coordination, we can execute them directly as part of the startup process.

```clojure
(ns my.startup.task
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.triggers :as triggers]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [metabase.task :as task]))

(def startup-job-key     (jobs/key "my.startup.task.job"))
(def startup-trigger-key (triggers/key "my.startup.task.trigger"))

(task/defjob StartupTask [_]
  (println "Running startup initialization task"))

(defmethod task/init! ::StartupTask [_]  
  (let [job (jobs/build                  
             (jobs/of-type StartupTask)   ; Specify the job class to execute (the StartupTask we defined earlier)
             (jobs/with-identity startup) ; Set the job's identity using the startup-job-key defined above
             (jobs/with-description "One-time startup initialization task") )
        trigger (triggers/build                
                 (triggers/with-identity startup)
                 (triggers/for-job startup)       ; Associate this trigger with the job defined above
                 (triggers/start-now))]           ; Configure the trigger to fire immediately when scheduled
    (task/schedule-task! job trigger)))           ; Register both the job and trigger with the Quartz scheduler
```

### 2. Recurring Scheduled Tasks

These tasks run on a recurring schedule defined by a cron expression.

```clojure
(def daily-job-key     (jobs/key "my.scheduled.daily.task.job"))
(def daily-trigger-key (triggers/key "my.scheduled.daily.task.trigger"))

(task/defjob DailyTask [_]
  (println "Running daily scheduled task"))

(defmethod task/init! ::DailyTask [_]
  (let [job (jobs/build
             (jobs/of-type DailyTask)
             (jobs/with-identity daily)
             (jobs/with-description "Daily scheduled task")
             (jobs/store-durably))
        trigger (triggers/build
                 (triggers/with-identity daily)
                 (triggers/for-job daily)
                 (triggers/start-now)
                 (triggers/with-schedule
                  ;; Run every day at 2 AM
                  (cron/schedule
                   (cron/cron-schedule "0 0 2 * * ? *")
                   (cron/in-time-zone (driver/report-timezone)))))]
    (task/schedule-task! job trigger)))
```

#### Timezone Considerations

Notice in the example above that we set the timezone explicitly with `(cron/in-time-zone "UTC")`. By default, Quartz schedules are interpreted in the JVM's default timezone, but in Metabase we usually set the timezone to `report-timezone` .

**Important Note:** If your tasks are timezone sensitive, you'll need to rebuild the triggers when `driver/report-timezone` changes. See [[metabase.notification.task.send/update-send-notification-triggers-timezone!]] as an example of how we handle rescheduling.

### 3. Tasks that run once like a migration

We haven't found a good solution for this. For short and simple tasks we still encourage you to use custom migrations.

## Advanced Configuration

### Passing Data to Jobs

You can pass data to jobs using the job data map:

```clojure
(triggers/build
 ;; other trigger configuration...
 (triggers/using-job-data {"db-id" database-id}))
```

Inside the job, you can access this data:

```clojure
(task/defjob MyJob [job-context]
  (let [data-map (qc/from-job-data job-context)
        db-id (get data-map "db-id")]
    ;; Use the data...
    ))
```

### Handling Misfires

A misfire occurs when a trigger's scheduled fire time passes without the trigger firing (usually because the scheduler was down). Quartz provides several misfire instructions:

```clojure
(cron/with-misfire-handling-instruction-do-nothing)        ;; Don't fire missed executions
(cron/with-misfire-handling-instruction-fire-and-proceed)  ;; Fire once for missed executions
(cron/with-misfire-handling-instruction-ignore-misfires)   ;; Fire all missed executions
```

Choose the appropriate misfire handling based on your task's requirements.

### Preventing Concurrent Execution

By default, Quartz allows multiple instances of the same job to run concurrently. To prevent concurrent execution of a job, use the `DisallowConcurrentExecution` annotation:

```clojure
(task/defjob ^{org.quartz.DisallowConcurrentExecution true} MyNonConcurrentJob [job-context]
  (println "This job will not run concurrently with itself"))
```

When this annotation is applied, Quartz will block a new instance of the job from starting if a previous instance is still running. 
This is particularly important for long-running tasks that:
- we need to make sure they don't run concurrently across instances
- operate on shared resources

### Error Handling and Retries

Metabase provides a `rerun-on-error` macro to automatically retry a job if it fails with an exception:

```clojure
(task/defjob MyJob [job-context]
  (task/rerun-on-error job-context
    ;; Your job code here
    (do-something-that-might-fail)))
```

This will catch any exceptions, log them, and then throw a special `JobExecutionException` that tells Quartz to reschedule the job to run again **immediately**. Unlike scheduled retries with backoff, this causes the job to be retried right away, which may be appropriate for transient errors but could cause problems with persistent failures.

## Additional Resources

- [Quartz JavaDoc](http://www.quartz-scheduler.org/api/2.3.0/index.html)
- [Quartz Documentation](https://www.quartz-scheduler.org/documentation/)
- [Metabase Task Namespace](src/metabase/task.clj)
- [Quartzite Documentation](http://clojurequartz.info/) (Clojure wrapper for Quartz)
