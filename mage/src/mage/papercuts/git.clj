(ns mage.papercuts.git
  "Works out which branch and commit a papercut was hit on, from the transcript and the local git history.
  Transcripts don't record the commit at each message, so it is reconstructed, and `:commit-source` says how."
  (:require
   [babashka.fs :as fs]
   [babashka.process :as p]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn- git [dir & args]
  ;; `reflog-commit` reads an English warning, so keep git from translating it.
  (let [{:keys [exit out err]} (apply p/shell {:dir       dir
                                               :out       :string
                                               :err       :string
                                               :continue  true
                                               :extra-env {"LC_ALL" "C"}}
                                      "git" args)]
    {:ok (zero? exit) :out (str/trim out) :err err}))

(defn- sha [s]
  (when (re-matches #"[0-9a-f]{40}" (str s)) s))

(defn public-url
  "`url` without the user info and query an HTTPS remote can carry credentials in. Other forms pass through."
  [url]
  (if-let [[_ scheme location] (re-matches #"(?i)([a-z][a-z0-9+.-]*://)(?:[^/@?#]*@)?([^?#]*).*" url)]
    (str scheme location)
    url))

(defn repo-dir
  "A directory to run git in for a session's `cwd`. Worktrees are named `<repo>.<branch>` next to the main checkout
  and are often deleted later; their branch reflogs live in the shared repository, so fall back to the checkout
  the name points at."
  [cwd]
  (when cwd
    (let [candidates [cwd (str/replace cwd #"^(.*/[^/.]+)\.[^/]+$" "$1")]]
      (some #(when (and (fs/directory? %) (:ok (git % "rev-parse" "--git-dir"))) %) (distinct candidates)))))

(defn- reflog-commit
  "The commit `ref` pointed at, at `ts`, from the reflog. Nil when the reflog doesn't reach back that far: git then
  warns and answers with its oldest entry, which would be a confident wrong answer."
  [dir ref ts]
  (let [{:keys [ok out err]} (git dir "rev-parse" "--verify" (str ref "@{" ts "}"))]
    (when (and ok (not (str/includes? err "only goes back to")))
      (sha out))))

(defn- commit-before
  "The last commit on `ref` made before `ts`. After a rebase this is the rewritten history, so it is approximate."
  [dir ref ts]
  (let [{:keys [ok out]} (git dir "rev-list" "-1" (str "--before=" ts) ref "--")]
    (when ok (sha out))))

(defn- remote-url
  "The URL of the checkout's `origin` remote, else `upstream`, else its first remote. Not every checkout calls its
  GitHub remote `origin`."
  [dir]
  (let [{:keys [ok out]} (git dir "remote")
        remotes          (when ok (remove str/blank? (str/split-lines out)))]
    (when-let [remote (or (some #{"origin"} remotes) (some #{"upstream"} remotes) (first remotes))]
      (let [{:keys [ok out]} (git dir "remote" "get-url" remote)]
        (when ok (not-empty out))))))

(defn context
  "`{:branch :commit_sha :commit_source :repository_url}` for a papercut observed at `ts` in `cwd` on `branch`,
  leaving out what can't be worked out. `session-git` is what the transcript recorded at session start, if any."
  [{:keys [cwd branch ts session-git]}]
  (let [branch (or (not-empty branch) (:branch session-git))
        ref    (if (or (nil? branch) (= "HEAD" branch)) "HEAD" branch)
        dir    (repo-dir cwd)
        [commit source]
        (or (when (and dir ts)
              (some-> (reflog-commit dir ref ts) (vector "reflog")))
            (some-> (sha (:sha session-git)) (vector "session-start"))
            (when (and dir ts)
              ;; The local branch is often deleted once merged; its remote-tracking ref can outlive it.
              (some-> (or (commit-before dir ref ts)
                          (when (not= "HEAD" ref) (commit-before dir (str "origin/" ref) ts)))
                      (vector "before-timestamp"))))
        url    (some-> (or (:repository-url session-git)
                           (some-> dir remote-url))
                       public-url)]
    (cond-> {}
      branch (assoc :branch branch)
      commit (assoc :commit_sha commit :commit_source source)
      url    (assoc :repository_url url))))
