(ns dev.reload
  (:require
   [clojure.java.shell :as shell]
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.util :as u])
  (:import
   (java.io File)
   (java.nio.file Files LinkOption Paths)))

(set! *warn-on-reflection* true)

#_:clj-kondo/ignore
(defonce *reload-timestamps (atom {}))

(defn system-classpath
  "Returns a sequence of File paths from the 'java.class.path' system
  property."
  []
  (into [] (comp (filter #(not (str/ends-with? % ".jar")))
                 (map #(File. ^String %))
                 (filter #(.isDirectory ^File %))
                 (map #(.getCanonicalPath ^File %)))
        (.split (System/getProperty "java.class.path")
                (System/getProperty "path.separator"))))

(defn find-classpath-root
  "Finds the classpath directory that contains the given file path.
   Returns the portion of the path to strip, or nil if not found."
  [classpath file-path]
  (let [canonical-file (try
                         (.getCanonicalPath (File. ^String file-path))
                         (catch Exception _ file-path))]
    (->> classpath
         (filter #(str/starts-with? canonical-file %))
         (sort-by count >)              ; Longest match first
         first)))

(defonce ^{:private true
           :doc "[[get-changed-files]] will NOT report a file when it matches what's in git. But we want to know
   about files that were changed in the past, even if they are now reverted back to the git version.
   This atom keeps track of such files, so that we can still reload them when needed."}
  historic-files-changed
  (atom #{}))

(defn- get-changed-files
  "Returns a set of changed/added/untracked files ever seen from git status. Once a file is seen as changed,
   it will be included in the set even if it is later reverted back to the git version.
   Key point: It still needs to be reloaded even if it gets reverted, because the in-memory version
   may still be different from the on-disk version."
  []
  (let [{:keys [exit out]} (shell/sh "git" "status" "--porcelain")
        changes (if (and (zero? exit)
                         (not (str/blank? out)))
                  (->> (str/split-lines out)
                       (map #(str/trim (subs % 3))) ; Remove status prefix (e.g., "M ", "A ", "??")
                       (filter #(or (str/ends-with? % ".clj")
                                    (str/ends-with? % ".cljc")))
                       set)
                  #{})]
    ;; Add newly changed files to historic set
    (swap! historic-files-changed set/union changes)
    ;; Include historic files that were changed in the past
    (set/union changes @historic-files-changed)))

(defn file-last-modified
  "Returns the last modified time of a file in milliseconds."
  [file-path]
  (try
    (-> (Paths/get file-path (into-array String []))
        (Files/getLastModifiedTime (into-array LinkOption []))
        (.toMillis))
    (catch Exception _ nil)))

(defn relpath->ns
  "foo/bar_baz.clj -> foo.bar-baz"
  [relpath]
  (-> relpath
      (str/replace #"\.clj$" "")
      (str/replace #"/" ".")
      (str/replace #"_" "-")
      symbol))

(defn file-path->namespace
  "Converts a file path to a namespace symbol using classpath information.
   Example: enterprise/backend/src/foo/bar/baz.clj -> foo.bar.baz"
  [file-path classpath]
  (when (and file-path (re-find #".cljc?$" file-path))
    (when-let [root (find-classpath-root classpath file-path)]
      (let [canonical-file (try
                             (.getCanonicalPath (File. ^String file-path))
                             (catch Exception _ file-path))
            relative-path (subs canonical-file (inc (count root)))]
        (relpath->ns relative-path)))))

(defn loaded-namespaces
  "Returns a set of all currently loaded namespace symbols."
  []
  (set (map ns-name (all-ns))))

(defn needs-reload?
  "Checks if a file needs reloading based on its last modified time."
  [file-path ns-sym]
  (let [last-reload   (get @*reload-timestamps ns-sym)
        last-modified (file-last-modified file-path)]
    (or (nil? last-reload)
        (nil? last-modified)
        (> last-modified last-reload))))

(defn changed-namespaces []
  (let [changed-files  (get-changed-files)
        loaded-ns      (loaded-namespaces)
        classpath-dirs (system-classpath)
        candidates     (->> changed-files
                            (map (fn [f] {:file f :ns (file-path->namespace f classpath-dirs)}))
                            (filter :ns)
                            (filter #(loaded-ns (:ns %))))
        to-reload      (filter #(needs-reload? (:file %) (:ns %)) candidates)
        skipped        (remove #(needs-reload? (:file %) (:ns %)) candidates)]
    {:to-reload to-reload
     :skipped   skipped}))

(defn reload-namespaces!
  [to-reload]
  (->> (for [{:keys [_file ns]} to-reload]
         (try
           (require ns :reload)
           (swap! *reload-timestamps assoc ns (System/currentTimeMillis))
           [:reloaded ns]
           (catch Exception e
             [:failed {:ns ns :error (.getMessage e)}])))
       (u/group-by first second)))

(defn reload!
  "Reloads all changed files from git that are already loaded as namespaces
   and have been modified since last reload.
   Returns a map with :reloaded, :skipped, and :failed keys."
  []
  (let [{:keys [to-reload
                skipped]} (changed-namespaces)
        _                 (println (format "Reloading %s namespaces (%s skipped):" (count to-reload) (count skipped)))
        {:keys [reloaded
                failed]
         :as   res}       (reload-namespaces! to-reload)]
    (doseq [ns reloaded]
      (println "  ✓" ns))
    (doseq [{:keys [ns error]} failed]
      (println "  ✗" ns ":" error))
    (assoc res :skipped skipped)))

(defn clear-reload-history!
  "Clears the reload timestamp history, forcing all files to reload next time."
  []
  (reset! *reload-timestamps {})
  (println "Reload history cleared."))

(defn show-classpath
  "Shows all classpath directories for debugging."
  []
  (println "\n=== Classpath Directories ===")
  (run! #(println (.getCanonicalPath ^File %)) (sort (system-classpath))))

(comment
  (show-classpath) ; to see what's in your classpath
  (clear-reload-history!) ; if you want to force reload everything
  (changed-namespaces)
  (reload!))
