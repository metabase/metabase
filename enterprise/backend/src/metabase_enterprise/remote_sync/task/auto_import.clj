(ns metabase-enterprise.remote-sync.task.auto-import
  "Pulls the remote branch into a read-only instance on a schedule."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.remote-sync.core :as remote-sync]
   [metabase-enterprise.remote-sync.protocol :as protocol]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.remote-sync.sync :as sync]
   [metabase-enterprise.remote-sync.tasks :as tasks]
   [metabase.settings.core :as setting]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- auto-import!
  "Pulls the synced branch into a read-only instance with auto-import on, when it moved on since the last sync."
  []
  (let [ctx    (remote-sync/context)
        branch (setting/get :remote-sync-branch)]
    (when (and (:read-only? ctx) (setting/get :remote-sync-auto-import))
      (let [repo (remote-sync.settings/repository)]
        (protocol/fetch! repo)
        (if (= (protocol/version repo branch) (tasks/base-version))
          (log/debug "Skipping auto-import: the branch did not move on since the last sync")
          (tasks/run-now! {:type "import" :branch branch :event :event/remote-sync-import}
                          (fn [_report]
                            (sync/pull! repo branch ctx (tasks/base-version) {:force? true}))))))))

(task/defjob AutoImport
  "Pulls the remote branch into a read-only instance."
  {:saved-class "metabase_enterprise.remote_sync.task.import.AutoImport"}
  [_]
  (auto-import!))

(def ^:private job-key "metabase.task.remote-sync.auto-import.job")
(def ^:private trigger-key "metabase.task.remote-sync.auto-import.trigger")

(defmethod task/init! ::AutoImport [_]
  (let [rate (setting/get :remote-sync-auto-import-rate)]
    (when (pos-int? rate)
      (task/schedule-task! (jobs/build (jobs/of-type AutoImport) (jobs/with-identity (jobs/key job-key)))
                           (triggers/build
                            (triggers/with-identity (triggers/key trigger-key))
                            (triggers/for-job job-key)
                            (triggers/start-now)
                            (triggers/with-schedule
                             (simple/schedule (simple/with-interval-in-minutes rate)
                                              (simple/repeat-forever)
                                              (simple/ignore-misfires))))))))
