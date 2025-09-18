(ns metabase-enterprise.remote-sync.source.git
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (org.eclipse.jgit.api Git GitCommand TransportCommand)
   (org.eclipse.jgit.dircache DirCache DirCacheEntry)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode PersonIdent Ref)
   (org.eclipse.jgit.revwalk RevCommit RevWalk)
   (org.eclipse.jgit.transport PushResult RefSpec RemoteRefUpdate
                               RemoteRefUpdate$Status UsernamePasswordCredentialsProvider)
   (org.eclipse.jgit.treewalk TreeWalk)))

(set! *warn-on-reflection* true)

(defn- call-command [^GitCommand command]
  (.call command))

(defn- call-remote-command [^TransportCommand command {:keys [^String token]}]
  (let [credentials-provider (when token (UsernamePasswordCredentialsProvider. "x-access-token" token))]
    (-> command
        (.setCredentialsProvider credentials-provider)
        (.call))))

(defn- qualify-branch [branch]
  (if (str/starts-with? branch "refs/heads/")
    branch
    (str "refs/heads/" branch)))

(defn fetch!
  "Call fetch on the repository."
  [{:keys [^Git git] :as git-source}]
  (log/info "Fetching repository" {:repo (str git)})
  (u/prog1 (call-remote-command (.fetch git) git-source))
  (log/info "Successfully fetched repository" {:repo (str git)}))

(defn clone-repository!
  "Clone git repository to a temporary directory using jgit. Returns the path to the cloned jgit.Repository bare-repo object."
  [{:keys [^String url ^String token]}]
  (let [dir (io/file (System/getProperty "java.io.tmpdir") "metabase-git" (-> (str/join ":" [url token]) buddy-hash/sha1 codecs/bytes->hex))]
    (io/make-parents dir)
    (try
      (if (.exists dir)
        (do
          (log/info "Using existing cloned repository" {:url url :dir dir})
          (u/prog1 (Git/open dir)
            (fetch! {:git <> :token token})))
        (do
          (log/info "Cloning repository" {:url url :dir dir})
          (u/prog1 (call-remote-command (-> (Git/cloneRepository)
                                            (.setDirectory dir)
                                            (.setURI url)
                                            (.setBare true)) {:token token})
            (log/info "Successfully cloned repository" {:dir dir}))))
      (catch Exception e
        (throw (ex-info (format "Failed to clone git repository: %s" (.getMessage e))
                        {:url   url
                         :dir   dir
                         :error (.getMessage e)}))))))

(defn log
  "The log of commits on a branch."
  [{:keys [^Git git]} ^String branch]
  (when-let [branch-id (.resolve (.getRepository git) (qualify-branch branch))]
    (let [log-result (call-command (-> (.log git)
                                       (.add branch-id)))]
      (map (fn [^RevCommit commit] {:message      (.getFullMessage commit)
                                    :author-name  (.getName (.getAuthorIdent commit))
                                    :author-email (.getEmailAddress (.getAuthorIdent commit))
                                    :id           (.name (.abbreviate commit 8))
                                    :parent       (when (< 0 (.getParentCount commit)) (.name (.abbreviate (.getParent commit 0) 8)))}) log-result))))

(defn list-files
  "List all files in the repository."
  [{:keys [^Git git]} ^String branch]
  (let [repo (.getRepository git)
        rev-walk (RevWalk. repo)
        commit-id (.resolve repo (qualify-branch branch))
        commit (.parseCommit rev-walk commit-id)
        tree-walk (TreeWalk. repo)]
    (.addTree tree-walk (.getTree commit))
    (.setRecursive tree-walk true)
    (sort (loop [files []]
            (if (.next tree-walk)
              (recur (conj files (.getPathString tree-walk)))
              files)))))

(defn read-file
  "Read a specific file from the repository. Returns nil if the file does not exist.
  Path should be relative to the root of the repository."
  [{:keys [^Git git]} ^String branch ^String path]
  (let [repo (.getRepository git)
        object-id (.resolve repo (str (qualify-branch branch) ":" path))]
    (when object-id
      (let [loader (.open repo object-id)]
        (String. (.getBytes loader) "UTF-8")))))

