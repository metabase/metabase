(ns mage.cljts.git
  "Finding the before/after versions of files: a GitHub PR, local changes against a base branch, or a single file."
  (:require
   [babashka.fs :as fs]
   [babashka.process :as process]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(def ^:dynamic *repo-dir*
  "The repository to run git in (nil = the current directory). Rebound by tests."
  nil)

(defn- sh
  "Run a command, returning trimmed stdout. Throws with stderr on failure."
  [& args]
  (let [{:keys [exit out err]} (apply process/shell {:out :string :err :string :continue true :dir *repo-dir*} args)]
    (when-not (zero? exit)
      (throw (ex-info (str (str/join " " args) " failed: " (str/trim (str err))) {:exit exit})))
    (str/trim out)))

(defn- sh-ok
  "Like [[sh]] but returns nil instead of throwing."
  [& args]
  (try (apply sh args) (catch Exception _ nil)))

(defn show
  "The contents of `path` at git revision `rev`, or nil if it didn't exist there."
  [rev path]
  (let [{:keys [exit out]} (process/shell {:out :string :err :string :continue true :dir *repo-dir*}
                                          "git" "show" (str rev ":" path))]
    (when (zero? exit) out)))

(def ^:private status-names {"A" :added "M" :modified "D" :deleted "R" :renamed "C" :copied "T" :modified})

(defn- name-status
  "Parse `git diff --name-status` output into [{:status :path :old-path}]."
  [out]
  (for [line (str/split-lines out)
        :when (not (str/blank? line))
        :let [[st & paths] (str/split line #"\t")
              st (subs st 0 1)]]
    {:status   (status-names st :modified)
     :path     (last paths)
     :old-path (first paths)}))

(defn typescript-file?
  "Whether `path` is TypeScript or JavaScript source."
  [path]
  (boolean (re-find #"\.(ts|tsx|js|jsx|mjs|cjs)$" path)))

(defn clojure-file?
  "Whether `path` looks like a Clojure source file."
  [path]
  (boolean (re-find #"\.(clj|cljc|cljs|edn|bb)$" path)))

;;; ------------------------------------------------ Local changes -----------------------------------------------

(defn default-base
  "`origin/master` if it exists, else `master`."
  []
  (if (sh-ok "git" "rev-parse" "--verify" "--quiet" "origin/master") "origin/master" "master"))

(defn local-changes
  "Files changed on the current branch (including uncommitted and untracked files) since its merge-base with `base`.
  Returns {:title str, :files [{:path :status :old :new}]}."
  [base]
  (let [base    (or base (default-base))
        mb      (sh "git" "merge-base" "HEAD" base)
        tracked (name-status (sh "git" "diff" "--name-status" "-M" mb))
        untracked (for [p (str/split-lines (sh "git" "ls-files" "--others" "--exclude-standard"))
                        :when (not (str/blank? p))]
                    {:status :added :path p :old-path p})]
    {:title (str "Local changes on " (sh "git" "rev-parse" "--abbrev-ref" "HEAD") " vs " base
                 " (merge-base " (subs mb 0 10) ")")
     :files (vec (pmap (fn [{:keys [status path old-path]}]
                         (let [clj? (clojure-file? path)]
                           {:path   path
                            :status status
                            :old    (when (and clj? (not= status :added)) (show mb old-path))
                            :new    (when (and clj? (not= status :deleted))
                                      (let [f (fs/file path)] (when (fs/exists? f) (slurp f))))}))
                       (concat tracked untracked)))}))

;;; ------------------------------------------------ Pull requests ----------------------------------------------

(defn parse-pr
  "A PR number from `s`: `82600`, `#82600` or a GitHub PR URL."
  [s]
  (when s
    (some->> (or (re-find #"/pull/(\d+)" s) (re-find #"^#?(\d+)$" (str/trim s)))
             second
             parse-long)))

(defn commit-exists?
  "Is `rev` a commit in the local repository?"
  [rev]
  (some? (sh-ok "git" "cat-file" "-e" (str rev "^{commit}"))))

(defn ensure-commits!
  "Make sure every rev in `revs` exists locally. If one doesn't, fetch `refspecs` from origin (logging that we're
  doing so); if that fails too, throw with the command to run by hand."
  [revs refspecs]
  (when-not (every? commit-exists? revs)
    (let [cmd (str "git fetch origin " (str/join " " refspecs))]
      (println (str "Not in the local repository yet; running: " cmd))
      (try
        (apply sh "git" "fetch" "--quiet" "origin" refspecs)
        (catch Exception e
          (throw (ex-info (str "Couldn't fetch the PR's commits (" (ex-message e) ").\n"
                               "Run this yourself, then reload:\n\n  " cmd)
                          {} e))))
      (when-not (every? commit-exists? revs)
        (throw (ex-info (str "The PR's commits still aren't available locally after:\n\n  " cmd) {}))))))

(defn- file-versions
  "Old/new contents for changed files, read from git in parallel (each read is a `git show` process)."
  [old-rev new-rev changes]
  (vec (pmap (fn [{:keys [status path old-path]}]
               (let [clj? (clojure-file? path)]
                 {:path   path
                  :status status
                  ;; only Clojure files are shown, so don't read anything else
                  :old    (when (and clj? (not= status :added)) (show old-rev old-path))
                  :new    (when (and clj? (not= status :deleted)) (show new-rev path))}))
             changes)))

(defn pr-changes
  "Files changed in GitHub PR `n`, compared against the merge-base with its base branch. The PR's commits are read
  from the local repository, and only fetched from origin when they aren't there yet."
  [n]
  (let [info   (sh "gh" "pr" "view" (str n) "--json" "baseRefName,headRefOid,title,url" "--template"
                   "{{.baseRefName}}\t{{.headRefOid}}\t{{.url}}\t{{.title}}")
        [base head url title] (str/split info #"\t" 4)]
    (ensure-commits! [head (str "origin/" base)] [base (str "refs/pull/" n "/head")])
    (let [mb (sh "git" "merge-base" (str "origin/" base) head)]
      {:title (str "#" n " " title)
       :url   url
       :files (file-versions mb head (name-status (sh "git" "diff" "--name-status" "-M" mb head)))})))

;;; ------------------------------------------------ Branches -------------------------------------------------

(defn resolve-branch
  "The ref to use for branch name `s`: `s` itself if it names a commit, else `origin/s`; nil if neither exists."
  [s]
  (when-not (str/blank? s)
    (let [s (str/trim s)]
      (first (filter commit-exists? [s (str "origin/" s)])))))

(defn- parent-candidates
  "Branches that `branch` might have been created from: the default base, release branches and local branches."
  [branch]
  (let [refs (fn [& patterns]
               (remove str/blank? (str/split-lines (apply sh "git" "for-each-ref" "--format=%(refname:short)" patterns))))
        default (default-base)]
    (->> (concat [default]
                 (refs "refs/remotes/origin/release-x.*")
                 (refs "refs/heads"))
         (remove (set [branch (str/replace branch #"^origin/" "")]))
         distinct)))

(defn branch-parent
  "Guess the branch `branch` was created from: the candidate it forked from most recently, i.e. whose merge-base
  with `branch` has the fewest commits between it and `branch`'s tip. Candidates that already contain the whole
  branch (distance 0) are skipped, and ties go to the earlier candidate (the default base first).
  Returns {:ref candidate :merge-base sha}."
  [branch]
  (let [scored (pmap (fn [cand]
                       (when-let [mb (sh-ok "git" "merge-base" branch cand)]
                         (when-not (str/blank? mb)
                           {:ref cand :merge-base mb
                            :distance (parse-long (sh "git" "rev-list" "--count" (str mb ".." branch)))})))
                     (parent-candidates branch))]
    (->> scored
         (filter #(and % (pos? (:distance %))))
         (reduce (fn [best c] (if (or (nil? best) (< (:distance c) (:distance best))) c best)) nil))))

(defn branch-changes
  "Files changed on `branch` since it split from `base` (or, if `base` is nil, from its guessed parent branch)."
  [branch-name base]
  (let [branch (or (resolve-branch branch-name)
                   (throw (ex-info (str "No PR or branch named \"" branch-name "\" in this repository.") {})))
        {:keys [ref merge-base]} (if base
                                   {:ref base :merge-base (sh "git" "merge-base" branch base)}
                                   (or (branch-parent branch)
                                       (throw (ex-info (str "Couldn't find a parent branch for " branch) {}))))]
    {:title (str branch " vs. " ref (when-not base " (its parent)") ", merge-base " (subs merge-base 0 10))
     :files (file-versions merge-base branch (name-status (sh "git" "diff" "--name-status" "-M" merge-base branch)))}))

;;; ------------------------------------------------ Browsing ---------------------------------------------------

(defn repo-file
  "The canonical path of `path` if it names an existing regular file inside the current repository, else nil. Guards
  the `/file` endpoint against reading arbitrary files (`/etc/passwd`, `../..`) or URLs."
  [path]
  (when (and (string? path) (not (str/blank? path)) (not (re-find #"^[a-zA-Z][a-zA-Z0-9+.-]*:" path)))
    (let [root (fs/canonicalize (fs/cwd))
          f    (fs/canonicalize (fs/path root path))]
      (when (and (fs/regular-file? f) (fs/starts-with? f root))
        (str (fs/relativize root f))))))

(defn tracked-clojure-files
  "All tracked Clojure source files."
  []
  (->> (str/split-lines (sh "git" "ls-files" "*.clj" "*.cljc"))
       (remove str/blank?)
       vec))
