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

(defn- root-cause [^Throwable e]
  (if-let [cause (ex-cause e)]
    (recur cause)
    e))

(defn- clean-git-exception
  [^Exception e ^GitCommand command remote?]
  (let [root-ex (root-cause e)]
    ;; strip off the beginning URL that is often included and ends up being duplicated later
    (ex-info (format "Git %s failed: %s" (-> command .getClass .getSimpleName) (str/replace-first (ex-message root-ex) #"^[a-z]+://[a-zA-Z0-9\-\.]+: " ""))
             {:remote remote?} root-ex)))

(defn- call-command [^GitCommand command]
  (let [analytics-labels {:operation (-> command .getClass .getSimpleName) :remote false}]
    (analytics/inc! :metabase-remote-sync/git-operations analytics-labels)

    (try
      (.call command)
      (catch Exception e
        (analytics/inc! :metabase-remote-sync/git-operations-failed analytics-labels)
        (throw (clean-git-exception e command false))))))

(defn- call-remote-command [^TransportCommand command {:keys [^String token]}]
  (let [analytics-labels {:operation (-> command .getClass .getSimpleName) :remote true}
        ;; GitHub convention: use "x-access-token" as username when authenticating with a personal access token
        ;; For Gitlab any values can be used as the user name so x-access-token works just as well
        credentials-provider (when token (UsernamePasswordCredentialsProvider. "x-access-token" token))]
    (analytics/inc! :metabase-remote-sync/git-operations analytics-labels)

    (try
      (-> command
          (.setCredentialsProvider credentials-provider)
          (.call))
      (catch Exception e
        (analytics/inc! :metabase-remote-sync/git-operations-failed analytics-labels)
        (throw (clean-git-exception e command true))))))

(defn- qualify-branch [branch]
  (if (str/starts-with? branch "refs/heads/")
    branch
    (str "refs/heads/" branch)))

(defn fetch!
  "Fetches updates from the remote git repository.

  Takes a git-source map containing a :git Git instance and optional :token for authentication. Returns the result
  of the git fetch operation.

  Throws ExceptionInfo if the fetch operation fails."
  [{:keys [^Git git] :as git-source}]
  (when (some? git)
    (log/info "Fetching repository" {:repo (str git)})
    (u/prog1 (call-remote-command (.fetch git) git-source))
    (log/info "Successfully fetched repository")))

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
  "Clones a git repository to a temporary directory using JGit.

  Takes a map with :url (the git repository URL) and optional :token (authentication token for private
  repositories). Returns a Git instance for the cloned repository. If the repository already exists in the temp
  directory and is valid, returns the existing repository after fetching.

  Throws ExceptionInfo if cloning fails due to network issues, invalid URL, authentication failure, etc."
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
                          {:url url
                           :dir dir
                           :error (.getMessage e)} e)))))))

(defn commit-sha
  "Resolves a branch name or commit-ish string to a full commit reference SHA.

  Takes a source map containing a :git Git instance and :commit-ish (the ref to resolve). Can optionally take a
  second commit-ish argument which overrides the :commit-ish from the source map.

  Returns the full commit SHA string, or nil if the commit-ish cannot be resolved."
  ([{:keys [^String commit-ish] :as source}]
   (commit-sha source commit-ish))

  ([{:keys [^Git git]} ^String commit-ish]
   (when-let [ref (.resolve (.getRepository git) commit-ish)]
     (.name ref))))

