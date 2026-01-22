(ns mage.ci-report
  (:require
   [babashka.process :as p]
   [cheshire.core :as json]
   [clojure.string :as str]))

(def ^:private repo "metabase/metabase")

;;; Utilities

(defn- sh
  "Run shell command, return stdout or nil on error"
  [& args]
  (try
    (let [result (apply p/shell {:out :string :err :string :in nil} args)]
      (when (zero? (:exit result))
        (str/trim (:out result))))
    (catch Exception e
      (binding [*out* *err*]
        (println (format "Shell error: %s" (.getMessage e))))
      nil)))

(defn- gh-api
  "Call GitHub API via gh cli, return parsed JSON"
  [endpoint]
  (when-let [result (sh "gh" "api" endpoint)]
    (json/parse-string result true)))

(defn- strip-ansi
  "Remove ANSI escape codes from string"
  [s]
  (-> s
      (str/replace #"\x1b\[[0-9;]*m" "")
      (str/replace #"\[J" "")
      (str/replace #"\[K" "")))

(defn- log-progress [msg]
  (binding [*out* *err*]
    (println (str "\u001b[34m→\u001b[0m " msg))))

(defn- log-success [msg]
  (binding [*out* *err*]
    (println (str "\u001b[32m✓\u001b[0m " msg))))

;;; GitHub API

(defn- pr-info
  "Fetch PR metadata"
  [pr-number]
  (when-let [result (sh "gh" "pr" "view" (str pr-number) "-R" repo
                        "--json" "headRefName,headRefOid,title,url")]
    (json/parse-string result true)))

(defn- pr-checks
  "Fetch PR check statuses"
  [pr-number]
  (when-let [result (sh "gh" "pr" "checks" (str pr-number) "-R" repo
                        "--json" "name,state,link")]
    (json/parse-string result true)))

(defn- find-test-report-start
  "Find the line index where the test report section starts.
   Tries multiple markers for robustness against format changes."
  [lines]
  (or
   ;; Primary: 📚 Test Report header from trunk-analytics-cli
   (->> lines
        (map-indexed vector)
        (filter (fn [[_ line]] (str/includes? line "📚")))
        first
        first)
   ;; Fallback 1: Test summary line pattern (Total: X Pass: Y Fail: Z)
   (->> lines
        (map-indexed vector)
        (filter (fn [[_ line]] (re-find #"Total:\s*\d+\s+Pass:" line)))
        first
        first)
   ;; Fallback 2: Trunk.io links (appear in test failure reports)
   (->> lines
        (map-indexed vector)
        (filter (fn [[_ line]] (str/includes? line "trunk.io")))
        first
        first)))

(defn- extract-test-report-section
  "Extract the test report section from logs.
   For jobs with verbose cleanup output, the test report may be buried
   far from the end of the logs."
  [logs]
  (let [lines (str/split-lines logs)
        report-idx (find-test-report-start lines)]
    (if report-idx
      ;; Take 200 lines starting from the marker (report is typically <50 lines)
      (->> lines
           (drop report-idx)
           (take 200)
           (str/join "\n"))
      ;; No marker found - fall back to last 2000 lines
      (->> lines
           (take-last 2000)
           (str/join "\n")))))

(defn- job-logs
  "Fetch logs for a specific job ID"
  [job-id]
  (try
    (let [result (p/shell {:out :string :err :string :continue true}
                          "timeout" "60" "gh" "api"
                          (format "repos/%s/actions/jobs/%s/logs" repo job-id))]
      (when (zero? (:exit result))
        (extract-test-report-section (:out result))))
    (catch Exception _ nil)))

(defn- extract-job-id
  "Extract job ID from a check link URL"
  [link]
  (when link
    (second (re-find #"job/(\d+)" link))))

;;; Log Parsing

(defn- parse-trunk-report
  "Extract test failure info from Trunk test report section in logs"
  [logs]
  (let [clean-logs (strip-ansi logs)
        lines (str/split-lines clean-logs)
        ;; Find the test report section - look for 📚 emoji specifically
        in-report? (atom false)
        results (atom [])]
    (doseq [line lines]
      ;; Start at "📚 Test Report" (the emoji version, not config text)
      (when (str/includes? line "📚")
        (reset! in-report? true))
      ;; Stop at "Post job cleanup" or error marker
      (when (and @in-report?
                 (or (str/includes? line "Post job cleanup")
                     (str/includes? line "##[error]")))
        (reset! in-report? false))
      ;; Extract relevant info
      (when @in-report?
        (cond
          ;; Summary line: "Total: X  Pass: Y  Fail: Z"
          (re-find #"Total:.*Pass:.*Fail:" line)
          (when-let [match (re-find #"Total:.*" line)]
            (swap! results conj {:type :summary :text (str/trim match)}))
          ;; Failed count line (contains "failed" and "quarantined" or "not quarantined")
          (and (str/includes? line "failed")
               (or (str/includes? line "quarantined")
                   (str/includes? line "not quarantined")))
          (let [;; Extract just the meaningful part: "X test(s) failed..."
                match (re-find #"\d+\s+tests?\s+failed.*" line)]
            (when match
              (swap! results conj {:type :failed-count :text (str/trim match)})))
          ;; Package name with 📦
          (str/includes? line "📦")
          (when-let [pkg (re-find #"metabase[\w.-]+-test" line)]
            (swap! results conj {:type :package :text pkg}))
          ;; Test name (namespace-test/test-name) - must have a slash
          (and (re-find #"metabase[\w.-]+-test/" line)
               (not (str/includes? line "📦")))  ;; Not the package line
          (when-let [test-name (re-find #"metabase[\w.-]+-test/[\w-]+" line)]
            (swap! results conj {:type :test-name :text test-name}))
          ;; Trunk link
          (str/includes? line "trunk.io")
          (when-let [link (re-find #"https://app\.trunk\.io/[^\s]+" line)]
            (swap! results conj {:type :trunk-link :text link})))))
    @results))

(defn- format-trunk-report
  "Format parsed trunk report as markdown"
  [report-items]
  (when (seq report-items)
    (->> report-items
         (map (fn [{:keys [type text]}]
                (case type
                  :summary text
                  :failed-count text  ;; Already has ❌ from the logs
                  :package (str "📦 " text)
                  :test-name (str "  ❌ " text)
                  :trunk-link (str "     ⤷ " text)
                  :quarantine text  ;; Already has ⚠️ from the logs
                  text)))
         (str/join "\n"))))

;;; Report Generation

(defn- categorize-checks
  "Categorize checks by state"
  [checks]
  {:failed (filter #(#{"FAILURE" "ERROR"} (:state %)) checks)
   :pending (filter #(#{"PENDING" "IN_PROGRESS" "QUEUED"} (:state %)) checks)
   :passed (filter #(= "SUCCESS" (:state %)) checks)})

(defn- fetch-failed-logs-parallel
  "Fetch logs for failed checks in parallel"
  [failed-checks]
  (let [job-ids (->> failed-checks
                     (map :link)
                     (map extract-job-id)
                     (filter some?)
                     distinct
                     (take 15))]  ; Limit to 15 jobs
    (when (seq job-ids)
      (log-progress (format "  Fetching logs for %d failed job(s) in parallel..." (count job-ids)))
      (->> job-ids
           (pmap (fn [job-id]
                   (when-let [logs (job-logs job-id)]
                     [job-id logs])))
           (filter some?)
           (into {})))))

(defn- generate-report
  "Generate markdown report"
  [pr-number pr-info checks logs-by-job-id]
  (let [{:keys [failed pending passed]} (categorize-checks checks)
        branch (:headRefName pr-info)
        sha (subs (:headRefOid pr-info) 0 7)
        title (:title pr-info)
        pr-url (:url pr-info)]

    (println (format "# CI Status Report for PR #%s" pr-number))
    (println)
    (println (format "**Title:** %s" title))
    (println)
    (println (format "**Branch:** `%s` | **Commit:** `%s`" branch sha))
    (println)
    (println (format "**PR:** %s" pr-url))
    (println)

    ;; Summary table
    (println "## Summary")
    (println)
    (println "| Status | Count |")
    (println "|--------|-------|")
    (println (format "| ✅ Passed | %d |" (count passed)))
    (println (format "| ❌ Failed | %d |" (count failed)))
    (println (format "| ⏳ Pending | %d |" (count pending)))
    (println (format "| **Total** | **%d** |" (count checks)))
    (println)

    ;; Status message
    (cond
      (and (zero? (count failed)) (zero? (count pending)))
      (do (println "✅ **All checks passing!**")
          (println))

      (and (pos? (count pending)) (zero? (count failed)))
      (do (println (format "⏳ **CI is still running...** (%d checks pending)" (count pending)))
          (println))

      (pos? (count pending))
      (do (println (format "⚠️ **CI has failures and is still running** (%d failed, %d pending)"
                           (count failed) (count pending)))
          (println)))

    (println "---")
    (println)

    ;; Failed checks detail
    (when (pos? (count failed))
      (println "## ❌ Failed Checks")
      (println)
      (doseq [check (sort-by :name failed)]
        (println (format "### %s" (:name check)))
        (println)
        (when-let [link (:link check)]
          (println (format "🔗 %s" link))
          (println))

        ;; Get logs for this check
        (let [job-id (extract-job-id (:link check))
              job-logs (get logs-by-job-id job-id)]
          (if job-logs
            (let [report (parse-trunk-report job-logs)
                  formatted (format-trunk-report report)]
              (if (seq formatted)
                (do (println "**Test Failures:**")
                    (println)
                    (println "````")
                    (println formatted)
                    (println "````"))
                (println "_No test failures found in logs._")))
            (println "_Logs not yet available or run still in progress._")))
        (println)))

    ;; Pending checks
    (when (pos? (count pending))
      (println "## ⏳ Pending Checks")
      (println)
      (doseq [check (sort-by :name pending)]
        (println (format "- %s" (:name check))))
      (println))

    (println "---")
    (println)
    (println (format "_Generated by `mage ci-report` at %s UTC_"
                     (.format (java.time.LocalDateTime/now)
                              (java.time.format.DateTimeFormatter/ofPattern "yyyy-MM-dd HH:mm:ss"))))))

;;; Main

(defn- get-current-branch-pr
  "Get PR number for current branch, or nil if none"
  []
  (when-let [result (sh "gh" "pr" "view" "--json" "number" "-q" ".number")]
    (when (re-matches #"\d+" result)
      result)))

(defn- parse-pr-arg
  "Parse PR argument - could be a number or a URL"
  [arg]
  (cond
    ;; Already a number
    (re-matches #"\d+" arg) arg
    ;; GitHub PR URL - extract the number
    (re-find #"github\.com/.+/pull/(\d+)" arg)
    (second (re-find #"github\.com/.+/pull/(\d+)" arg))
    ;; Otherwise return as-is and let gh handle it
    :else arg))

(defn generate-report! [{:keys [arguments]}]
  (let [pr-number (if (empty? arguments)
                    ;; No args - try to get PR for current branch
                    (do
                      (log-progress "No PR specified, checking current branch...")
                      (if-let [pr (get-current-branch-pr)]
                        (do (log-success (format "Found PR #%s for current branch" pr))
                            pr)
                        (do
                          (binding [*out* *err*]
                            (println "Error: No PR found for current branch")
                            (println "Usage: mage ci-report <pr-number or url>"))
                          (System/exit 1))))
                    ;; Parse the provided argument
                    (parse-pr-arg (first arguments)))]
    (log-progress (format "Fetching PR #%s info..." pr-number))

    (let [pr-info (pr-info pr-number)]
      (when-not pr-info
        (binding [*out* *err*]
          (println (format "Error: Could not fetch PR #%s" pr-number)))
        (System/exit 1))

      (log-success (format "Found PR on branch: %s" (:headRefName pr-info)))
      (log-progress "Checking PR status...")

      (let [checks (pr-checks pr-number)
            {:keys [failed pending]} (categorize-checks checks)]

        (log-progress (format "Found %d failed, %d pending check(s)"
                              (count failed) (count pending)))

        ;; Fetch logs for failed checks
        (log-progress "Fetching failed job logs...")
        (let [logs-by-job-id (if (pos? (count failed))
                               (fetch-failed-logs-parallel failed)
                               {})]
          (when (seq logs-by-job-id)
            (log-success "Retrieved logs"))

          (log-progress "Generating report...")
          (println)
          (generate-report pr-number pr-info checks logs-by-job-id)
          (log-success "Done!"))))))
