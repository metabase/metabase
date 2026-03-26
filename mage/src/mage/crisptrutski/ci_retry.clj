(ns mage.crisptrutski.ci-retry
  (:require
   [babashka.process :as p]
   [cheshire.core :as json]
   [clojure.string :as str]))

(def ^:private repo "metabase/metabase")
(def ^:private max-retries 3)
(def ^:private poll-interval-ms 30000)

;;; Shell / GitHub helpers

(defn- sh
  "Run shell command, return stdout or nil on error."
  [& args]
  (try
    (let [result (apply p/shell {:out :string :err :string :in nil} args)]
      (when (zero? (:exit result))
        (str/trim (:out result))))
    (catch Exception e
      (binding [*out* *err*]
        (println (format "Shell error: %s" (.getMessage e))))
      nil)))

(defn- log [color icon msg]
  (binding [*out* *err*]
    (println (str color icon " " msg "\u001b[0m"))))

(defn- log-info [msg] (log "\u001b[34m" "→" msg))
(defn- log-ok [msg] (log "\u001b[32m" "✓" msg))
(defn- log-warn [msg] (log "\u001b[33m" "⚠" msg))
(defn- log-err [msg] (log "\u001b[31m" "✗" msg))

(defn- pr-checks
  "Fetch PR check statuses. Returns vec of {:name :state :link}."
  [pr-number]
  (when-let [result (sh "gh" "pr" "checks" (str pr-number) "-R" repo
                        "--json" "name,state,link")]
    (json/parse-string result true)))

(defn- get-current-branch-pr
  "Get PR number for current branch, or nil."
  []
  (when-let [result (sh "gh" "pr" "view" "--json" "number" "-q" ".number")]
    (when (re-matches #"\d+" result)
      result)))

;;; Check classification

(defn- extract-run-id
  "Extract the run ID from a GitHub Actions check link URL."
  [link]
  (when link
    (second (re-find #"/actions/runs/(\d+)" link))))

(defn- checks-done?
  "True when no checks are still pending/running."
  [checks]
  (every? #(not (#{"PENDING" "IN_PROGRESS" "QUEUED"} (:state %))) checks))

(defn- failed-checks [checks]
  (filter #(#{"FAILURE" "ERROR"} (:state %)) checks))

(defn- failed-run-ids
  "Distinct run IDs from failed checks."
  [checks]
  (->> (failed-checks checks)
       (keep (comp extract-run-id :link))
       distinct
       vec))

;;; Core logic

(defn- poll-until-done
  "Poll PR checks until all are complete. Returns final checks list."
  [pr-number]
  (loop []
    (let [checks (pr-checks pr-number)]
      (when-not checks
        (log-err "Failed to fetch checks")
        (System/exit 1))
      (let [n-pending (count (filter #(#{"PENDING" "IN_PROGRESS" "QUEUED"} (:state %)) checks))
            n-failed  (count (failed-checks checks))
            n-passed  (count (filter #(= "SUCCESS" (:state %)) checks))]
        (if (checks-done? checks)
          (do
            (log-ok (format "All checks complete — %d passed, %d failed" n-passed n-failed))
            checks)
          (do
            (log-info (format "Waiting… %d pending, %d failed, %d passed"
                              n-pending n-failed n-passed))
            (Thread/sleep poll-interval-ms)
            (recur)))))))

(defn- rerun-failed!
  "Rerun all failed run IDs. Returns the set of run IDs that were rerun."
  [run-ids]
  (doseq [run-id run-ids]
    (log-info (format "Rerunning failed jobs for run %s…" run-id))
    (let [result (sh "gh" "run" "rerun" run-id "--failed" "-R" repo)]
      (if result
        (log-ok (format "Triggered rerun for run %s" run-id))
        (log-warn (format "Failed to trigger rerun for run %s (may already be rerunning)" run-id)))))
  ;; Give GitHub a moment to register the reruns before we start polling
  (Thread/sleep 5000))

(defn ci-retry!
  "Poll checks for a PR, rerun failures up to 3 times."
  [{:keys [arguments]}]
  (let [pr-number (or (first arguments)
                      (get-current-branch-pr)
                      (do (log-err "No PR number given and no PR found for current branch.")
                          (System/exit 1)))]
    (log-info (format "Watching CI for PR #%s (max %d retries for failures)" pr-number max-retries))
    (loop [attempt 0]
      (let [checks   (poll-until-done pr-number)
            run-ids  (failed-run-ids checks)
            failures (failed-checks checks)]
        (cond
          (empty? failures)
          (do (log-ok "All checks passed!")
              (System/exit 0))

          (>= attempt max-retries)
          (do (log-err (format "Giving up after %d retries. %d check(s) still failing:"
                               max-retries (count failures)))
              (doseq [check (sort-by :name failures)]
                (log-err (format "  %s → %s" (:name check) (:link check))))
              (System/exit 1))

          (empty? run-ids)
          (do (log-err "Failed checks found but could not extract run IDs from links:")
              (doseq [check failures]
                (log-err (format "  %s → %s" (:name check) (:link check))))
              (System/exit 1))

          :else
          (do (log-warn (format "Attempt %d/%d — %d failure(s) across %d run(s), rerunning…"
                                (inc attempt) max-retries
                                (count failures) (count run-ids)))
              (doseq [check (sort-by :name failures)]
                (log-warn (format "  %s" (:name check))))
              (rerun-failed! run-ids)
              (recur (inc attempt))))))))
