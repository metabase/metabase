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
   [metabase.premium-features.core :refer [defenterprise]]
   [metabase.settings.core :as setting]
   [metabase.task-history.core :as task-history]
   [metabase.task.core :as task]
   [metabase.util.log :as log]
   [toucan2.core :as t2]))

(set! *warn-on-reflection* true)

(defn- import-if-changed!
  "Snapshot the configured source and import it unless its version matches the
  last imported version. `task-history-name` labels the task-history row."
  [task-history-name]
  (let [branch (settings/remote-sync-branch)
        source (source/source-from-settings branch)
        snapshot (source.p/snapshot source)
        snapshot-version (source.p/version snapshot)
        last-version (remote-sync.task/last-version)]
    (if (= last-version snapshot-version)
      (log/infof "Skipping import: source version %s matches last imported version" snapshot-version)
      (let [{task-id :id existing? :existing?} (impl/create-task-with-lock! "import")]
        (if existing?
          (log/info "Remote sync already in progress, not importing")
          (task-history/with-task-history {:task task-history-name
                                           :task_details {:task-id task-id}}
            (dh/with-timeout {:interrupt? true
                              :timeout-ms (* (settings/remote-sync-task-time-limit-ms) 10)}
              (log/info "Importing remote-sync collections")
              (let [result (impl/import! snapshot task-id)]
                (impl/handle-task-result! result task-id)
                (when (= :success (:status result))
                  ;; events/publish-event! rethrows handler exceptions; don't let an audit-log
                  ;; failure mark an already-successful import as failed
                  (try
                    (impl/publish-sync-event! :event/remote-sync-import task-id
                                              {:branch branch :auto true} nil)
                    (catch Exception e
                      (log/error e "Failed to publish remote-sync audit event"))))))))))))

(defn- auto-import!
  []
  (when (and (settings/remote-sync-enabled)
             (= :read-only (settings/remote-sync-type))
             (settings/remote-sync-auto-import))
    (import-if-changed! "remote-sync-auto-import")))

(task/defjob ^{:doc "Auto-imports any remote collections."} AutoImport [_]
  (auto-import!))

(defn- jekyll-sync-conventions!
  "Convention over config: on a Jekyll box everything syncs, because anything
  unsynced silently dies with the disposable app-db.

  - every top-level regular collection (non-archived, default namespace,
    non-personal) is marked `is_remote_synced`;
  - if no such collection exists, create a synced `Synced` collection so the box
    always has a push target;
  - `remote-sync-transforms` defaults to true when not explicitly configured."
  []
  (when-not (t2/exists? :model/Collection
                        :location "/" :archived false :namespace nil
                        :personal_owner_id nil :type nil)
    (t2/insert! :model/Collection {:name "Synced", :location "/"}))
  (t2/update! :model/Collection
              {:location "/", :archived false, :namespace nil, :personal_owner_id nil
               :type nil, :is_remote_synced false}
              {:is_remote_synced true})
  ;; raw env + db check: every getter layer applies the `false` default, which
  ;; would make an explicit config.yml `false` indistinguishable from unset
  (when (and (nil? (setting/env-var-value :remote-sync-transforms))
             (nil? (t2/select-one-fn :value :model/Setting :key "remote-sync-transforms")))
    (settings/remote-sync-transforms! true)))

(defenterprise jekyll-boot-import!
  "Jekyll mode: reload content from the configured git branch once at boot, so a
  fresh/wiped app-db converges to the branch state.

  Unlike the periodic AutoImport task, this does NOT require
  `remote-sync-type=read-only` or `remote-sync-auto-import`: those gates protect
  a long-lived read-write instance from pulling over unexported local edits, a
  hazard that cannot exist on a fresh boot with an empty app-db. A Jekyll box
  runs `read-write` (it must export its authored work back to the branch) and
  still needs this one import at boot. No-op when url/branch are unset (note
  `remote-sync-enabled` is derived from the url being set, so checking the url
  covers it)."
  :feature :none
  []
  (when (and (seq (settings/remote-sync-url))
             (seq (settings/remote-sync-branch)))
    (import-if-changed! "jekyll-boot-import")
    (jekyll-sync-conventions!)))

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
