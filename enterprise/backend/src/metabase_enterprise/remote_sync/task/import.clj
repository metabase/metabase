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
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- auto-import!
  []
  (when (and (settings/remote-sync-enabled)
             (= :read-only (settings/remote-sync-type))
             (settings/remote-sync-auto-import))
    (let [branch (settings/remote-sync-branch)
          source (source/source-from-settings branch)
          snapshot (source.p/snapshot source)
          snapshot-version (source.p/version snapshot)
          last-version (remote-sync.task/last-version)]
      (if (= last-version snapshot-version)
        (log/infof "Skipping auto-import: source version %s matches last imported version" snapshot-version)
        (let [{task-id :id existing? :existing?} (impl/create-task-with-lock! "import")]
          (if existing?
            (log/info "Remote sync already in progress, not auto-importing")
            (task-history/with-task-history {:task "remote-sync-auto-import"
                                             :task_details {:task-id task-id}}
              (dh/with-timeout {:interrupt? true
                                :timeout-ms (* (settings/remote-sync-task-time-limit-ms) 10)}
                (log/info "Auto-importing remote-sync collections")
                (impl/handle-task-result! (impl/import! snapshot task-id) task-id)))))))))

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
