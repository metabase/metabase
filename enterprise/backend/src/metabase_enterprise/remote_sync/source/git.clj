(ns metabase-enterprise.remote-sync.source.git
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.analytics.core :as analytics]
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
  (let [analytics-labels {:operation (-> command .getClass .getName) :remote false}]
    (analytics/inc! :metabase-remote-sync/git-operations analytics-labels)

    (try
      (.call command)
      (catch Exception e
        (analytics/inc! :metabase-remote-sync/git-operations-failed analytics-labels)
        (throw (ex-info (format "Git %s failed: %s" (:operation analytics-labels) (.getMessage e))
                        analytics-labels e))))))

(defn- call-remote-command [^TransportCommand command {:keys [^String token]}]
  (let [analytics-labels {:operation (-> command .getClass .getName) :remote true}
        credentials-provider (when token (UsernamePasswordCredentialsProvider. "x-access-token" token))]
    (analytics/inc! :metabase-remote-sync/git-operations analytics-labels)

    (try
      (-> command
          (.setCredentialsProvider credentials-provider)
          (.call))
      (catch Exception e
        (analytics/inc! :metabase-remote-sync/git-operations-failed analytics-labels)
        (throw (ex-info (format "Git %s failed: %s" (-> command .getClass .getName) (.getMessage e))
                        analytics-labels e))))))

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
  "Clone git repository to a temporary directory using jgit. If the temp directory already exists, use it rather than re-clone.
  Returns the path to the cloned jgit.Repository bare-repo object."
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
                         :error (.getMessage #p e)}))))))

(defn ->commit-id
  "Returns the full commit ref for a branch or commit-ish string, or nil if not found."
  ([{:keys [^String commit-ish] :as source}]
   (->commit-id source commit-ish))

  ([{:keys [^Git git]} ^String commit-ish]
   (when-let [ref (.resolve (.getRepository git) commit-ish)]
     (.name ref))))

(defn log
  "The log of commits on a branch."
  [{:keys [^Git git] :as source}]
  (when-let [ref (->commit-id source)]
    (when-let [branch-id (.resolve (.getRepository git) ref)]
      (let [log-result (call-command (-> (.log git)
                                         (.add branch-id)))]
        (map (fn [^RevCommit commit] {:message      (.getFullMessage commit)
                                      :author-name  (.getName (.getAuthorIdent commit))
                                      :author-email (.getEmailAddress (.getAuthorIdent commit))
                                      :id           (.name (.abbreviate commit 8))
                                      :parent       (when (< 0 (.getParentCount commit)) (.name (.abbreviate (.getParent commit 0) 8)))}) log-result)))))

(defn list-files
  "List all files in the repository."
  [{:keys [^Git git] :as source}]
  (when-let [ref (->commit-id source)]
    (let [repo (.getRepository git)
          rev-walk (RevWalk. repo)
          commit-id (.resolve repo ref)
          commit (.parseCommit rev-walk commit-id)
          tree-walk (TreeWalk. repo)]
      (.addTree tree-walk (.getTree commit))
      (.setRecursive tree-walk true)
      (sort (loop [files []]
              (if (.next tree-walk)
                (recur (conj files (.getPathString tree-walk)))
                files))))))

(defn read-file
  "Read a specific file from the repository. Returns nil if the file does not exist.
  Path should be relative to the root of the repository."
  [{:keys [^Git git] :as source} ^String path]
  (let [repo (.getRepository git)]
    (when-let [ref (->commit-id source)]
      (when-let [object-id (.resolve repo (str ref ":" path))]
        (let [loader (.open repo object-id)]
          (String. (.getBytes loader) "UTF-8"))))))

(defn push-branch!
  "Pushes a local branch to a remote branch."
  [{:keys [^Git git ^String commit-ish] :as git-source}]
  (let [branch-name (qualify-branch commit-ish)
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

(defn- path-prefix
  "Pulls off the collection prefix from a path, where the prefix is the unique identifier for it, even if the name changes"
  [path]
  (let [matcher (re-matcher #"^(collections/[^/]{21})_[^/]+/" path)
        transform-tags-matcher (re-matcher #"^(collections/transformtags)/" path)
        transform-jobs-matcher (re-matcher #"^(collections/transformjobs)/" path)]
    (cond
      (re-find matcher) (second (re-groups matcher))
      (re-find transform-tags-matcher) (second (re-groups transform-tags-matcher))
      (re-find transform-jobs-matcher) (second (re-groups transform-jobs-matcher))
      :else path)))

(defn- matches-prefix [path prefixes]
  (some #(or (= % path) (str/starts-with? path %)) prefixes))

(defn write-files!
  "Write a seq of files to the repo. `files` should be maps of :path and :content, with path relative to the root of the repository.
  Replaces all files in the branch with the given files, does not preserve files not in the list."
  [{:keys [^Git git ^String commit-ish] :as source} ^String message files]
  (fetch! source)
  (let [repo (.getRepository git)
        branch-ref (qualify-branch commit-ish)
        parent-id (or (.resolve repo branch-ref)
                      (.resolve repo "refs/heads/main")
                      (.resolve repo "refs/heads/master"))]

    (with-open [inserter (.newObjectInserter repo)]
      (let [index (DirCache/newInCore)
            builder (.builder index)
            updated-prefixes (into #{} (map (fn [{:keys [path content]}]
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
    (push-branch! source)))

(defn branches
  "Return the branches in the remote repo"
  [{:keys [^Git git] :as source}]
  (->> (call-remote-command (.lsRemote git) source)
       (filter #(str/starts-with? (.getName ^Ref %) "refs/heads/"))
       (remove #(.isSymbolic ^Ref %))
       (map #(str/replace-first (.getName ^Ref %) "refs/heads/" ""))
       sort))

(defn create-branch
  "Create a new branch from an existing branch"
  [{:keys [^Git git] :as source} branch-name base-branch]
  (fetch! source)
  (let [repo (.getRepository git)
        base-ref (qualify-branch base-branch)
        new-branch-ref (qualify-branch branch-name)
        base-commit-id (or (.resolve repo base-ref)
                           (.resolve repo "refs/heads/main")
                           (.resolve repo "refs/heads/master"))]
    (when-not base-commit-id
      (throw (ex-info (format "Base branch '%s' not found" base-branch)
                      {:base-branch base-branch})))
    (when (.resolve repo new-branch-ref)
      (throw (ex-info (format "Branch '%s' already exists" branch-name)
                      {:branch branch-name})))
    (doto (.updateRef repo new-branch-ref)
      (.setNewObjectId base-commit-id)
      (.update))
    (push-branch! (assoc source :commit-ish branch-name))
    branch-name))

(defrecord GitSource [git remote-url commit-ish token]
  source.p/Source
  (branches [source] (branches source))

  (create-branch [source branch-name base-branch]
    (create-branch source branch-name base-branch))

  (list-files [this]
    (list-files this))

  (read-file [this path]
    (read-file this path))

  (write-files! [this message files]
    (write-files! this message files))

  (version [this]
    (->commit-id this)))

(def git-source
  "Create a new git source"
  (memoize
   (fn [url commit-ish token]
     (->GitSource (clone-repository! {:url   url
                                      :token token})
                  url commit-ish token))))
