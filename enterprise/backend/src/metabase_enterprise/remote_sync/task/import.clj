(ns metabase-enterprise.remote-sync.task.import
  "Tasks for automatically importing from a remote source."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [diehard.core :as dh]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase-enterprise.remote-sync.source :as source]
   [metabase.app-db.cluster-lock :as cluster-lock]
   [metabase.config.core :as config]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- auto-import!
  []
  (when (and (settings/remote-sync-enabled)
             (= "import" (settings/remote-sync-type))
             (settings/remote-sync-auto-import))
    (let [{task-id :id
           existing? :existing?}
          (cluster-lock/with-cluster-lock impl/cluster-lock
            (if-let [{id :id} (remote-sync.task/current-task)]
              {:existing? true :id id}
              (remote-sync.task/create-sync-task! "import" config/internal-mb-user-id)))]
      (if-not existing?
        (log/warn "Remote sync in progress")
        (dh/with-timeout {:interrupt? true
                          :timeout-ms (settings/remote-sync-task-time-limit-ms)}
          (let [result (impl/import! (source/source-from-settings (settings/remote-sync-branch))
                                     task-id
                                     (settings/remote-sync-branch))]
            (case (:status result)
              :success (remote-sync.task/complete-sync-task! task-id)
              :error (remote-sync.task/fail-sync-task! task-id (:message result))
              (remote-sync.task/fail-sync-task! task-id "Unexpected Error"))))))))

(task/defjob ^{:doc "Auto-imports any remote collections."} AutoImport [_]
  (auto-import!))

(def ^:private auto-import-job-key "metabase.task.remote-sync.auto-import.job")
(def ^:private auto-import-trigger-key "metabase.task.remote-sync.auto-import.trigger")

(defmethod task/init! ::AutoImport [_]
  (let [rate (settings/remote-sync-auto-import-rate)
        job (jobs/build
             (jobs/of-type AutoImport)
             (jobs/with-identity (jobs/key auto-import-job-key)))
        trigger (triggers/build
                 (triggers/with-identity (triggers/key auto-import-trigger-key))
                 (triggers/for-job auto-import-job-key)
                 (triggers/start-now)
                 (triggers/with-schedule
                  (simple/schedule
                   (simple/with-interval-in-minutes rate)
                   (simple/repeat-forever)
                   (simple/ignore-misfires))))]
    (when (pos-int? rate)
      (task/schedule-task! job trigger))))
