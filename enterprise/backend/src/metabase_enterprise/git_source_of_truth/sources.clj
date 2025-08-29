(ns metabase-enterprise.git-source-of-truth.sources
  (:require
   [clojure.java.io :as io]
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

(defn clone-repository!
  "Clone git repository to a temporary directory using jgit. Returns the path to the cloned repository."
  [url branch dir token]
  (try
    (log/info "Cloning repository" {:url url :branch branch :dir dir})
    (-> (Git/cloneRepository)
        (.setURI url)
        (.setBranch branch)
        (.setDirectory (io/file dir))
        (.setCloneAllBranches false)
        (.setCredentialsProvider (when token
                                   (UsernamePasswordCredentialsProvider. "x-access-token" token)))
        (.call)
        (.close))
    (log/info "Successfully cloned repository" {:dir dir})
    (catch Exception e
      (throw (ex-info (format "Failed to clone git repository: %s" (.getMessage e))
                      {:url url
                       :branch branch
                       :dir dir
                       :error (.getMessage e)})))))

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
    (clone-repository! url source-branch dir token)
    dir)

  IDestination
  (push-branch! [_this source-dir]
    (let [branch-name (str (random-uuid))
          repo-dir (io/file source-dir)]
      (try
        ;; Initialize or open existing repository
        (log/info "Initializing git repository" {:dir source-dir})
        (let [git-repo (if (.exists (io/file source-dir ".git"))
                         (Git/open repo-dir)
                         (-> (Git/init)
                             (.setDirectory repo-dir)
                             (.call)))
              repo (.getRepository git-repo)]
          (try
            ;; Add origin remote if it doesn't exist
            (log/info "Setting up remote origin" {:url url})
            (-> (.remoteAdd git-repo)
                (.setName "origin")
                (.setUri (org.eclipse.jgit.transport.URIish. url))
                (.call))

            ;; Fetch from origin
            (log/info "Fetching from origin")
            (-> (.fetch git-repo)
                (.setRemote "origin")
                (.setCredentialsProvider (when token
                                           (UsernamePasswordCredentialsProvider. "x-access-token" token)))
                (.call))

            ;; Create and checkout new branch
            (log/info "Creating new branch" {:branch branch-name})
            (-> (.checkout git-repo)
                (.setOrphan true)
                (.setName branch-name)
                (.call))

            (when-let [origin-ref (.findRef repo (str "origin/" source-branch))]
              (-> (.reset git-repo)
                  (.setMode org.eclipse.jgit.api.ResetCommand$ResetType/MIXED)
                  (.setRef (str "origin/" source-branch))
                  (.call)))

            ;; Add all changes
            (log/info "Adding all changes")
            (-> (.add git-repo)
                (.addFilepattern ".")
                (.call))

            ;; Commit changes
            (log/info "Committing changes")
            (-> (.commit git-repo)
                (.setMessage "Update content")
                (.call))

            ;; Push to destination branch
            (log/info "Pushing to destination branch" {:dest-branch dest-branch})
            (-> (.push git-repo)
                (.setRemote "origin")
                (.setRefSpecs [(RefSpec. (str "refs/heads/" branch-name ":refs/heads/" dest-branch))])
                (.setForce true)
                (.setCredentialsProvider
                 (when token
                   (UsernamePasswordCredentialsProvider. "x-access-token" token)))
                (.call))

            (finally
              (.close git-repo))))
        (catch Exception e
          (log/error e "Git push failed")
          (throw e))))))

(defn get-source
  "Returns the source that we should actually use. A source implements the `ISource` protocol."
  []
  (when (settings/git-sync-url)
    (->GitSource (settings/git-sync-url)
                 (settings/git-sync-import-branch)
                 (settings/git-sync-token)
                 (settings/git-sync-export-branch))))
