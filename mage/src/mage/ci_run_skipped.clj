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
  On failure, returns nil when the error matches `retry-on`.
  Otherwise exits with `gh`'s error message, adding `hint`'s `:text` when the error matches its `:pattern`."
  [{:keys [retry-on hint]} & args]
  (let [{:keys [exit out err]} @(apply p/process {:out :string :err :string :in nil} "gh" args)
        retry?                 (some-> retry-on (re-find err))]
    (cond
      (zero? exit) (str/trim out)
      retry?       nil
      :else        (let [hint? (some-> (:pattern hint) (re-find err))]
                     (fail! 3 (cond-> (str "gh " (first args) " failed: " (str/trim err))
                                hint? (str "\n" (:text hint))))))))

(defn- gh-json [& args]
  (json/read-str (apply gh {} args) {:key-fn keyword}))

(defn- run-url [run-id]
  (format "https://github.com/%s/actions/runs/%s" repo run-id))

(defn- short-sha [sha]
  (subs sha 0 10))

(defn own-pr
  "The first of `prs` whose head branch is in `repo`."
  [prs]
  ;; A fork can have an open PR from a branch with the same name.
  (first (filter #(= repo (get-in % [:headRepository :nameWithOwner])) prs)))

(defn- open-pr
  "The open PR from `branch` in `repo`, with its labels and the base its stack targets, or nil."
  [branch]
  (let [[owner name] (str/split repo #"/")]
    (->> (gh-json "api" "graphql"
                  "-f" (str "query=query($owner: String!, $name: String!, $branch: String!) {"
                            " repository(owner: $owner, name: $name) {"
                            " pullRequests(headRefName: $branch, states: OPEN, first: 10) {"
                            " nodes { number headRefOid baseRefName headRepository { nameWithOwner }"
                            " stack { baseRefName } labels(first: 100) { nodes { name } } } } } }")
                  "-f" (str "owner=" owner) "-f" (str "name=" name) "-f" (str "branch=" branch))
         :data :repository :pullRequests :nodes
         own-pr)))

(defn stack-base
  "The branch `pr`'s changes should be compared against: the stack's base when `pr` is in one."
  [pr]
  (or (get-in pr [:stack :baseRefName]) (:baseRefName pr)))

(defn run-labels
  "The `ci:run-*` labels on `pr`, which a run started by hand cannot see."
  [pr]
  (->> (get-in pr [:labels :nodes]) (map :name) (filter #(str/starts-with? % "ci:run-")) sort))

(defn- runs [branch sha event]
  (gh-json "run" "list" "-R" repo "--workflow" workflow "--branch" branch "--commit" sha
           "--event" event "--json" "databaseId,status" "--limit" "20"))

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
      ;; The logs can 404 for a few seconds after the job completes, so that means "ask again".
      (when-let [log (gh {:retry-on #"HTTP 404"}
                         "api" (format "repos/%s/actions/jobs/%s/logs" repo (:databaseId job)))]
        (or (parse-verdict log)
            (fail! 3 (str "No verdict in the decide job's log: " (run-url run-id))))))))

(defn poll
  "Call `f` until it returns non-nil, sleeping for each of `pauses` seconds in turn.
  Returns nil if it never does."
  [pauses f]
  (loop [pauses pauses]
    (or (f)
        (when-let [[wait & more] (seq pauses)]
          (info (format "Waiting %ss for a verdict." wait))
          (Thread/sleep (long (* 1000 wait)))
          (recur more)))))

(defn- decided-pr-run
  "The latest PR run for `sha` with its `:verdict`, waiting about a minute for a fresh push to get one."
  [branch sha]
  (poll [10 20 30]
        #(when-let [run (first (runs branch sha "pull_request"))]
           (some->> (verdict (:databaseId run)) (assoc run :verdict)))))

(defn next-step
  "What to do given the PR run (with its `:verdict`) and the runs started by hand for the same commit.
  Only a run that has not finished is reused.
  Returns one of:

    {:step :not-skipped,     :run pr-run}
    {:step :already-started, :run started-run}
    {:step :start}"
  [pr-run started-runs]
  (if (not= "force-skip" (:verdict pr-run))
    {:step :not-skipped, :run pr-run}
    (if-let [run (first (remove #(= "completed" (:status %)) started-runs))]
      {:step :already-started, :run run}
      {:step :start})))

(defn dispatch-args
  "Arguments to `gh` that start the workflow on `branch`, comparing against `base`."
  [branch base]
  ;; Always passing `base` makes a branch from before the input fail to start instead of comparing against
  ;; the wrong branch.
  ["workflow" "run" workflow "-R" repo "--ref" branch "-f" (str "base=" base)])

(defn- start-run!
  "Start the workflow and return the new run's URL, or the workflow's run list when `gh` prints none."
  [branch base]
  (let [hint {:pattern #"(?i)unexpected inputs"
              :text    (str "The branch's " workflow " predates the `base` input; rebase it.")}
        out  (apply gh {:hint hint} (dispatch-args branch base))]
    (or (re-find #"https://github\.com/\S+/actions/runs/\d+" out)
        (do (info "Started a run, but gh printed no URL for it; it is at the top of the workflow's runs.")
            (format "https://github.com/%s/actions/workflows/%s" repo workflow)))))

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
        ;; Lazy, so the lookup only happens when the PR run was skipped.
        {:keys [step run]} (next-step pr-run (lazy-seq (runs branch sha "workflow_dispatch")))]
    (case step
      :not-skipped
      (do (info (format "Not skipped (verdict %s); here is the PR run." (:verdict run)))
          (println (run-url (:databaseId run))))

      :already-started
      (do (info "A run for this commit is already going.")
          (println (run-url (:databaseId run))))

      :start
      (let [base (stack-base pr)]
        (info (format "PR #%s was force-skipped; starting a run on %s against %s." (:number pr) branch base))
        (when-let [labels (seq (run-labels pr))]
          (info (str "These labels do not carry over to a run started by hand: " (str/join ", " labels))))
        (println (start-run! branch base))))))
