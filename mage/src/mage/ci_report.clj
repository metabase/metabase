(ns mage.ci-report
  (:require
   [babashka.process :as p]
   [cheshire.core :as json]
   [clojure.string :as str]
   [mage.util :as u]))

(def ^:private repo "metabase/metabase")

;;; Utilities

(defn- sh-nil
  "Run shell command, return stdout or nil on error.
   Use for commands where non-zero exit is expected - e.g., `gh pr checks`
   returns exit 1 when checks fail but output is still valid JSON, and
   `gh pr view` returns exit 1 when no PR exists for the branch.
   For commands that should fail loudly, use `mage.util/sh` instead."
  [& args]
  (try
    (let [result @(apply p/process {:out :string :err :string :in nil} args)]
      (when (zero? (:exit result))
        (str/trim (:out result))))
    (catch Exception e
      (binding [*out* *err*]
        (println (format "Shell error: %s" (.getMessage e))))
      nil)))

(defn- gh-api
  "Call GitHub API via gh cli, return parsed JSON"
  [endpoint]
  (when-let [result (u/sh "gh" "api" endpoint)]
    (json/parse-string result true)))

(defn- strip-ansi
  "Remove ANSI escape codes from string"
  [s]
  (-> s
      (str/replace #"\x1b\[[0-9;]*m" "")
      (str/replace #"\x1b" "")  ;; Catch any stray ESC chars
      (str/replace #"\[J" "")
      (str/replace #"\[K" "")))

(defn- resolve-carriage-returns
  "Simulate carriage return behavior: for each line, keep only content after last \\r.
   This handles terminal progress animations that use \\r to overwrite the line.
   Also trims leading whitespace since terminal overwrites pad with spaces."
  [s]
  (->> (str/split-lines s)
       (map (fn [line]
              (if (str/includes? line "\r")
                (str/triml (last (str/split line #"\r")))
                line)))
       (str/join "\n")))

(def ^:private ^:dynamic *progress-log* nil)

(defn- log-progress [msg]
  (let [formatted (str "→ " msg)]
    (when *progress-log*
      (swap! *progress-log* conj formatted))
    (binding [*out* *err*]
      (println (str "\u001b[34m" formatted "\u001b[0m")))))

(defn- log-success [msg]
  (let [formatted (str "✓ " msg)]
    (when *progress-log*
      (swap! *progress-log* conj formatted))
    (binding [*out* *err*]
      (println (str "\u001b[32m" formatted "\u001b[0m")))))

;;; GitHub API

(defn- pr-info
  "Fetch PR metadata"
  [pr-number]
  (when-let [result (u/sh "gh" "pr" "view" (str pr-number) "-R" repo
                          "--json" "headRefName,headRefOid,title,url")]
    (json/parse-string result true)))

(defn- pr-checks
  "Fetch PR check statuses"
  [pr-number]
  (when-let [result (sh-nil "gh" "pr" "checks" (str pr-number) "-R" repo
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

(defn- job-logs-raw
  "Fetch raw logs for a specific job ID with retries"
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
        ;; Retry up to 3 times with exponential backoff
        (when (< attempt 3)
          (Thread/sleep delay-ms)
          (recur (inc attempt) (* delay-ms 2)))))))

(defn- job-logs
  "Fetch logs for a specific job ID, extracting test report section"
  [job-id]
  (when-let [raw (job-logs-raw job-id)]
    (extract-test-report-section raw)))

(defn- extract-job-id
  "Extract job ID from a check link URL"
  [link]
  (when link
    (second (re-find #"job/(\d+)" link))))

;;; Log Parsing

(defn- strip-timestamp
  "Remove GitHub Actions timestamp prefix from log line.
   Format: 2026-02-06T02:38:25.1443042Z <content>
   Strips the timestamp plus one trailing space, preserves remaining indentation."
  [line]
  (str/replace line #"^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?" ""))

(defn- parse-trunk-report
  "Extract test failure info from Trunk test report section in logs"
  [logs]
  (let [clean-logs (-> logs
                       strip-ansi
                       ;; Trunk CLI uses \r for terminal overwrite - resolve to final content
                       resolve-carriage-returns
                       ;; Also strip GitHub Actions timestamps
                       (->> str/split-lines
                            (map strip-timestamp)
                            (str/join "\n")))
        lines (str/split-lines clean-logs)
        ;; Find the test report section - look for 📚 emoji specifically
        in-report? (atom false)
        ;; Previous non-blank line in the report; the test name precedes its ⤷ link
        prev (atom nil)
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
          ;; Package/group name with 📦 - keep everything after the emoji
          ;; (works for Clojure `metabase.foo-test` and Cypress group names alike)
          (str/includes? line "📦")
          (when-let [idx (str/index-of line "📦")]
            ;; 📦 is a surrogate pair (2 Java chars)
            (swap! results conj {:type :package :text (str/trim (subs line (+ idx 2)))}))
          ;; Trunk link - the test name is the previous non-blank line
          (str/includes? line "trunk.io")
          (do
            (when (and @prev (seq (str/trim @prev)))
              (swap! results conj {:type :test-name :text (str/trim @prev)}))
            (when-let [link (re-find #"https://app\.trunk\.io/[^\s]+" line)]
              (swap! results conj {:type :trunk-link :text link})))
          ;; "…and N more failures in this group"
          (re-find #"and \d+ more failures" line)
          (swap! results conj {:type :more :text (str/trim line)})))
      (when (seq (str/trim line))
        (reset! prev line)))
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
                  :more (str "  " text)
                  :quarantine text  ;; Already has ⚠️ from the logs
                  text)))
         (str/join "\n"))))

(defn- extract-failure-blocks
  "Extract full FAIL/ERROR blocks from logs.
   Splits on FAIL in|ERROR in|LONG TEST and keeps FAIL/ERROR blocks."
  [logs]
  (let [clean-logs (strip-ansi logs)
        lines (->> (str/split-lines clean-logs)
                   (map strip-timestamp))
        ;; State: collecting lines for current block
        current-block (atom [])
        blocks (atom [])
        in-block? (atom false)
        block-type (atom nil)]
    (doseq [line lines]
      (cond
        ;; Start of a FAIL block
        (re-find #"^FAIL in " line)
        (do
          ;; Save previous block if it was FAIL/ERROR
          (when (and @in-block? (#{:fail :error} @block-type))
            (swap! blocks conj {:type @block-type :lines @current-block}))
          (reset! current-block [line])
          (reset! in-block? true)
          (reset! block-type :fail))

        ;; Start of an ERROR block
        (re-find #"^ERROR in " line)
        (do
          (when (and @in-block? (#{:fail :error} @block-type))
            (swap! blocks conj {:type @block-type :lines @current-block}))
          (reset! current-block [line])
          (reset! in-block? true)
          (reset! block-type :error))

        ;; LONG TEST - ends previous block, but we don't collect this one
        (re-find #"LONG TEST" line)
        (do
          (when (and @in-block? (#{:fail :error} @block-type))
            (swap! blocks conj {:type @block-type :lines @current-block}))
          (reset! current-block [])
          (reset! in-block? false)
          (reset! block-type nil))

        ;; Test summary - ends collection, but include the line (has duration)
        (re-find #"^Ran \d+ tests in" line)
        (do
          (when @in-block?
            (swap! current-block conj line)
            (swap! current-block conj "")  ;; blank line after
            (when (#{:fail :error} @block-type)
              (swap! blocks conj {:type @block-type :lines @current-block})))
          (reset! current-block [])
          (reset! in-block? false)
          (reset! block-type nil))

        ;; Continue collecting if in a block
        @in-block?
        (swap! current-block conj line)))
    ;; Don't forget the last block
    (when (and @in-block? (#{:fail :error} @block-type) (seq @current-block))
      (swap! blocks conj {:type @block-type :lines @current-block}))
    @blocks))

(defn- extract-cypress-failures
  "Extract Cypress (E2E) failure blocks from logs.
   Cypress prints failures as numbered blocks:
     1) suite > nested > test title:
          AssertionError: ...
           at fn (path/to/spec.cy.spec.js:123:4)
   A block starts at a `  N) ` line and runs until the next numbered failure,
   a results/screenshot/video separator, the passing/failing summary, or a
   spec/run separator rule."
  [logs]
  (let [clean-logs (strip-ansi logs)
        lines (->> (str/split-lines clean-logs)
                   (map strip-timestamp))
        current-block (atom [])
        blocks (atom [])
        in-block? (atom false)
        end-block! (fn []
                     (when @in-block?
                       ;; drop trailing blank lines
                       (let [trimmed (vec (reverse (drop-while (comp str/blank? str)
                                                               (reverse @current-block))))]
                         (when (seq trimmed)
                           (swap! blocks conj {:type :cypress :lines trimmed}))))
                     (reset! current-block [])
                     (reset! in-block? false))]
    (doseq [line lines]
      (cond
        ;; Start of a numbered Cypress failure block
        (re-find #"^\s+\d+\)\s" line)
        (do
          (end-block!)
          (reset! current-block [line])
          (reset! in-block? true))

        ;; Boundaries that close a failure block
        (and @in-block?
             (or (re-find #"^\s*\(Results\)" line)
                 (re-find #"^\s*\(Screenshots\)" line)
                 (re-find #"^\s*\(Video\)" line)
                 (re-find #"^\s*\d+\s+passing" line)
                 (re-find #"^\s*={5,}\s*$" line)
                 (re-find #"^\s*─{5,}\s*$" line)
                 (str/includes? line "Run Finished")))
        (end-block!)

        @in-block?
        (swap! current-block conj line)))
    (end-block!)
    @blocks))

(defn- format-failure-blocks
  "Format failure blocks as markdown"
  [blocks]
  (when (seq blocks)
    (->> blocks
         (map (fn [{:keys [lines]}]
                (str/join "\n" lines)))
         (str/join "\n\n---\n\n"))))

;;; Report Generation

(defn- categorize-checks
  "Categorize checks by state"
  [checks]
  {:failed (filter #(#{"FAILURE" "ERROR"} (:state %)) checks)
   :pending (filter #(#{"PENDING" "IN_PROGRESS" "QUEUED"} (:state %)) checks)
   :passed (filter #(= "SUCCESS" (:state %)) checks)})

(defn- fetch-failed-logs-parallel
  "Fetch logs for failed checks in parallel using futures.
   When detailed? is true, fetches full logs; otherwise just the test report section."
  [failed-checks {:keys [detailed?]}]
  (let [job-ids (->> failed-checks
                     (map :link)
                     (map extract-job-id)
                     (filter some?)
                     distinct
                     vec)
        fetch-fn (if detailed? job-logs-raw job-logs)]
    (when (seq job-ids)
      (log-progress (format "  Fetching logs for %d failed job(s) in parallel%s..."
                            (count job-ids)
                            (if detailed? " (with expected/actual)" "")))
      ;; Launch all fetches as futures
      (let [futures (mapv (fn [job-id]
                            [job-id (future (fetch-fn job-id))])
                          job-ids)]
        ;; Collect results, with 60s timeout per job
        (->> futures
             (keep (fn [[job-id fut]]
                     (try
                       (when-let [logs (deref fut 60000 nil)]
                         [job-id logs])
                       (catch Exception _ nil))))
             (into {}))))))

(defn- generate-report
  "Generate markdown report.
   pr-number and pr-info may be nil for branch/SHA reports."
  [pr-number pr-info checks logs-by-job-id {:keys [detailed? progress-log branch sha attempt]}]
  (let [{:keys [failed pending passed]} (categorize-checks checks)
        branch (or (:headRefName pr-info) branch)
        sha    (or (:headRefOid pr-info) sha)]
    (if pr-number
      (println (format "# CI Report for PR #%s: %s" pr-number (:title pr-info)))
      (println (format "# CI Report for %s" (or branch sha))))
    (println)
    (println "## Metadata")
    (println)
    (when pr-number
      (println (format "- **PR:** [#%s](%s)" pr-number (:url pr-info))))
    (when branch
      (println (format "- **Branch:** `%s`" branch)))
    (when sha
      (println (format "- **SHA:** `%s`" sha)))
    (println (format "- **Mode:** %s" (if detailed? "Detailed (with expected/actual)" "Summary")))
    (when attempt
      (println (format "- **Attempt:** `%d`" attempt)))
    (println)
    ;; Progress log section
    (when (and progress-log (seq @progress-log))
      (println "## Loading Data")
      (println)
      (println "```")
      (doseq [msg @progress-log]
        (println msg))
      (println "```")
      (println))
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
      (zero? (count checks))
      (do (println "⚠️ **No checks found.** CI may not have started yet, or check data was unavailable. Try again in a minute.")
          (println))

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
            (if detailed?
              ;; Detailed mode: show full FAIL/ERROR blocks (Clojure) and
              ;; numbered failure blocks (Cypress E2E)
              (let [blocks (concat (extract-failure-blocks job-logs)
                                   (extract-cypress-failures job-logs))
                    formatted (format-failure-blocks blocks)]
                (if (seq formatted)
                  (do (println "**Test Failures:**")
                      (println)
                      (println "```")
                      (println formatted)
                      (println "```"))
                  (println "_No test failures found in logs._")))
              ;; Summary mode: show trunk report summary
              (let [report (parse-trunk-report job-logs)
                    formatted (format-trunk-report report)]
                (if (seq formatted)
                  (do (println "**Test Failures:**")
                      (println)
                      (println "````")
                      (println formatted)
                      (println "````"))
                  (println "_No test failures found in logs._"))))
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
  (when-let [result (sh-nil "gh" "pr" "view" "--json" "number" "-q" ".number")]
    (when (re-matches #"\d+" result)
      result)))

(defn- classify-arg
  "Classify an argument as a PR number, commit SHA, or branch name.
   Returns {:type (:pr|:branch|:sha), :value string}."
  [arg]
  (cond
    ;; GitHub PR URL
    (re-find #"github\.com/.+/pull/(\d+)" arg)
    {:type :pr :value (second (re-find #"github\.com/.+/pull/(\d+)" arg))}
    ;; All digits → PR number
    (re-matches #"\d+" arg)
    {:type :pr :value arg}
    ;; Hex string 7-40 chars → commit SHA
    (re-matches #"[0-9a-f]{7,40}" arg)
    {:type :sha :value arg}
    ;; Everything else → branch name
    :else
    {:type :branch :value arg}))

(defn- normalize-check-state
  "Map GitHub Check Runs API status/conclusion to the state strings
   that categorize-checks expects (SUCCESS, FAILURE, PENDING, etc)."
  [{:keys [status conclusion]}]
  (if (= status "completed")
    (case conclusion
      "success"   "SUCCESS"
      "skipped"   "SUCCESS"
      "failure"   "FAILURE"
      "timed_out" "FAILURE"
      "cancelled" "FAILURE"
      ;; action_required, stale, neutral
      "FAILURE")
    (case status
      "in_progress" "IN_PROGRESS"
      "queued"      "QUEUED"
      "PENDING")))

(defn- commit-check-runs
  "Fetch check runs for a commit SHA. Returns vec of {:name :state :link} maps
   matching the shape returned by pr-checks."
  [sha]
  (loop [page 1
         all-runs []]
    (when-let [result (gh-api (format "repos/%s/commits/%s/check-runs?per_page=100&page=%d"
                                      repo sha page))]
      (let [runs (:check_runs result)
            accumulated (into all-runs runs)]
        (if (< (count accumulated) (:total_count result))
          (recur (inc page) accumulated)
          (mapv (fn [run]
                  {:name  (:name run)
                   :state (normalize-check-state run)
                   :link  (:html_url run)})
                accumulated))))))

(defn- workflow-runs-for-sha
  "Fetch all workflow runs for a commit SHA. Each result includes :id and
   :run_attempt (the latest attempt number for that run)."
  [sha]
  (loop [page 1
         all []]
    (if-let [result (gh-api (format "repos/%s/actions/runs?head_sha=%s&per_page=100&page=%d"
                                    repo sha page))]
      (let [runs (:workflow_runs result)
            accumulated (into all runs)]
        (if (and (seq runs) (< (count accumulated) (:total_count result)))
          (recur (inc page) accumulated)
          accumulated))
      all)))

(defn- jobs-for-attempt
  "Fetch jobs belonging to a specific attempt of a workflow run."
  [run-id attempt-number]
  (loop [page 1
         all []]
    (if-let [result (gh-api (format "repos/%s/actions/runs/%s/attempts/%d/jobs?per_page=100&page=%d"
                                    repo run-id attempt-number page))]
      (let [jobs (:jobs result)
            accumulated (into all jobs)]
        (if (and (seq jobs) (< (count accumulated) (:total_count result)))
          (recur (inc page) accumulated)
          accumulated))
      all)))

(defn- job->check
  "Convert a GitHub Actions job into the {:name :state :link} check shape."
  [job]
  {:name  (:name job)
   :state (normalize-check-state {:status     (:status job)
                                  :conclusion (:conclusion job)})
   :link  (:html_url job)})

(defn- resolve-attempt
  "Resolve a possibly-negative attempt index against max-attempt.
   Positive N => N. 0 => max-attempt. Negative N => max-attempt + N
   (so -1 means one attempt prior to the latest)."
  [attempt-number max-attempt]
  (if (pos? attempt-number)
    attempt-number
    (+ max-attempt attempt-number)))

(defn- attempt-checks
  "Fetch check-like data for a specific attempt across all workflow runs for a
   commit. Skips workflow runs whose total attempt count is less than the
   resolved attempt number. Returns {:checks vec :resolved-attempt N :max-attempt N}.

   `attempt-number` may be negative or zero to index relative to the latest
   attempt: 0 = latest, -1 = one prior to latest, etc."
  [sha attempt-number]
  (let [runs (workflow-runs-for-sha sha)
        max-attempt (some->> runs (map :run_attempt) (apply max))]
    (when (zero? (count runs))
      (u/exit (format "Error: No workflow runs found for SHA %s" sha) 1))
    (let [resolved (resolve-attempt attempt-number max-attempt)]
      (when (< resolved 1)
        (u/exit (format "Error: resolved attempt %d is < 1 (requested %d, max attempt %d)"
                        resolved attempt-number max-attempt) 1))
      (when (> resolved max-attempt)
        (u/exit (format "Error: resolved attempt %d exceeds max attempt %d (requested %d)"
                        resolved max-attempt attempt-number) 1))
      (when (not= resolved attempt-number)
        (log-progress (format "Resolved attempt %d to absolute attempt %d (max: %d)"
                              attempt-number resolved max-attempt)))
      {:resolved-attempt resolved
       :max-attempt      max-attempt
       :checks           (->> runs
                              (filter (fn [run] (<= resolved (:run_attempt run))))
                              (mapcat (fn [run] (jobs-for-attempt (:id run) resolved)))
                              (mapv job->check))})))

(defn- resolve-branch-head
  "Resolve a branch name to its latest CI commit SHA.
   Uses the GitHub Actions runs API to find the most recent workflow run."
  [branch]
  (when-let [result (gh-api (format "repos/%s/actions/runs?branch=%s&per_page=1"
                                    repo (java.net.URLEncoder/encode branch "UTF-8")))]
    (get-in result [:workflow_runs 0 :head_sha])))

(defn- run-pr-report!
  "Generate report for a PR number. The original/primary code path.
   When `attempt` is provided, fetches jobs for that specific workflow run attempt
   instead of the latest check results."
  [pr-number {:keys [detailed? attempt]}]
  (log-progress (format "Fetching PR #%s info..." pr-number))
  (let [info (pr-info pr-number)]
    (when-not info
      (binding [*out* *err*]
        (println (format "Error: Could not fetch PR #%s" pr-number)))
      (u/exit 1))
    (log-success (format "Found PR on branch: %s" (:headRefName info)))
    (log-progress (if attempt
                    (format "Fetching attempt %d jobs for SHA %s..."
                            attempt (subs (:headRefOid info) 0 12))
                    "Checking PR status..."))
    (let [{:keys [checks resolved-attempt]}
          (if attempt
            (attempt-checks (:headRefOid info) attempt)
            {:checks (pr-checks pr-number)})]
      (when-not checks
        (u/exit (format "Error: Could not fetch checks for PR #%s (API error)" pr-number) 1))
      (let [{:keys [failed pending]} (categorize-checks checks)]
        (log-progress (format "Found %d failed, %d pending check(s)"
                              (count failed) (count pending)))
        (log-progress "Fetching failed job logs...")
        (let [logs-by-job-id (if (pos? (count failed))
                               (fetch-failed-logs-parallel failed {:detailed? detailed?})
                               {})]
          (when (seq logs-by-job-id)
            (log-success "Retrieved logs"))
          (log-progress (str "Generating report" (when detailed? " (detailed mode)") "..."))
          (println)
          (generate-report pr-number info checks logs-by-job-id
                           {:detailed?    detailed?
                            :progress-log *progress-log*
                            :attempt      resolved-attempt})
          (log-success "Done!"))))))

(defn- run-commit-report!
  "Generate report for a commit SHA (with optional branch name for display).
   When `attempt` is provided, fetches jobs for that specific workflow run attempt."
  [sha branch {:keys [detailed? attempt]}]
  (log-progress (if attempt
                  (format "Fetching attempt %d jobs for %s..."
                          attempt (subs sha 0 (min 12 (count sha))))
                  (format "Fetching check runs for %s..." (subs sha 0 (min 12 (count sha))))))
  (let [{:keys [checks resolved-attempt]}
        (if attempt
          (attempt-checks sha attempt)
          {:checks (commit-check-runs sha)})]
    (when-not checks
      (binding [*out* *err*]
        (println (format "Error: Could not fetch checks for %s" sha)))
      (u/exit 1))
    (let [{:keys [failed pending]} (categorize-checks checks)]
      (log-progress (format "Found %d failed, %d pending check(s)"
                            (count failed) (count pending)))
      (log-progress "Fetching failed job logs...")
      (let [logs-by-job-id (if (pos? (count failed))
                             (fetch-failed-logs-parallel failed {:detailed? detailed?})
                             {})]
        (when (seq logs-by-job-id)
          (log-success "Retrieved logs"))
        (log-progress (str "Generating report" (when detailed? " (detailed mode)") "..."))
        (println)
        (generate-report nil nil checks logs-by-job-id
                         {:detailed?    detailed?
                          :progress-log *progress-log*
                          :branch       branch
                          :sha          sha
                          :attempt      resolved-attempt})
        (log-success "Done!")))))

(defn generate-report! [{:keys [arguments options]}]
  (binding [*progress-log* (atom [])]
    (let [detailed? (:detailed options)
          attempt   (:attempt options)
          opts      {:detailed? detailed? :attempt attempt}
          {:keys [type value]} (if (empty? arguments)
                                 ;; No args: try PR first, fall back to branch
                                 (do
                                   (log-progress "No argument specified, checking current branch...")
                                   (if-let [pr (get-current-branch-pr)]
                                     (do (log-success (format "Found PR #%s for current branch" pr))
                                         {:type :pr :value pr})
                                     ;; No PR — use current branch name
                                     (let [branch (u/sh "git" "rev-parse" "--abbrev-ref" "HEAD")]
                                       (if branch
                                         (do (log-progress (format "No PR found, using branch: %s" branch))
                                             {:type :branch :value branch})
                                         (do
                                           (binding [*out* *err*]
                                             (println "Error: No PR found and could not determine current branch")
                                             (println "Usage: mage ci-report [--detailed] [--attempt N] <pr-number|branch|sha>"))
                                           (u/exit 1))))))
                                 ;; Explicit argument
                                 (classify-arg (first arguments)))]
      (case type
        :pr     (run-pr-report! value opts)
        :branch (do
                  (log-progress (format "Resolving branch '%s' to latest CI commit..." value))
                  (let [sha (resolve-branch-head value)]
                    (if sha
                      (do (log-success (format "Resolved to SHA: %s" (subs sha 0 (min 12 (count sha)))))
                          (run-commit-report! sha value opts))
                      (do (binding [*out* *err*]
                            (println (format "Error: No CI runs found for branch '%s'" value)))
                          (u/exit 1)))))
        :sha    (run-commit-report! value nil opts)))))