(defn push-branch!
  "Pushes a local branch to a remote branch."
  [{:keys [^Git git] :as git-source} ^String branch-name]
  (let [branch-name (qualify-branch branch-name)
        push-response (call-remote-command
                       (-> (.push git)
                           (.setRemote "origin")
                           (.setRefSpecs (doto (java.util.ArrayList.)
                                           (.add (RefSpec. (str branch-name ":" branch-name))))))
                       git-source)
        push-results (->> push-response
                          (map #(into [] (.getRemoteUpdates ^PushResult %)))
                          flatten)]

    (when-let [failures (seq (remove #(#{RemoteRefUpdate$Status/OK RemoteRefUpdate$Status/UP_TO_DATE} %) (map #(.getStatus ^RemoteRefUpdate %) push-results)))]
      (throw (ex-info (str "Failed to push branch " branch-name " to remote") {:failures failures})))
    push-response))

(defn- path-prefix [path]
  (first (str/split path #"/")))

(defn- matches-prefix [path prefixes]
  (some #(or (= % path) (str/starts-with? path (str % "/"))) prefixes))

(defn write-files!
  "Write a seq of files to the repo. `files` should be maps of :path and :content, with path relative to the root of the repository.
  Replaces all files in the branch with the given files, does not preserve files not in the list."
  [{:keys [^Git git] :as git-source} ^String branch ^String message files]
  (fetch! git-source)
  (let [repo (.getRepository git)
        branch-ref (qualify-branch branch)
        parent-id (or (.resolve repo branch-ref)
                      (.resolve repo "refs/heads/main")
                      (.resolve repo "refs/heads/master"))]

    (with-open [inserter (.newObjectInserter repo)]
      (let [index (DirCache/newInCore)
            builder (.builder index)
            updated-prefixes  (into #{} (map (fn [{:keys [path content]}]
                                               (let [blob-id (.insert inserter Constants/OBJ_BLOB (.getBytes ^String content "UTF-8"))
                                                     entry (doto (DirCacheEntry. ^String path)
                                                             (.setFileMode FileMode/REGULAR_FILE)
                                                             (.setObjectId blob-id))]
                                                 (.add builder entry))
                                               (path-prefix path)) files))]

        ;; Copy existing tree entries, excluding the file we're updating
        (when parent-id
          (with-open [rev-walk (RevWalk. repo)
                      tree-walk (TreeWalk. repo)]
            (let [commit (.parseCommit rev-walk parent-id)]
              (.addTree tree-walk (.getTree commit))
              (.setRecursive tree-walk true)
              (while (.next tree-walk)
                (when-not (matches-prefix (.getPathString tree-walk) updated-prefixes)
                  (let [entry (doto (DirCacheEntry. (.getPathString tree-walk))
                                (.setFileMode (.getFileMode tree-walk 0))
                                (.setObjectId (.getObjectId tree-walk 0)))]
                    (.add builder entry)))))))

        (.finish builder)

        ;; Create commit
        (let [tree-id (.writeTree index inserter)
              commit-builder (doto (CommitBuilder.)
                               (.setTreeId tree-id)
                               (.setAuthor (PersonIdent. "Metabase Library" "library@metabase.com"))
                               (.setCommitter (PersonIdent. "Metabase Library" "library@metabase.com"))
                               (.setMessage message))]
          (when parent-id
            (.setParentId commit-builder parent-id))

          (let [commit-id (.insert inserter commit-builder)]
            (.flush inserter)
            (doto (.updateRef repo branch-ref)
              (.setNewObjectId commit-id)
              (.update))))))
    (push-branch! git-source branch-ref)))

(defn branches
  "Return the branches in the repo"
  [{:keys [^Git git] :as source}]
  (fetch! source)
  (->> (call-command (.branchList git))
       (filter #(str/starts-with? (.getName ^Ref %) "refs/heads/"))
       (remove #(.isSymbolic ^Ref %))
       (map #(str/replace-first (.getName ^Ref %) "refs/heads/" ""))
       sort))

(defrecord GitSource [git remote-url token]
  source.p/LibrarySource
  (branches [source] (branches source))

  (list-files [this branch]
    (list-files this branch))

  (read-file [this branch path]
    (read-file this branch path))

  (write-files! [this branch message files]
    (write-files! this branch message files)))

(def git-source
  "Create a new git source"
  (memoize
   (fn [url token]
     (->GitSource (clone-repository! {:url   url
                                      :token token})
                  url token))))
