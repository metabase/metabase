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
   (java.nio.file.attribute FileAttribute PosixFilePermissions)))

(defprotocol ISource
  (load-source! [this dir]
    "Loads the source, taking a directory and returning an absolute path to the source directory that can be loaded
    with serdes.
    TODO: working with directories (taking a directory and modifying it and returning a path) isn't really the best
    API but it'll do for now."))

(defprotocol IDestination
  (push-branch! [this source-dir]
    "Pushes the contentents of `source-dir` to the branch specified."))

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
  [url branch dir _token]
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

(defn- write-0600! [content suffix]
  (let [f (Files/createTempFile "git-demo-" (str "." suffix)
                                (make-array java.nio.file.attribute.FileAttribute 0))]
    (spit (.toFile f) content)
    (try (Files/setPosixFilePermissions f (PosixFilePermissions/fromString "rw-------"))
         (catch UnsupportedOperationException _))
    (str f)))

(defrecord GitSource [url source-branch token dest-branch]
  ISource
  (load-source! [_this dir]
    (clone-repository! url source-branch dir token)
    dir)

  IDestination
  (push-branch! [_this source-dir]
    (let [branch (str (random-uuid))
          askpass (write-0600! "#!/usr/bin/env sh\nprintf \"%s\" \"$GIT_TOKEN\"\n" "askpass.sh")]
      (.setExecutable (io/file askpass) true true)
      (execute-git-command source-dir "init")
      (execute-git-command source-dir "remote" "add" "origin" url)
      (execute-git-command source-dir "fetch" "origin")
      (execute-git-command source-dir "checkout" "-b" branch)
      (try (execute-git-command source-dir "reset" "--mixed" (str "origin/" source-branch))
           (catch Exception _ nil))
      (execute-git-command source-dir "add" "-A")
      (execute-git-command source-dir "commit" "-m" "Update content")
      (execute-git-command source-dir "-c" "credential.username=x-access-token"
                           "push" "-u" "origin" (str branch ":" dest-branch)
                           :env {"GIT_ASKPASS" askpass
                                 "GIT_TOKEN" token
                                 "GIT_TERMINAL_PROMPT" "0"}))))

(defn get-source
  "Returns the source that we should actually use. A source implements the `ISource` protocol."
  []
  (when (settings/git-sync-url)
    (->GitSource (settings/git-sync-url)
                 (settings/git-sync-import-branch)
                 (settings/git-sync-token)
                 (settings/git-sync-export-branch))))
