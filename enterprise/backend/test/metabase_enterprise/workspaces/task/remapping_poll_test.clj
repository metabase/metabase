(ns metabase-enterprise.workspaces.task.remapping-poll-test
  "Tests for the Quartz wiring of the workspace remapping poller.

   The reconciler itself (pure `poll-once!`) is covered in
   `metabase-enterprise.workspaces.remapping-poll-test`. This ns is specifically
   for the `task/init!` defmethod: it must register the recurring trigger during
   `task/init-scheduler!` even though the workspace config atom is still nil at
   that point (config-from-file populates it *after* init-scheduler returns).
   See the corresponding init order in `metabase.core.core/init!*`."
  (:require
   [clojure.test :refer :all]
   [clojurewerkz.quartzite.jobs :as jobs]
   [metabase-enterprise.workspaces.core :as ws]
   [metabase.task.core :as task]
   [metabase.test :as mt]))

(def ^:private job-key
  (jobs/key "metabase.enterprise.workspaces.remapping-poll.job"))

(defn- with-clean-workspace-config [f]
  (let [config-atom @#'ws/workspaces-config
        prev        @config-atom]
    (reset! config-atom nil)
    (try (f)
         (finally (reset! config-atom prev)))))

(deftest init!-schedules-job-even-when-config-not-yet-loaded-test
  (testing "init! registers the RemappingPoll trigger even when ws config is nil"
    ;; Production startup order: `task/init-scheduler!` (which calls every
    ;; `defmethod task/init!`) runs BEFORE `config-from-file/init-from-file-if-code-available!`
    ;; in `metabase.core.core/init!*`. So at init time, config is nil and
    ;; `(ws/active?)` is false even on a config.yml-driven workspace instance.
    ;; The task must still schedule itself — the job body re-checks `(ws/active?)`
    ;; each tick so non-workspaced instances do no real work.
    (mt/with-temp-scheduler!
      (with-clean-workspace-config
        (fn []
          (is (false? (ws/active?)) "precondition: config not yet loaded")
          (is (false? (task/job-exists? job-key))
              "precondition: no job scheduled yet")
          (task/init! :metabase-enterprise.workspaces.task.remapping-poll/RemappingPoll)
          (is (true? (task/job-exists? job-key))
              "init! must schedule the job even when the workspace config atom is still nil"))))))
