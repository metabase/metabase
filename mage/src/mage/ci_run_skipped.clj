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
  "Run `gh` with `args` and return its trimmed stdout, or nil when it exits non-zero."
  [& args]
  (let [{:keys [exit out]} @(apply p/process {:out :string :err :string :in nil} "gh" args)]
    (when (zero? exit)
      (str/trim out))))

(defn- gh-json [& args]
  (some-> (apply gh args) (json/read-str {:key-fn keyword})))

(defn- run-url [run-id]
  (format "https://github.com/%s/actions/runs/%s" repo run-id))

(defn- open-pr
  "The open PR whose head is `branch`, with the base its stack targets."
  [branch]
  (-> (gh-json "api" "graphql"
               "-f" (str "query=query($branch: String!) { repository(owner: \"metabase\", name: \"metabase\") {"
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
      (or (parse-verdict (gh "api" (format "repos/%s/actions/jobs/%s/logs" repo (:databaseId job))))
          (fail! 3 (str "No verdict in the decide job's log: " (run-url run-id)))))))

(defn- decided-pr-run
  "The latest PR run for `sha` and its verdict, waiting about a minute for a fresh push to get one."
  [branch sha]
  (loop [waits [10 20 30]]
    (let [run (first (runs branch sha "pull_request"))
          v   (some-> run :databaseId verdict)]
      (cond
        v              [run v]
        (empty? waits) nil
        :else
        (do (info (format "Waiting %ss for the PR run to decide." (first waits)))
            (Thread/sleep (long (* 1000 (first waits))))
            (recur (rest waits)))))))

(defn dispatch-args
  "Arguments to `gh` that start the workflow on `branch`, comparing against `base`.
  Master is the workflow's default, so it is left out; branches without the `base` input can still be run."
  [branch base]
  (cond-> ["workflow" "run" workflow "-R" repo "--ref" branch]
    (not= "master" base) (into ["-f" (str "base=" base)])))

(defn- dispatch!
  "Start the workflow and return the new run's URL."
  [branch sha base]
  (let [out (or (apply gh (dispatch-args branch base))
                (fail! 3 (format "Could not start %s on %s. Comparing against %s needs the `base` input, so the branch may need a rebase."
                                 workflow branch base)))]
    (or (re-find #"https://github\.com/\S+/actions/runs/\d+" out)
        ;; Older `gh` prints no URL, so look the run up instead.
        (loop [attempt 1]
          (if-let [run (first (runs branch sha "workflow_dispatch"))]
            (run-url (:databaseId run))
            (when (< attempt 10)
              (Thread/sleep 2000)
              (recur (inc attempt)))))
        (fail! 3 "Started a run but could not find its URL."))))

(defn ci-run-skipped!
  "Print a \"Run tests\" run URL for the current branch, starting one only when the PR run was force-skipped."
  []
  (let [branch     (u/sh "git" "branch" "--show-current")
        _          (when (str/blank? branch) (fail! 3 "Not on a branch."))
        pr         (or (open-pr branch) (fail! 3 (str "No open PR for " branch)))
        sha        (:headRefOid pr)
        local      (u/sh "git" "rev-parse" "HEAD")
        _          (when (not= sha local)
                     (info (format "Local HEAD %s differs from the PR head %s; the run uses the PR head."
                                   (subs local 0 10) (subs sha 0 10))))
        [pr-run v] (or (decided-pr-run branch sha)
                       (fail! 1 (format "The PR run for %s has not decided yet." (subs sha 0 10))))]
    (if (not= "force-skip" v)
      (do (info (format "Not skipped (verdict %s); here is the PR run." v))
          (println (run-url (:databaseId pr-run))))
      (if-let [earlier (first (remove #(= "cancelled" (:conclusion %)) (runs branch sha "workflow_dispatch")))]
        (do (info "A dispatched run for this commit already exists.")
            (println (run-url (:databaseId earlier))))
        (let [base (stack-base pr)]
          (info (format "PR #%s was force-skipped; starting a run on %s against %s." (:number pr) branch base))
          (println (dispatch! branch sha base)))))))
