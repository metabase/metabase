(ns metabase-enterprise.remote-sync.init
  (:require
   [metabase-enterprise.remote-sync.core :as remote-sync]
   [metabase-enterprise.remote-sync.hooks]
   [metabase-enterprise.remote-sync.models.remote-sync-task :as remote-sync.task]
   [metabase-enterprise.remote-sync.settings :as remote-sync.settings]
   [metabase-enterprise.remote-sync.stats]
   [metabase-enterprise.remote-sync.sync :as sync]
   [metabase-enterprise.remote-sync.task.auto-import]
   [metabase-enterprise.remote-sync.task.table-cleanup]
   [metabase-enterprise.remote-sync.tasks :as tasks]
   [metabase.collections.core :as collections]
   [metabase.settings.core :as setting]
   [metabase.startup.core :as startup]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

(defn- remote-sync-init!
  "Ends the tasks a stopped server left running, stops syncing collections when remote sync is off, and pulls the
  synced branch into a read-only instance."
  []
  (remote-sync.task/supersede-stale-tasks!)
  (let [ctx (remote-sync/context)]
    (cond
      (nil? ctx)
      (when (collections/has-remote-synced-collection?)
        (log/info "Remote sync is off: no collection is synced any more")
        (collections/clear-remote-synced-collection!))

      (:read-only? ctx)
      (let [branch (setting/get :remote-sync-branch)]
        (tasks/start! {:type "import" :branch branch :event :event/remote-sync-import}
                      (fn [_report]
                        (sync/pull! (remote-sync.settings/repository) branch ctx (tasks/base-version)
                                    {:force? true})))))))

(defmethod startup/def-startup-logic! ::remote-sync-setup
  [_]
  (remote-sync-init!))