(defn log
  "Retrieves the commit history log for a branch.

  Takes a source map containing a :git Git instance and :commit-ish to retrieve logs from.

  Returns a sequence of commit maps, each containing :message (full commit message), :author-name (commit author's
  name), :author-email (commit author's email), :id (abbreviated commit SHA, 8 characters), and :parent
  (abbreviated parent commit SHA, 8 characters, or nil if no parent)."
  [{:keys [^Git git] :as source}]
  (when-let [ref (commit-sha source)]
    (when-let [branch-id (.resolve (.getRepository git) ref)]
      (let [log-result (call-command (-> (.log git)
                                         (.add branch-id)))]
        (map (fn [^RevCommit commit] {:message (.getFullMessage commit)
                                      :author-name (.getName (.getAuthorIdent commit))
                                      :author-email (.getEmailAddress (.getAuthorIdent commit))
                                      :id (.name (.abbreviate commit 8))
                                      :parent (when (< 0 (.getParentCount commit)) (.name (.abbreviate (.getParent commit 0) 8)))}) log-result)))))

(defn has-data?
  "Checks if the git repository has any commits/data.

  Takes a source map containing a :git Git instance and :commit-ish to check for data.

  Returns true if the repository has at least one commit, false otherwise."
  [{:keys [^Git git]}]
  (< 0 (count (call-command (.branchList git)))))

(defn list-files
  "Lists all files in the git repository at the current commit.

  Takes a source map containing a :git Git instance and :commit-ish specifying which commit to list files from.

  Returns a sorted sequence of relative file path strings from the repository root."
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
  "Reads the contents of a specific file from the git repository.

  Takes a source map containing a :git Git instance and :commit-ish specifying which commit to read from, and a path
  string indicating the relative path to the file from the repository root.

  Returns the file contents as a UTF-8 string, or nil if the file does not exist at the specified path."
  [{:keys [^Git git] :as source} ^String path]
  (let [repo (.getRepository git)]
    (when-let [ref (commit-sha source)]
      (when-let [object-id (.resolve repo (str ref ":" path))]
        (let [loader (.open repo object-id)]
          (String. (.getBytes loader) "UTF-8"))))))

(defn push-branch!
  "Pushes a local branch to the remote repository.

  Takes a git-source map containing a :git Git instance, :commit-ish (branch name), and optional :token for
  authentication.

  Returns the push response from JGit. Throws ExceptionInfo if the push operation fails or returns a
  non-OK/UP_TO_DATE status."
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
  "Extracts the unique collection identifier from a serialized file path.

  Takes a path string like \"collections/abc123_CollectionName/...\" and returns the collection prefix (e.g.,
  \"collections/abc123\") which remains stable even when collection names change.

  Returns the original path if no collection prefix is found."
  [path]
  (let [matcher (re-matcher #"^(collections/[^/]{21})_[^/]+/" path)]
    (if (re-find matcher)
      (second (re-groups matcher))
      path)))

(defn- matches-prefix [path prefixes]
  (some #(or (= % path) (str/starts-with? path %)) prefixes))

(defn default-branch
  "Retrieves the default branch name of the git repository.

  Takes a git-source map containing a :git Git instance.

  Returns the default branch name as a string (without 'refs/heads/' prefix), or nil if no default branch is found."
  [{:keys [^Git git]}]
  (let [repo (.getRepository git)
        head-ref (.findRef repo "HEAD")]
    (when head-ref
      (when-let [target-ref (.getTarget head-ref)]
        (str/replace-first (.getName target-ref) "refs/heads/" "")))))

(defn write-files!
  "Writes multiple files to the git repository and commits the changes.

  Takes a source map containing a :git Git instance and :commit-ish (target branch name), a commit message string,
  and a sequence of file maps each with :path and :content keys (paths should be relative to the repository root).
  Replaces all files in the branch organized by collection prefix - files not in the provided list but in the same
  collection prefix will be deleted.

  Returns the result of pushing the branch to the remote repository. Throws ExceptionInfo if the write or push
  operation fails."
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
  "Retrieves all branch names from the remote repository.

  Takes a source map containing a :git Git instance and optional :token for authentication.

  Returns a sorted sequence of branch name strings (without 'refs/heads/' prefix)."
  [{:keys [^Git git] :as source}]
  (->> (call-remote-command (.lsRemote git) source)
       (filter #(str/starts-with? (.getName ^Ref %) "refs/heads/"))
       (remove #(.isSymbolic ^Ref %))
       (map #(str/replace-first (.getName ^Ref %) "refs/heads/" ""))
       sort))

(defn- delete-branches-without-remote!
  [{:keys [^Git git] :as source}]
  (let [remote-branches (set (branches source))
        local-refs (call-command (.branchList git))
        branches-to-delete (keep (fn [^Ref ref]
                                   (let [branch-name (str/replace-first (.getName ref) "refs/heads/" "")]
                                     (when (not (remote-branches branch-name))
                                       branch-name)))
                                 local-refs)]
    (log/info "Deleting local branches without remote:" {:branches branches-to-delete})
    (doseq [branch-name branches-to-delete]
      (call-command (-> (.branchDelete git)
                        (.setBranchNames ^"[Ljava.lang.String;" (into-array String [branch-name]))
                        (.setForce true))))
    {:deleted (count branches-to-delete)
     :branch-names branches-to-delete}))

(defn create-branch
  "Creates a new branch in the git repository from an existing branch.

  Takes a source map containing a :git Git instance and optional :token for authentication, a branch-name string for
  the new branch, and a base-commit-ish string (branch name, tag, or SHA) to use as the base for the new branch.

  Returns the name of the newly created branch.

  Throws ExceptionInfo if the base branch is not found or if the new branch already exists."
  [{:keys [^Git git] :as source} branch-name base-commit-ish]
  (fetch! source)
  (delete-branches-without-remote! source)
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

  (default-branch [this]
    (default-branch this))

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
     (clone-repository! {:url url
                         :token token}))))

(defn git-source
  "Creates a new GitSource instance for a git repository.

  Takes a URL string (the git repository URL), a commit-ish string (branch name, tag, or commit SHA to use), and an
  optional token string (authentication token for private repositories).

  Returns a GitSource record implementing the Source protocol."
  [url commit-ish token]
  (->GitSource (get-repo url token)
               url commit-ish token))
