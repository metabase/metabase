(ns kondo
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [shell]))

(set! *warn-on-reflection* true)

(defn- copy-configs!
  "Copy over Kondo configs from libraries we use."
  []
  (let [[classpath] (shell/sh {:quiet? true} "clojure" "-A:dev" "-Spath")]
    (println "Copying Kondo configs from dependencies...")
    (shell/sh "clojure" "-M:kondo"
              "--copy-configs"
              "--dependencies"
              "--lint" classpath
              "--skip-lint"
              "--parallel")))

(defn- current-deps-edn-hash []
  (first (shell/sh {:quiet? true} "md5sum" "deps.edn")))

(def ^:private saved-deps-edn-hash-filename
  "File to store the MD5 checksum for `deps.edn`."
  (str shell/project-root-directory "/.clj-kondo/.deps.edn.md5sum"))

(defn- saved-deps-edn-hash
  []
  (str/trim (slurp saved-deps-edn-hash-filename)))

(defn- copy-configs-if-needed!
  "Copy Kondo configs for dependencies only if `deps.edn` has changed since last time we did it."
  []
  (let [current-hash (current-deps-edn-hash)]
    (when-not (= current-hash (saved-deps-edn-hash))
      (copy-configs!)
      (spit saved-deps-edn-hash-filename current-hash))))

(defn- kondo*
  [args]
  (copy-configs-if-needed!)
  (let [command           (if (empty? args)
                            ["-M:kondo:kondo/all"]
                            (list* "-M:kondo" args))
        {exit-code :exit} (apply shell/sh* "clojure" command)]
    (System/exit exit-code)))

(defn kondo
  "Run Kondo against our project. With no args, runs Kondo against everything we normally lint. Otherwise args are
  passed directly to Kondo e.g.

    ./bin/mage.sh kondo # run Kondo against everything

    ./bin/mage.sh kondo --lint src/metabase/my_file.clj # run against a specific file"
  [_m]
  (let [[_cmd & args] *command-line-args*]
    (kondo* args)))

(defn- updated-files
  "Sequence of filenames that have changes in Git relative to `diff-target`."
  [diff-target]
  (->> (shell/sh {:quiet? true}
                 "git" "diff" "--name-only" diff-target
                 "--" "*.clj" "*.cljc" "*.cljs" ":!/.clj-kondo" ":!/dev")
       ;; filter out any files that have been deleted/moved
       (filter (fn [filename]
                 (.exists (io/file (str shell/project-root-directory "/" filename)))))))

(defn- kondo-updated* [diff-target]
  (let [diff-target   (or diff-target "HEAD")
        updated-files (updated-files diff-target)]
    (when (empty? updated-files)
      (println "No updated Clojure source files.")
      (System/exit 0))
    (printf "Linting Clojure source files that have changes compared to %s...\n" diff-target)
    (let [{exit-code :exit} (apply shell/sh* "clojure" "-M:kondo" "--lint" updated-files)]
      (System/exit exit-code))))

(defn kondo-updated
  "Run Kondo against files that have been changed relative to a Git ref (default `HEAD`).

    # run Kondo on files with changes relative to HEAD
    ./bin/mage.sh kondo-updated

    # run Kondo on files with changes relative to master
    ./bin/mage.sh kondo-updated master"
  [_m]
  (let [[_cmd diff-target] *command-line-args*]
    (kondo-updated* diff-target)))
