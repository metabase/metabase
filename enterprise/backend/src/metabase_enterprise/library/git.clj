(ns metabase-enterprise.library.git
  (:require
   [clojure.java.io :as io]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (org.eclipse.jgit.api Git)
   (org.eclipse.jgit.api.errors GitAPIException InvalidRemoteException TransportException)
   (org.eclipse.jgit.transport UsernamePasswordCredentialsProvider
                               RefSpec)))

(set! *warn-on-reflection* true)

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

(defn push-branch!
  "Oh this is terrible, not just pushing a branch but ... sticking the current content into a branch based on
  `source-branch`, then force pushing it to the `dest-branch`."
  [{:keys [source-dir url source-branch dest-branch token]}]
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
        (throw e)))))

(defn can-access-branch-in-repository? [git-url branch token]
  (try
    (let [credentials-provider (when token (UsernamePasswordCredentialsProvider. "x-access-token" token))
          ls-remote-command (-> (Git/lsRemoteRepository)
                                (.setRemote git-url)
                                (.setCredentialsProvider credentials-provider))
          refs (.call ls-remote-command)
          branch-ref-name (str "refs/heads/" branch)]
      (boolean (some #(= (.getName %) branch-ref-name) refs)))
    (catch InvalidRemoteException e false)
    (catch TransportException e false)
    (catch GitAPIException e false)))
