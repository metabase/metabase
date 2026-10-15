(ns metabase-enterprise.library-branching.task-cleanup
  "A daily job that deletes old task rows of library branching."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.cron :as cron]
   [clojurewerkz.quartzite.triggers :as triggers]
   [java-time.api :as t]
   [metabase-enterprise.library-branching.db :as library-branching.db]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(def retention-days
  "The number of days that an ended task row stays."
  30)

(defn delete-old-tasks!
  "Deletes each ended task row that started more than [[retention-days]] days ago. An open row stays. Returns the
  number of rows deleted."
  []
  (let [n (library-branching.db/delete-task-rows-before! tasks/ended-statuses
                                                         (t/minus (t/offset-date-time) (t/days retention-days)))]
    (log/infof "Library branching deleted %d task rows older than %d days" n retention-days)
    n))

(task/defjob LibraryBranchingTaskCleanup
  "Deletes old task rows of library branching."
  {:saved-class "metabase_enterprise.library_branching.task_cleanup.LibraryBranchingTaskCleanup"
   :concurrent? false}
  [_ctx]
  (delete-old-tasks!))

(def ^:private job-key (jobs/key "metabase.task.library-branching.task-cleanup.job"))

(def ^:private trigger-key (triggers/key "metabase.task.library-branching.task-cleanup.trigger"))

(defmethod task/init! ::LibraryBranchingTaskCleanup
  [_]
  (task/schedule-task! (jobs/build
                        (jobs/of-type LibraryBranchingTaskCleanup)
                        (jobs/with-identity job-key))
                       (triggers/build
                        (triggers/with-identity trigger-key)
                        (triggers/start-now)
                        ;; daily at 2:41, a minute apart from the cleanup of remote sync
                        (triggers/with-schedule (cron/cron-schedule "0 41 2 * * ?")))))
