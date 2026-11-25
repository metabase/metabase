(require '[cljfmt.config :as config]
         '[cljfmt.report :as report]
         '[cljfmt.tool :as tool]
         '[clojure.java.io :as io]
         '[clojure.java.shell :as shell]
         '[clojure.string :as str])

(set! *warn-on-reflection* true)

(defn- git [& args]
  (let [{:keys [exit out]} (apply shell/sh "git" args)]
    (when (zero? exit) out)))

(defn- diff-paths [base]
  (when-let [sha (some-> (git "rev-parse" "--verify" "--end-of-options" (str base "^{commit}")) str/trim)]
    (when (git "merge-base" "--is-ancestor" sha "HEAD")
      (some-> (git "diff" "--name-only" "--no-renames" "-z" sha "HEAD" "--")
              (str/split #"\x00")))))

(defn- direct-checkout? []
  ;; A tracked symlink can bring files into scope through a path git diff won't report.
  (when-let [index (git "ls-files" "--stage" "-z")]
    (not (re-find #"(?:^|\x00)120000 " index))))

(defn- formatter-input? [path]
  (or (contains? #{".cljfmt.edn" "cljfmt.edn" ".cljfmt.clj" "cljfmt.clj"
                   "bb.edn" ".gitattributes" ".github/workflows/backend.yml"} path)
      (str/ends-with? path "/.gitattributes")
      (str/starts-with? path "bin/cljfmt-ci/")))

(defn- in-scope? [{:keys [paths file-pattern]} path]
  (let [file (io/file path)
        p    (.normalize (.toPath (.getAbsoluteFile file)))]
    (and (.isFile file)
         (some (fn [root]
                 (let [dir (io/file root)
                       r   (.normalize (.toPath (.getAbsoluteFile dir)))]
                   (if (.isDirectory dir)
                     (and (.startsWith p r)
                          (re-find file-pattern (str (.relativize r p))))
                     (= r p))))
               paths))))

(try
  (let [[mode stack-base] *command-line-args*
        base (when (= "--pr" mode)
               (or (not-empty stack-base)
                   (when (git "rev-parse" "--verify" "--quiet" "HEAD^2") "HEAD^1")))
        changed (when base (diff-paths base))]
    (if (and changed (not-any? formatter-input? changed) (direct-checkout?))
      (let [opts (config/load-config)
            paths (filterv #(and (seq %) (in-scope? opts %)) changed)]
        (if (seq paths)
          (do
            (report/warn "Checking" (count paths) "changed files with cljfmt")
            (tool/check-no-config (assoc opts :paths paths)))
          (report/warn "No changed files in cljfmt scope")))
      (do
        (report/warn "Checking all files with cljfmt")
        (tool/check {}))))
  (finally
    (shutdown-agents)))
