(ns metabase-enterprise.git-source-of-truth.sources
  (:require
   [clojure.java.io :as io]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [metabase-enterprise.git-source-of-truth.settings :as settings]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.nio.file Files)
   (java.nio.file.attribute FileAttribute)))

(defprotocol ISource
  (load-source! [this dir]
    "Loads the source, taking a directory and returning an absolute path to the source directory that can be loaded
    with serdes. The returned path may be different from the original because sources may use subdirectories.

    TODO: working with directories (taking a directory and modifying it and returning a path) isn't really the best
    API but it'll do for now."))

(defn- execute-git-command
  "Execute a git command in the specified directory. Returns {:exit-code :stdout :stderr}."
  [directory & args]
  (let [result (apply shell/sh "git" (concat args [:dir directory]))]
    (log/debugf "Git command: git %s (exit: %d)" (str/join " " args) (:exit result))
    (when-not (zero? (:exit result))
      (log/errorf "Git command failed: %s" (:err result)))
    result))

(defn clone-repository!
  "Clone git repository to a temporary directory. Returns the path to the cloned repository."
  [url branch dir _key]
  (let [result (execute-git-command dir "clone" "--single-branch" "--branch" branch url ".")]
    (if (zero? (:exit result))
      (log/infof "Successfully cloned repository to %s" dir)
      (throw (ex-info (format "Failed to clone git repository: %s" (:err result))
                      {:url url
                       :branch branch
                       :exit-code (:exit result)
                       :dir dir
                       :stderr (:err result)})))))

(defn get-serdes-path
  "Get the full path to the serdes files within the repository."
  [repo-dir path]
  (let [full-path (if (= path ".")
                    repo-dir
                    (str repo-dir File/separator path))]

    (when-not (.exists (io/file full-path))
      (throw (ex-info (format "Serdes path does not exist: %s" full-path)
                      {:repo-dir repo-dir
                       :config-path path
                       :full-path full-path})))

    full-path))

(defrecord GitSource [url branch path key]
  ISource
  (load-source! [_this dir]
    (clone-repository! url branch dir key)
    (get-serdes-path dir path)))

(defn get-source
  "Returns the source that we should actually use. A source implements the `ISource` protocol."
  []
  (when (settings/git-sync-url)
    (->GitSource (settings/git-sync-url)
                 (settings/git-sync-import-branch)
                 (settings/git-sync-path)
                 (settings/git-sync-key))))
