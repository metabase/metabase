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
   (org.apache.commons.io FileUtils)
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
        (throw (ex-info (format "Git %s failed: %s" (:operation analytics-labels) (ex-message e))
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
        (throw (ex-info (format "Git %s failed: %s" (-> command .getClass .getName) (ex-message e))
                        analytics-labels e))))))

(defn- qualify-branch [branch]
  (if (str/starts-with? branch "refs/heads/")
    branch
    (str "refs/heads/" branch)))

(defn fetch!
  "Fetch updates from the remote git repository.

  Args:
    git-source: A map containing :git (Git instance) and optional :token for authentication.

  Returns:
    The result of the git fetch operation.

  Raises:
    ExceptionInfo: If the fetch operation fails."
  [{:keys [^Git git] :as git-source}]
  (log/info "Fetching repository" {:repo (str git)})
  (u/prog1 (call-remote-command (.fetch git) git-source))
  (log/info "Successfully fetched repository" {:repo (str git)}))

(defn- existing-git-repo [^java.io.File dir {:keys [^String token]}]
  (io/make-parents dir)
  (try
    (when (.exists dir)
      (u/prog1 (Git/open dir)
        (fetch! {:git <> :token token})))
    (catch Exception e
      (log/warnf e "Existing git repo at %s is not configured correctly. Deleting it" dir)
      (FileUtils/deleteDirectory dir)
      nil)))

(defn clone-repository!
  "Clone a git repository to a temporary directory using JGit.

  Args:
    args: A map containing:
      - :url - The git repository URL to clone.
      - :token - (Optional) Authentication token for private repositories.

  Returns:
    A Git instance for the cloned repository. If the repository already exists
    in the temp directory and is valid, returns the existing repository after fetching.

  Raises:
    ExceptionInfo: If cloning fails (network issues, invalid URL, authentication failure, etc.)."
  [{:keys [^String url ^String token] :as args}]
  (let [dir (io/file (System/getProperty "java.io.tmpdir") "metabase-git" (-> (str/join ":" [url token]) buddy-hash/sha1 codecs/bytes->hex))]
    (if-let [repo (existing-git-repo dir args)]
      repo
      (try
        (log/info "Cloning repository" {:url url :dir dir})
        (u/prog1 (call-remote-command (-> (Git/cloneRepository)
                                          (.setDirectory dir)
                                          (.setURI url)
                                          (.setBare true)) {:token token})
          (log/info "Successfully cloned repository" {:dir dir}))
        (catch Exception e
          (throw (ex-info (format "Failed to clone git repository: %s" (ex-message e))
                          {:url   url
                           :dir   dir
                           :error (.getMessage e)} e)))))))

(defn commit-sha
  "Resolve a branch name or commit-ish string to a full commit reference.

  Args:
    source: A map containing :git (Git instance) and :commit-ish (the ref to resolve).
    commit-ish: (Optional) The branch name or commit-ish string to resolve. If not provided, uses :commit-ish from source.

  Returns:
    The full commit SHA string, or nil if the commit-ish cannot be resolved."
  ([{:keys [^String commit-ish] :as source}]
   (commit-sha source commit-ish))

  ([{:keys [^Git git]} ^String commit-ish]
   (when-let [ref (.resolve (.getRepository git) commit-ish)]
     (.name ref))))

(defn log
  "Get the commit history log for a branch.

  Args:
    source: A map containing :git (Git instance) and :commit-ish to retrieve logs from.

  Returns:
    A sequence of commit maps, each containing:
      - :message - The full commit message
      - :author-name - The commit author's name
      - :author-email - The commit author's email
      - :id - The abbreviated commit SHA (8 characters)
      - :parent - The abbreviated parent commit SHA (8 characters), or nil if no parent"
  [{:keys [^Git git] :as source}]
  (when-let [ref (commit-sha source)]
    (when-let [branch-id (.resolve (.getRepository git) ref)]
      (let [log-result (call-command (-> (.log git)
                                         (.add branch-id)))]
        (map (fn [^RevCommit commit] {:message      (.getFullMessage commit)
                                      :author-name  (.getName (.getAuthorIdent commit))
                                      :author-email (.getEmailAddress (.getAuthorIdent commit))
                                      :id           (.name (.abbreviate commit 8))
                                      :parent       (when (< 0 (.getParentCount commit)) (.name (.abbreviate (.getParent commit 0) 8)))}) log-result)))))

