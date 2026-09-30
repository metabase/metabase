(ns metabase.task.core
  (:require
   [metabase.task.impl]
   [metabase.task.secure-delegate :as secure-delegate]
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
  do-after-app-db-commit
  existing-triggers
  init!
  init-scheduler!
  job-exists?
  job-info
  rerun-on-error
  reschedule-trigger!
  schedule-task!
  scheduler
  scheduler-disabled?
  scheduler-info
  start-scheduler!
  stop-scheduler!
  trigger-now!])

(p/import-vars
 [secure-delegate
  object-from-blob-postgres
  object-from-blob-std])

(defn install-secure-delegate!
  "Install the allowlisted Quartz delegate, also used when queue affinity cannot initialize."
  [db-type]
  (secure-delegate/install! db-type))
