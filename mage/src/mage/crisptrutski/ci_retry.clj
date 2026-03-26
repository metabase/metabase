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

(defn- extract-job-id
  "Extract the job ID from a GitHub Actions check link URL."
  [link]
  (when link
    (second (re-find #"job/(\d+)" link))))

(defn- job-logs-raw
  "Fetch raw logs for a specific job ID with retries."
  [job-id]
  (loop [attempt 1
         delay-ms 1000]
    (let [result (try
                   (let [proc (p/process {:out :string :err :string}
                                         "gh" "api"
                                         (format "repos/%s/actions/jobs/%s/logs" repo job-id))
                         result (deref proc 60000 ::timeout)]
                     (when (= ::timeout result)
                       (p/destroy-tree proc))
                     (when (and (not= ::timeout result)
                                (zero? (:exit result)))
                       (:out result)))
                   (catch Exception _ nil))]
      (if result
        result
        (when (< attempt 3)
          (Thread/sleep delay-ms)
          (recur (inc attempt) (* delay-ms 2)))))))

(defn- strip-ansi [s]
  (str/replace s #"\x1b\[[0-9;]*m" ""))

(defn- strip-timestamp [line]
  (str/replace line #"^\d{4}-\d{2}-\d{2}T[\d:.]+Z " ""))

(defn- tail-lines
  "Take the last n lines of a string. Avoids holding the full split in memory
   by scanning backwards for newlines."
  [s n]
  (loop [pos (count s)
         found 0]
    (if (or (zero? pos) (>= found n))
      (subs s (if (zero? pos) 0 (inc pos)))
      (recur (str/last-index-of s \newline (dec pos))
             (inc found)))))

(defn- parse-test-failures
  "Parse trunk report section from job logs.
   Only scans the last 2000 lines where the trunk report lives.
   Returns vec of {:test \"ns/name\" :link \"https://app.trunk.io/...\"} maps."
  [logs]
  (let [lines (->> (str/split-lines (strip-ansi (tail-lines logs 2000)))
                   (map strip-timestamp))
        in-report? (atom false)
        current-test (atom nil)
        results (atom [])]
    (doseq [line lines]
      (when (str/includes? line "📚")
        (reset! in-report? true))
      (when (and @in-report?
                 (or (str/includes? line "Post job cleanup")
                     (str/includes? line "##[error]")))
        (reset! in-report? false))
      (when @in-report?
        ;; 📦 lines mark a test group — use as fallback test identifier
        (when (str/includes? line "📦")
          (reset! current-test (str/trim (str/replace line #"📦\s*" ""))))
        ;; Clojure test namespace — more specific, overrides group name
        (when-let [test-name (and (re-find #"metabase[\w.-]+-test/" line)
                                  (re-find #"metabase[\w.-]+-test/[\w-]+" line))]
          (reset! current-test test-name))
        ;; Trunk link — associate with current test and reset
        (when-let [link (and (str/includes? line "trunk.io")
                             (re-find #"https://app\.trunk\.io/\S+" line))]
          (swap! results conj {:test @current-test :link link})
          (reset! current-test nil))))
    ;; Deduplicate by test name
    (->> @results
         (group-by :test)
         vals
         (map first)
         vec)))

(defn- fetch-failure-details
  "Fetch logs for failed checks in parallel and extract test names + trunk links.
   Returns map of check-name → [{:test :link}]."
  [checks]
  (let [checks-with-jobs (->> checks
                              (keep (fn [check]
                                      (when-let [job-id (extract-job-id (:link check))]
                                        (assoc check :job-id job-id)))))
        futures (mapv (fn [check]
                        [check (future (some-> (:job-id check) job-logs-raw))])
                      checks-with-jobs)]
    (->> futures
         (keep (fn [[check fut]]
                 (try
                   (when-let [logs (deref fut 60000 nil)]
                     (let [failures (parse-test-failures logs)]
                       (when (seq failures)
                         [(:name check) failures])))
                   (catch Exception _ nil))))
         (into {}))))

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
      (let [n-queued   (count (filter #(= "QUEUED" (:state %)) checks))
            n-pending  (count (filter #(#{"PENDING" "IN_PROGRESS"} (:state %)) checks))
            n-failed   (count (failed-checks checks))
            n-passed   (count (filter #(= "SUCCESS" (:state %)) checks))]
        (if (checks-done? checks)
          (do
            (log-ok (format "All checks complete — %d passed, %d failed" n-passed n-failed))
            checks)
          (do
            (log-info (format "Waiting… %d queued, %d pending, %d failed, %d passed"
                              n-queued n-pending n-failed n-passed))
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
  [{:keys [arguments options]}]
  (let [pr-number (or (first arguments)
                      (get-current-branch-pr)
                      (do (log-err "No PR number given and no PR found for current branch.")
                          (System/exit 1)))
        detailed? (:summarize-failures options)]
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
              (when detailed?
                (log-info "Fetching failure details from job logs…")
                (let [details (fetch-failure-details failures)]
                  (if (seq details)
                    (doseq [[check-name test-failures] (sort-by key details)]
                      (log-err (format "  %s:" check-name))
                      (doseq [{:keys [test link]} test-failures]
                        (if test
                          (log-err (format "    %s" test))
                          (log-err "    (unknown test)"))
                        (when link
                          (log-err (format "      ⤷ %s" link)))))
                    (log-warn "No test failure details found in job logs."))))
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
              (when detailed?
                (let [details (fetch-failure-details failures)]
                  (doseq [[check-name test-failures] (sort-by key details)]
                    (log-warn (format "  %s:" check-name))
                    (doseq [{:keys [test link]} test-failures]
                      (when link
                        (log-warn (format "    %s → %s" (or test "(unknown test)") link))))))))
              (rerun-failed! run-ids)
              (recur (inc attempt))))))))