(defn list-files
  "List all files in the git repository at the current commit.

  Args:
    source: A map containing :git (Git instance) and :commit-ish specifying which commit to list files from.

  Returns:
    A sorted sequence of relative file path strings from the repository root."
  [{:keys [^Git git] :as source}]
  (when-let [ref (commit-sha source)]
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
  "Read the contents of a specific file from the git repository.

  Args:
    source: A map containing :git (Git instance) and :commit-ish specifying which commit to read from.
    path: The relative path to the file from the repository root.

  Returns:
    The file contents as a UTF-8 string, or nil if the file does not exist at the specified path."
  [{:keys [^Git git] :as source} ^String path]
  (let [repo (.getRepository git)]
    (when-let [ref (commit-sha source)]
      (when-let [object-id (.resolve repo (str ref ":" path))]
        (let [loader (.open repo object-id)]
          (String. (.getBytes loader) "UTF-8"))))))

(defn push-branch!
  "Push a local branch to the remote repository.

  Args:
    git-source: A map containing :git (Git instance), :commit-ish (branch name), and optional :token for authentication.

  Returns:
    The push response from JGit.

  Raises:
    ExceptionInfo: If the push operation fails or returns a non-OK/UP_TO_DATE status."
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
  (let [matcher (re-matcher #"^(collections/[^/]{21})_[^/]+/" path)]
    (if (re-find matcher)
      (second (re-groups matcher))
      path)))

(defn- matches-prefix [path prefixes]
  (some #(or (= % path) (str/starts-with? path %)) prefixes))

(defn default-branch
  "Get the default branch name of the git repository.

  Args:
    git-source: A map containing :git (Git instance).

  Returns:
    The default branch name as a string (without 'refs/heads/' prefix), or nil if no default branch is found."
  [{:keys [^Git git]}]
  (let [repo (.getRepository git)
        head-ref (.findRef repo "HEAD")]
    (when head-ref
      (when-let [target-ref (.getTarget head-ref)]
        (str/replace-first (.getName target-ref) "refs/heads/" "")))))

(defn write-files!
  "Write multiple files to the git repository and commit the changes.

  Args:
    source: A map containing :git (Git instance) and :commit-ish (target branch name).
    message: The commit message for this change.
    files: A sequence of file maps, each with :path and :content keys. Paths should be relative to the repository root.

  Returns:
    The result of pushing the branch to the remote repository.

  Raises:
    ExceptionInfo: If the write or push operation fails.

  Notes:
    This function replaces all files in the branch with the given files, organized by collection prefix.
    Files not in the provided list but in the same collection prefix will be deleted."
  [{:keys [^Git git ^String commit-ish] :as source} ^String message files]
  (fetch! source)
  (let [repo (.getRepository git)
        branch-ref (qualify-branch commit-ish)
        parent-id (or (.resolve repo branch-ref)
                      (.resolve repo (qualify-branch (default-branch source))))]

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
  "Get all branch names from the remote repository.

  Args:
    source: A map containing :git (Git instance) and optional :token for authentication.

  Returns:
    A sorted sequence of branch name strings (without 'refs/heads/' prefix)."
  [{:keys [^Git git] :as source}]
  (->> (call-remote-command (.lsRemote git) source)
       (filter #(str/starts-with? (.getName ^Ref %) "refs/heads/"))
       (remove #(.isSymbolic ^Ref %))
       (map #(str/replace-first (.getName ^Ref %) "refs/heads/" ""))
       sort))

(defn create-branch
  "Create a new branch in the git repository from an existing branch.

  Args:
    source: A map containing :git (Git instance) and optional :token for authentication.
    branch-name: The name for the new branch to create.
    base-commit-ish: The commit-ish (branch name, tag, or SHA) to use as the base for the new branch.

  Returns:
    The name of the newly created branch.

  Raises:
    ExceptionInfo: If the base branch is not found or if the new branch already exists."
  [{:keys [^Git git] :as source} branch-name base-commit-ish]
  (fetch! source)
  (let [repo (.getRepository git)
        new-branch-ref (qualify-branch branch-name)
        base-commit-id (.resolve repo base-commit-ish)]
    (when-not base-commit-id
      (throw (ex-info (format "Base branch '%s' not found" base-commit-ish)
                      {:base-branch base-commit-ish})))
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
    (commit-sha this)))

(def ^:private get-repo
  (memoize
   (fn [url token]
     (clone-repository! {:url   url
                         :token token}))))

(defn git-source
  "Create a new GitSource instance for a git repository.

  Args:
    url: The git repository URL.
    commit-ish: The branch name, tag, or commit SHA to use.
    token: (Optional) Authentication token for private repositories.

  Returns:
    A GitSource record implementing the Source protocol."
  [url commit-ish token]
  (->GitSource (get-repo url token)
               url commit-ish token))
