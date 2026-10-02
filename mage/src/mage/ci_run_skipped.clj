(ns mage.ci-run-skipped
  "Start a one-off \"Run tests\" run for the current branch when its PR run was force-skipped."
  (:require
   [babashka.json :as json]
   [babashka.process :as p]
   [clojure.string :as str]
   [mage.color :as c]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(def ^:private repo "metabase/metabase")

(def ^:private workflow "run-tests.yml")

(def ^:private decide-job "Decide which jobs should run")

(defn- info [msg]
  (binding [*out* *err*]
    (println (c/blue (str "→ " msg)))))

(defn- fail! [exit-code msg]
  (binding [*out* *err*]
    (println (c/red (str "✗ " msg))))
  (u/exit exit-code))

(defn- gh
  "Run `gh` with `args` and return its trimmed stdout.
  Exits with `gh`'s error message, after `hint` when given, if it fails."
  [{:keys [hint]} & args]
  (let [{:keys [exit out err]} @(apply p/process {:out :string :err :string :in nil} "gh" args)]
    (if (zero? exit)
      (str/trim out)
      (fail! 3 (str/join "\n" (remove nil? [(str "gh " (first args) " failed: " (str/trim err)) hint]))))))

(defn- gh-json [& args]
  (json/read-str (apply gh {} args) {:key-fn keyword}))

(defn- run-url [run-id]
  (format "https://github.com/%s/actions/runs/%s" repo run-id))

(defn- short-sha [sha]
  (subs sha 0 10))

(defn- open-pr
  "The open PR whose head is `branch`, with the base its stack targets, or nil."
  [branch]
  (-> (gh-json "api" "graphql"
               "-f" (str "query=query($branch: String!) {"
                         " repository(owner: \"metabase\", name: \"metabase\") {"
                         " pullRequests(headRefName: $branch, states: OPEN, first: 1) {"
                         " nodes { number headRefOid baseRefName stack { baseRefName } } } } }")
               "-f" (str "branch=" branch))
      (get-in [:data :repository :pullRequests :nodes 0])))

(defn stack-base
  "The branch `pr`'s changes should be compared against: the stack's base when `pr` is in one."
  [pr]
  (or (get-in pr [:stack :baseRefName]) (:baseRefName pr)))

(defn- runs [branch sha event]
  (gh-json "run" "list" "-R" repo "--workflow" workflow "--branch" branch "--commit" sha
           "--event" event "--json" "databaseId,conclusion" "--limit" "20"))

(defn parse-verdict
  "The verdict the decide job printed in `log`, or nil."
  [log]
  (some->> log (re-find #"(?m)verdict=([a-z-]+)\s*$") second))

(defn- verdict
  "The verdict of run `run-id`, or nil while it is still deciding."
  [run-id]
  (let [job (->> (:jobs (gh-json "run" "view" (str run-id) "-R" repo "--json" "jobs"))
                 (filter #(= decide-job (:name %)))
                 first)]
    (when (= "completed" (:status job))
      (when (not= "success" (:conclusion job))
        (fail! 3 (format "%s ended %s: %s" decide-job (:conclusion job) (run-url run-id))))
      (or (parse-verdict (gh {} "api" (format "repos/%s/actions/jobs/%s/logs" repo (:databaseId job))))
          (fail! 3 (str "No verdict in the decide job's log: " (run-url run-id)))))))

(defn- decided-pr-run
  "The latest PR run for `sha` with its `:verdict`, waiting about a minute for a fresh push to get one."
  [branch sha]
  (loop [waits [10 20 30]]
    (let [run (first (runs branch sha "pull_request"))
          v   (some-> run :databaseId verdict)]
      (cond
        v              (assoc run :verdict v)
        (empty? waits) nil
        :else
        (do (info (format "Waiting %ss for the PR run to decide." (first waits)))
            (Thread/sleep (long (* 1000 (first waits))))
            (recur (rest waits)))))))

(defn next-step
  "What to do given the PR run (with its `:verdict`) and the runs started by hand for the same commit.
  Returns one of:

    {:step :not-skipped,     :run pr-run}
    {:step :already-started, :run started-run}
    {:step :start}"
  [pr-run started-runs]
  (if (not= "force-skip" (:verdict pr-run))
    {:step :not-skipped, :run pr-run}
    (if-let [run (first (remove #(= "cancelled" (:conclusion %)) started-runs))]
      {:step :already-started, :run run}
      {:step :start})))

(defn dispatch-args
  "Arguments to `gh` that start the workflow on `branch`, comparing against `base`."
  [branch base]
  (cond-> ["workflow" "run" workflow "-R" repo "--ref" branch]
    ;; Master is the workflow's default. Leaving it out keeps branches made before the `base` input runnable.
    (not= "master" base) (into ["-f" (str "base=" base)])))

(defn- start-run!
  "Start the workflow and return the new run's URL, or the branch's run list when `gh` prints none."
  [branch base]
  (let [hint (when (not= "master" base)
               (str "Comparing against " base " needs the `base` input in " workflow
                    ", so the branch may need a rebase."))
        out  (apply gh {:hint hint} (dispatch-args branch base))]
    (or (re-find #"https://github\.com/\S+/actions/runs/\d+" out)
        (format "https://github.com/%s/actions/workflows/%s?query=branch%%3A%s" repo workflow branch))))

(defn ci-run-skipped!
  "Print a \"Run tests\" run URL for the current branch.
  Starts a run only when the PR run was force-skipped."
  []
  (let [branch (u/sh "git" "branch" "--show-current")
        _      (when (str/blank? branch) (fail! 3 "Not on a branch."))
        pr     (or (open-pr branch) (fail! 3 (str "No open PR for " branch)))
        sha    (:headRefOid pr)
        local  (u/sh "git" "rev-parse" "HEAD")
        _      (when (not= sha local)
                 (info (format "Local HEAD %s differs from the PR head %s; the run uses the PR head."
                               (short-sha local) (short-sha sha))))
        pr-run (or (decided-pr-run branch sha)
                   (fail! 1 (format "The PR run for %s has not decided yet." (short-sha sha))))
        {:keys [step run]} (next-step pr-run (runs branch sha "workflow_dispatch"))]
    (case step
      :not-skipped
      (do (info (format "Not skipped (verdict %s); here is the PR run." (:verdict run)))
          (println (run-url (:databaseId run))))

      :already-started
      (do (info "A run was already started for this commit.")
          (println (run-url (:databaseId run))))

      :start
      (let [base (stack-base pr)]
        (info (format "PR #%s was force-skipped; starting a run on %s against %s." (:number pr) branch base))
        (println (start-run! branch base))))))
