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
   (java.io File)
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
  of the git fetch operation. Uses the 'origin' remote which is configured by ensure-origin-configured!.

  Throws ExceptionInfo if the fetch operation fails."
  [{:keys [^Git git] :as git-source}]
  (when (some? git)
    (log/info "Fetching repository" {:repo (str git)})
    (u/prog1 (call-remote-command (.fetch git) git-source))
    (log/info "Successfully fetched repository")))

(defn- repo-path [{:keys [^String remote-url ^String token]}]
  (io/file (System/getProperty "java.io.tmpdir") "metabase-git" (-> (str/join ":" [remote-url token]) buddy-hash/sha1 codecs/bytes->hex)))

(defn- clone-repository!
  "Clones a git repository to a temporary directory using JGit.

  Takes a map with :remote-url (the git repository URL) and optional :token (authentication token for private
  repositories). Returns a Git instance for the cloned repository. If the repository already exists in the temp
  directory and is valid, returns the existing repository after fetching.

  Throws ExceptionInfo if cloning fails due to network issues, invalid URL, authentication failure, etc."
  [repo-path {:keys [^String remote-url ^String token]}]
  (log/info "Cloning repository" {:url remote-url :repo-path repo-path})
  (io/make-parents repo-path)
  (try
    (u/prog1 (call-remote-command (-> (Git/cloneRepository)
                                      (.setDirectory repo-path)
                                      (.setURI remote-url)
                                      (.setBare true)) {:token token})
      (log/info "Successfully cloned repository" {:repo-path repo-path}))
    (catch Exception e
      (throw (ex-info (format "Failed to clone git repository: %s" (ex-message e))
                      {:url       remote-url
                       :repo-path repo-path
                       :error     (.getMessage e)} e)))))

(defn- ensure-origin-configured!
  "Ensures the 'origin' remote is configured with the correct URL.

  This fixes issues where the origin remote may be missing or have an incorrect URL
  (e.g., after repository corruption or configuration changes). If the URL doesn't
  match, it's updated and saved."
  [^Git git ^String url]
  (let [config (.getConfig (.getRepository git))
        current-url (.getString config "remote" "origin" "url")]
    (when (not= url current-url)
      (log/info "Configuring origin remote" {:current current-url :new url})
      (.setString config "remote" "origin" "url" url)
      (.setString config "remote" "origin" "fetch" "+refs/heads/*:refs/heads/*")
      (.save config))))

(defn- open-jgit [^File repo-path {:keys [remote-url] :as args}]
  (if (.exists repo-path)
    (let [git (do
                (log/debugf "Opening existing at %" repo-path)
                (Git/open repo-path))]
      (ensure-origin-configured! git remote-url)
      git)
    (clone-repository! repo-path args)))

(defn commit-sha
  "Resolves a branch name or commit-ish string to a full commit reference SHA.

  Takes a source map containing a :git Git instance and :commit-ish (the ref to resolve). Can optionally take a
  second commit-ish argument which overrides the :commit-ish from the source map.

  Returns the full commit SHA string, or nil if the commit-ish cannot be resolved."
  [{:keys [^Git git]} ^String commit-ish]
  (when-let [ref (.resolve (.getRepository git) commit-ish)]
    (.name ref)))

