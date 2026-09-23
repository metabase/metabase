(ns mage.readable.git
  "Finding the before/after versions of files: a GitHub PR, local changes against a base branch, or a single file."
  (:require
   [babashka.fs :as fs]
   [babashka.process :as process]
   [clojure.string :as str]))

(set! *warn-on-reflection* true)

(defn- sh
  "Run a command, returning trimmed stdout. Throws with stderr on failure."
  [& args]
  (let [{:keys [exit out err]} (apply process/shell {:out :string :err :string :continue true} args)]
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
  (let [{:keys [exit out]} (process/shell {:out :string :err :string :continue true} "git" "show" (str rev ":" path))]
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
     :files (vec (for [{:keys [status path old-path]} (concat tracked untracked)]
                   {:path   path
                    :status status
                    :old    (when-not (= status :added) (show mb old-path))
                    :new    (when-not (= status :deleted)
                              (let [f (fs/file path)] (when (fs/exists? f) (slurp f))))}))}))

;;; ------------------------------------------------ Pull requests ----------------------------------------------

(defn parse-pr
  "A PR number from `s`: `82600`, `#82600` or a GitHub PR URL."
  [s]
  (when s
    (some->> (or (re-find #"/pull/(\d+)" s) (re-find #"^#?(\d+)$" (str/trim s)))
             second
             parse-long)))

(defn pr-changes
  "Files changed in GitHub PR `n` (fetched from origin), compared against the merge-base with its base branch."
  [n]
  (let [info   (sh "gh" "pr" "view" (str n) "--json" "baseRefName,headRefOid,title,url" "--template"
                   "{{.baseRefName}}\t{{.headRefOid}}\t{{.url}}\t{{.title}}")
        [base head url title] (str/split info #"\t" 4)]
    (sh "git" "fetch" "--quiet" "origin" base (str "refs/pull/" n "/head"))
    (let [mb (sh "git" "merge-base" (str "origin/" base) head)]
      {:title (str "#" n " " title)
       :url   url
       :files (vec (for [{:keys [status path old-path]} (name-status (sh "git" "diff" "--name-status" "-M" mb head))]
                     {:path   path
                      :status status
                      :old    (when-not (= status :added) (show mb old-path))
                      :new    (when-not (= status :deleted) (show head path))}))})))

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
