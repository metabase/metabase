(ns metabase-enterprise.library-branching.scheduled-deploy
  "The scheduled deploy of a consumption instance: a job that deploys the head of its branch every
  `remote-sync-auto-import-rate` minutes (read at boot; not positive: no job) while `remote-sync-auto-import` is on. A
  tick starts no task while a task runs, or when the head is the base. A red head is reported once for each pair of
  the head and its findings, not on every tick: the report is the failed deploy task."
  (:require
   [clojurewerkz.quartzite.jobs :as jobs]
   [clojurewerkz.quartzite.schedule.simple :as simple]
   [clojurewerkz.quartzite.triggers :as triggers]
   [metabase-enterprise.library-branching.deploy :as deploy]
   [metabase-enterprise.library-branching.format.kinds :as kinds]
   [metabase-enterprise.library-branching.instance :as instance]
   [metabase-enterprise.library-branching.operations :as operations]
   [metabase-enterprise.library-branching.pull :as pull]
   [metabase-enterprise.library-branching.repository :as repository]
   [metabase-enterprise.library-branching.store :as store]
   [metabase-enterprise.library-branching.tasks :as tasks]
   [metabase.settings.core :as setting]
   [metabase.task.core :as task]
   [metabase.util.log :as log]))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------------ Reports -----------------------------------------------------

;; The report key of the last deploy result of this JVM. A cache that may only over-report: with no entry, or after a
;; restart, a red head is reported again.
(defonce ^:private last-report
  (atom nil))

(defn report-key
  "The pair that names the report of deploy result `result` (`deploy/deploy!`): `[head findings]` for a red head,
  `[nil :no-branch]` for a missing branch, else nil."
  [{:keys [result head findings]}]
  (case result
    :invalid   [head findings]
    :no-branch [nil :no-branch]
    nil))

(defn- record-report!
  [result]
  (reset! last-report (report-key result)))

;;; ------------------------------------------------------- Ticks ------------------------------------------------------

(defn- scheduled?
  []
  (boolean (and (operations/deploys?) (setting/get :remote-sync-auto-import))))

(defn- head-report
  "`{:head h :key k}` for the head `h` of `branch` in `store`, with `k` the [[report-key]] of a deploy of `h` onto
  instance `inst` (nil for a green head); `{:head h :up-to-date true}` when `h` is the base of `inst`."
  [inst store branch]
  (let [h (store/head store branch)]
    (cond
      (nil? h)               {:head nil :key [nil :no-branch]}
      (= h (instance/base inst)) {:head h :up-to-date true}
      :else
      (let [{:keys [findings]} (deploy/check-head store kinds/codecs (pull/decode-opts inst) (operations/instance-env) h)]
        {:head h :key (when findings [h findings])}))))

(defn tick!
  "One tick of the scheduled deploy. Returns:

  - `{:result :off}`: this instance does not deploy its branch (`operations/deploys?`), or `remote-sync-auto-import`
    is off;
  - `{:result :task-running}`: a task runs;
  - `{:result :up-to-date :head h}`: the head is the base;
  - `{:result :reported :head h}`: the last deploy reported this head with these findings, or this missing branch;
  - `{:result :started :task t}`: the tick started deploy task `t` for the system, with the audit flag auto;
  - `{:result :not-started :message m}`: another task started first.

  Only `:started` writes a task row."
  []
  (cond
    (not (scheduled?)) {:result :off}
    (tasks/live-task)  {:result :task-running}
    :else
    (let [inst                        (operations/instance)
          {:keys [head key up-to-date]} (repository/do-with-store #(head-report inst % (repository/branch)))]
      (cond
        up-to-date                          {:result :up-to-date :head head}
        (and key (= key @last-report))      {:result :reported :head head}
        :else
        (try
          {:result :started :task (operations/start-deploy! nil {:auto? true :on-result record-report!})}
          (catch clojure.lang.ExceptionInfo e
            (if (= 400 (:status-code (ex-data e)))
              {:result :not-started :message (ex-message e)}
              (throw e))))))))

(defn run-tick!
  "[[tick!]], with a throw logged and returned as `{:result :error :message m}`."
  []
  (try
    (let [result (tick!)]
      (log/debugf "Library branching scheduled deploy: %s" (pr-str (update result :task :id)))
      result)
    (catch Throwable e
      (log/warn e "The scheduled deploy of library branching failed.")
      {:result :error :message (or (ex-message e) (.getName (class e)))})))

;;; -------------------------------------------------------- Job -------------------------------------------------------

(task/defjob LibraryBranchingScheduledDeploy
  "Deploys the head of the branch of a consumption instance of library branching."
  {:saved-class "metabase_enterprise.library_branching.scheduled_deploy.LibraryBranchingScheduledDeploy"
   :concurrent? false}
  [_ctx]
  (run-tick!))

(def ^:private job-key (jobs/key "metabase.task.library-branching.scheduled-deploy.job"))

(def ^:private trigger-key (triggers/key "metabase.task.library-branching.scheduled-deploy.trigger"))

(defmethod task/init! ::LibraryBranchingScheduledDeploy
  [_]
  (let [rate (setting/get :remote-sync-auto-import-rate)]
    (if-not (pos-int? rate)
      (task/delete-task! job-key trigger-key)
      (task/schedule-task! (jobs/build
                            (jobs/of-type LibraryBranchingScheduledDeploy)
                            (jobs/with-identity job-key))
                           (triggers/build
                            (triggers/with-identity trigger-key)
                            (triggers/for-job job-key)
                            (triggers/start-now)
                            (triggers/with-schedule
                             (simple/schedule
                              (simple/with-interval-in-minutes rate)
                              (simple/repeat-forever)
                              (simple/ignore-misfires))))))))
