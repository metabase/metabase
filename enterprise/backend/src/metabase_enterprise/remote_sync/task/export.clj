(ns metabase-enterprise.remote-sync.task.export
  "Tasks for exporting from a remote source."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase.task.core :as task]))

(set! *warn-on-reflection* true)

(defn- export!
  [message collections]
  (when (and (settings/remote-sync-enabled)
             (= "export" (settings/remote-sync-type)))
    (impl/export! (settings/remote-sync-branch) message collections)))

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
