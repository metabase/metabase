(ns metabase-enterprise.git-source-of-truth.sources
  (:require
   [clojure.java.io :as io]
   [metabase-enterprise.git-source-of-truth.git :as git]
   [metabase-enterprise.git-source-of-truth.settings :as settings]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (org.eclipse.jgit.api Git)
   (org.eclipse.jgit.transport UsernamePasswordCredentialsProvider
                               RefSpec)))

(set! *warn-on-reflection* true)

(defprotocol ISource
  (load-source! [this dir]
    "Loads the source, taking a directory and returning an absolute path to the source directory that can be loaded
    with serdes.
    TODO: working with directories (taking a directory and modifying it and returning a path) isn't really the best
    API but it'll do for now."))

(defprotocol IDestination
  (push-branch! [this source-dir]
    "Pushes the contentents of `source-dir` to the branch specified."))

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

(defrecord GitSource [url source-branch token dest-branch]
  ISource
  (load-source! [_this dir]
    (git/clone-repository! url source-branch dir token)
    dir)

  IDestination
  (push-branch! [_this source-dir]
    (git/push-branch! {:source-dir source-dir
                       :url url
                       :source-branch source-branch
                       :dest-branch dest-branch
                       :token token})))

(defn get-source
  "Returns the source that we should actually use. A source implements the `ISource` protocol."
  []
  (when (settings/git-sync-url)
    (->GitSource (settings/git-sync-url)
                 (settings/git-sync-import-branch)
                 (settings/git-sync-token)
                 (settings/git-sync-export-branch))))
