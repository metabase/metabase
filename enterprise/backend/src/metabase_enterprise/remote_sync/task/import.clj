(ns metabase-enterprise.remote-sync.task.import
  "Tasks for automatically importing from a remote source."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.remote-sync.impl :as impl]
   [metabase-enterprise.remote-sync.settings :as settings]
   [metabase.task.core :as task]))

(set! *warn-on-reflection* true)

(defn- auto-import!
  []
  (when (and (= "import" (settings/remote-sync-type)) (settings/remote-sync-auto-import))
    (impl/import! (settings/remote-sync-branch))))

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