(defn log
  "Retrieves the commit history log for a branch.

  Takes a source OR snapshot to retrieve logs from.

  Returns a sequence of commit maps, each containing :message (full commit message), :author-name (commit author's
  name), :author-email (commit author's email), :id (abbreviated commit SHA, 8 characters), and :parent
  (abbreviated parent commit SHA, 8 characters, or nil if no parent)."
  [{:keys [^Git git branch version] :as source-or-snapshot}]
  (when-let [ref (commit-sha source-or-snapshot (or version branch))]
    (when-let [branch-id (.resolve (.getRepository git) ref)]
      (let [log-result (call-command (-> (.log git)
                                         (.add branch-id)))]
        (map (fn [^RevCommit commit] {:message (.getFullMessage commit)
                                      :author-name (.getName (.getAuthorIdent commit))
                                      :author-email (.getEmailAddress (.getAuthorIdent commit))
                                      :id (.name (.abbreviate commit 8))
                                      :parent (when (< 0 (.getParentCount commit)) (.name (.abbreviate (.getParent commit 0) 8)))}) log-result)))))

(defn list-files
  "Lists all files in the git repository at the snapshot.

  Takes a GitSnapshot containing a :git Git instance and :version specifying which commit to list files from.

  Returns a sorted sequence of relative file path strings from the repository root."
  [{:keys [^Git git ^String version]}]
  (let [repo (.getRepository git)
        rev-walk (RevWalk. repo)
        commit-id (.resolve repo version)
        commit (.parseCommit rev-walk commit-id)
        tree-walk (TreeWalk. repo)]
    (.addTree tree-walk (.getTree commit))
    (.setRecursive tree-walk true)
    (sort (loop [files []]
            (if (.next tree-walk)
              (recur (conj files (.getPathString tree-walk)))
              files)))))

(defn read-file
  "Reads the contents of a specific file from the git snapshot.

  Takes a GitSnapshot containing a :git Git instance and :version specifying which commit to read from, and a path
  string indicating the relative path to the file from the repository root.

  Returns the file contents as a UTF-8 string, or nil if the file does not exist at the specified path."
  [{:keys [^Git git ^String version]} ^String path]
  (let [repo (.getRepository git)]
    (when-let [object-id (.resolve repo (str version ":" path))]
      (let [loader (.open repo object-id)]
        (String. (.getBytes loader) "UTF-8")))))

(defn push-branch!
  "Pushes a local branch to the remote repository.

  Takes a git-source map containing a :git Git instance, :branch, and optional :token for
  authentication. Uses the 'origin' remote which is configured by ensure-origin-configured!.

  Returns the push response from JGit. Throws ExceptionInfo if the push operation fails or returns a
  non-OK/UP_TO_DATE status."
  [{:keys [^Git git ^String branch] :as git-source}]
  (let [branch-name (qualify-branch branch)
        push-response (call-remote-command
                       (-> (.push git)
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

  Returns the default branch name as a string (without 'refs/heads/' prefix).
  Throws ExceptionInfo if no default branch is found."
  [{:keys [^Git git] :as git-source}]
  ;; Query the remote directly to get HEAD - lsRemote returns symbolic refs
  (let [refs (call-remote-command (.lsRemote git) git-source)
        head-ref (first (filter #(= "HEAD" (.getName ^Ref %)) refs))]
    (or (when head-ref
          (when (.isSymbolic ^Ref head-ref)
            (when-let [target (.getTarget ^Ref head-ref)]
              (str/replace-first (.getName ^Ref target) "refs/heads/" ""))))
        (throw (ex-info "Failed to get a default branch for git repository." {:head-ref head-ref})))))

(defn write-files!
  "Writes multiple files to the git repository and commits the changes.

  Takes a snapshot map containing a :git Git instance and :version, a commit message string,
  and a sequence of file specs (paths should be relative to the repository root).

  Each file spec is a map with either:
  - :path and :content keys for writing/updating a file
  - :path and :remove? true for recursively removing all files at that path

  For writes within collection directories, ALL files in the same collection are replaced
  (using the collection entity_id prefix to identify the collection scope). This ensures
  that stale files don't remain when a collection's contents change.

  For removals, all files matching the path as a prefix are deleted (allowing recursive
  directory deletion). Removal entries with empty paths are no-ops. Removing non-existent
  paths is also a no-op (idempotent).

  Returns the version written. Throws ExceptionInfo if the write or push
  operation fails."
  [{:keys [^Git git ^String version ^String branch] :as snapshot} ^String message files]
  (let [repo (.getRepository git)
        branch-ref (qualify-branch branch)
        parent-id (.resolve repo version)]

    (with-open [inserter (.newObjectInserter repo)]
      (let [index (DirCache/newInCore)
            builder (.builder index)
            ;; Extract collection prefixes from written paths - all files in these
            ;; collections will be deleted and replaced with the new files
            write-prefixes (into #{}
                                 (comp
                                  (remove :remove?)
                                  (map :path)
                                  (remove str/blank?)
                                  (map path-prefix))
                                 files)
            ;; Collect removal paths/prefixes for explicit deletions
            removal-prefixes (into #{}
                                   (comp
                                    (filter :remove?)
                                    (map :path)
                                    (remove str/blank?))
                                   files)]

        ;; Add new/updated files to the index
        (doseq [{:keys [path content remove?]} files
                :when (and (not remove?) (not (str/blank? path)))]
          (let [blob-id (.insert inserter Constants/OBJ_BLOB (.getBytes ^String content "UTF-8"))
                entry (doto (DirCacheEntry. ^String path)
                        (.setFileMode FileMode/REGULAR_FILE)
                        (.setObjectId blob-id))]
            (.add builder entry)))

        ;; Copy existing tree entries, excluding:
        ;; 1. Files in collections being written to (using write-prefixes)
        ;; 2. Files matching explicit removal prefixes
        (when parent-id
          (with-open [rev-walk (RevWalk. repo)
                      tree-walk (TreeWalk. repo)]
            (let [commit (.parseCommit rev-walk parent-id)]
              (.addTree tree-walk (.getTree commit))
              (.setRecursive tree-walk true)
              (while (.next tree-walk)
                (let [path (.getPathString tree-walk)
                      existing-prefix (path-prefix path)]
                  (when-not (or (contains? write-prefixes existing-prefix)
                                (matches-prefix path removal-prefixes))
                    (let [entry (doto (DirCacheEntry. path)
                                  (.setFileMode (.getFileMode tree-walk 0))
                                  (.setObjectId (.getObjectId tree-walk 0)))]
                      (.add builder entry))))))))

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
              (.update))
            (push-branch! snapshot)
            (.name commit-id)))))))

(defn branches
  "Retrieves all branch names from the remote repository.

  Takes a source map containing a :git Git instance and optional :token for authentication.
  Uses the 'origin' remote which is configured by ensure-origin-configured!.

  Returns a sorted sequence of branch name strings (without 'refs/heads/' prefix)."
  [{:keys [^Git git] :as source}]
  (->> (call-remote-command (.lsRemote git) source)
       (filter #(str/starts-with? (.getName ^Ref %) "refs/heads/"))
       (remove #(.isSymbolic ^Ref %))
       (map #(str/replace-first (.getName ^Ref %) "refs/heads/" ""))
       sort))

(defn has-data?
  "Checks if the remote git repository has any commits/data.

  Takes a source map to check for data.

  Returns true if the repository has at least one commit, false otherwise."
  [source]
  (< 0 (count (branches source))))

(defn- delete-branches-without-remote!
  [{:keys [^Git git] :as source}]
  (let [remote-branches (set (branches source))
        local-refs (call-command (.branchList git))
        branches-to-delete (keep (fn [^Ref ref]
                                   (let [branch-name (str/replace-first (.getName ref) "refs/heads/" "")]
                                     (when (not (remote-branches branch-name))
                                       branch-name)))
                                 local-refs)]
    (when (seq branches-to-delete)
      (log/info "Deleting local branches without remote:" {:branches branches-to-delete}))
    (doseq [branch-name branches-to-delete]
      (call-command (-> (.branchDelete git)
                        (.setBranchNames ^"[Ljava.lang.String;" (into-array String [branch-name]))
                        (.setForce true))))
    {:deleted (count branches-to-delete)
     :branch-names branches-to-delete}))

(defn create-branch
  "Creates a new branch in the git repository from an existing branch.

  Takes a source map containing a :git Git instance and optional :token for authentication, a branch-name string for
  the new branch, and a base-branch to use as the base for the new branch.

  Returns the name of the newly created branch.

  Throws ExceptionInfo if the base branch is not found or if the new branch already exists."
  [{:keys [^Git git] :as source} branch-name base-commit-ish]
  (fetch! source)
  (delete-branches-without-remote! source)
  (let [repo (.getRepository git)
        new-branch-ref (qualify-branch branch-name)
        base-commit-id (.resolve repo base-commit-ish)]
    (when-not base-commit-id
      (throw (ex-info (format "Branch base '%s' not found" base-commit-ish)
                      {:base-commit-ish base-commit-ish})))
    (when (.resolve repo new-branch-ref)
      (throw (ex-info (format "Branch '%s' already exists" branch-name)
                      {:branch branch-name})))
    (doto (.updateRef repo new-branch-ref)
      (.setNewObjectId base-commit-id)
      (.update))
    (push-branch! (assoc source :branch branch-name))
    branch-name))

(defrecord GitSnapshot [git remote-url branch version token]
  source.p/SourceSnapshot

  (list-files [this]
    (list-files this))

  (read-file [this path]
    (read-file this path))

  (write-files! [this message files]
    (write-files! this message files))

  (version [this]
    (:version this)))

(def ^:private jgit (atom {}))

(defn- stale-cache-error?
  "Returns true if the exception indicates a stale git cache (e.g., after a force-push on the remote)."
  [^Exception e]
  (some-> (ex-message e) (str/includes? "Missing commit")))

(defn- clear-cached-repo!
  "Clears a cached git repository from memory and disk."
  [^File repo-path]
  (log/info "Clearing stale git cache" {:repo-path (str repo-path)})
  (swap! jgit dissoc (.getPath repo-path))
  (FileUtils/deleteDirectory repo-path))

(defn- get-jgit [^File path {:keys [remote-url token] :as args}]
  (if-let [obj (get @jgit (.getPath path))]
    obj
    (get (swap! jgit assoc (.getPath path) (u/prog1 (open-jgit path {:remote-url remote-url
                                                                     :token      token})
                                             (when-not (has-data? (assoc args :git <>))
                                               (FileUtils/deleteDirectory path)
                                               (throw (ex-info "Cannot connect to uninitialized repository" {:url remote-url})))))
         (.getPath path))))

(defn- snapshot*
  "Internal snapshot implementation. Returns a GitSnapshot or throws."
  [source]
  (fetch! source)
  (let [version (commit-sha source (:branch source))]
    (if version
      (->GitSnapshot (:git source) (:remote-url source) (:branch source) version (:token source))
      (throw (ex-info (str "Invalid branch: " (:branch source)) {})))))

(defn- snapshot
  "Creates a snapshot, recovering from stale cache errors by re-cloning."
  [{:keys [remote-url token] :as source}]
  (try
    (snapshot* source)
    (catch Exception e
      (if (stale-cache-error? e)
        (let [path (repo-path {:remote-url remote-url :token token})]
          (clear-cached-repo! path)
          (let [fresh-git (get-jgit path {:remote-url remote-url :token token})
                fresh-source (assoc source :git fresh-git)]
            (log/info "Retrying snapshot after clearing stale cache")
            (snapshot* fresh-source)))
        (throw e)))))

(defrecord GitSource [git remote-url branch token]
  source.p/Source
  (branches [source] (branches source))

  (create-branch [source branch-name base-commit-ish]
    (create-branch source branch-name base-commit-ish))

  (default-branch [this]
    (default-branch this))

  (snapshot [this]
    (snapshot this)))

(defn git-source
  "Creates a new GitSource instance for a git repository.

  Takes a URL string (the git repository URL), a branch, and an
  optional token string (authentication token for private repositories).

  Returns a GitSource record implementing the Source protocol."
  [url branch token]
  (->GitSource (get-jgit (repo-path {:remote-url url :token token}) {:remote-url url :token token})
               url branch token))
