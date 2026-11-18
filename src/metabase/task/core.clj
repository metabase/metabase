(ns metabase.task.core
  (:require
   [metabase.task.impl]
   [potemkin :as p]))

(comment metabase.task.impl/keep-me)

(p/import-vars
 [metabase.task.impl
  add-job!
  add-job-listener!
  add-trigger!
  add-trigger-listener!
  defjob
  delete-all-triggers-of-job!
  delete-task!
  delete-trigger!
  existing-triggers
  init!
  init-scheduler!
  job-exists?
  job-info
  metrics-job-name-key
  rerun-on-error
  reschedule-trigger!
  schedule-once!
  schedule-task!
  scheduler
  scheduler-info
  start-scheduler!
  stop-scheduler!
  trigger-now!])
