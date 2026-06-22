(ns metabase-enterprise.remote-sync.source.git
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.analytics-interface.core :as analytics]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.net URI)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git GitCommand TransportCommand)
   (org.eclipse.jgit.dircache DirCache DirCacheEditor$DeletePath DirCacheEditor$DeleteTree
                              DirCacheEditor$PathEdit DirCacheEntry)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode ObjectId PersonIdent Ref Repository)
   (org.eclipse.jgit.revwalk RevCommit RevWalk)
   (org.eclipse.jgit.transport PushResult RefSpec RemoteRefUpdate
                               RemoteRefUpdate$Status UsernamePasswordCredentialsProvider)
   (org.eclipse.jgit.treewalk TreeWalk)
   (org.eclipse.jgit.treewalk.filter TreeFilter)))

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

(defmulti credentials-provider
  "Creates a JGit CredentialsProvider based on the authentication method.

  Dispatches on auth-method keyword. The credentials argument is method-specific
  and can be any data structure appropriate for that authentication method.

  Returns a CredentialsProvider instance or nil if no authentication is needed."
  {:arglists '([remote-url credentials])}
  (fn [remote-url _credentials] (keyword (u/lower-case-en (.getHost (URI. remote-url))))))

(defmethod credentials-provider :default
  [_remote-url ^String token]
  (UsernamePasswordCredentialsProvider. "x-access-token" token))

(defmethod credentials-provider :bitbucket.org
  [_auth-method ^String token]
  (when token
    (UsernamePasswordCredentialsProvider. "x-token-auth" token)))

(defn- call-remote-command [^TransportCommand command {:keys [^String token ^String remote-url]}]
  (let [analytics-labels {:operation (-> command .getClass .getSimpleName) :remote true}
        ;; GitHub convention: use "x-access-token" as username when authenticating with a personal access token
        ;; For Gitlab any values can be used as the user name so x-access-token works just as well
        credentials-provider (when token (credentials-provider remote-url token))]
    (analytics/inc! :metabase-remote-sync/git-operations analytics-labels)
    (try
      (-> (doto command
            ;; bound the network operation so a stalled connection can't hang the sync forever (GHY-3727)
            (.setTimeout (int (setting/get :remote-sync-git-timeout-seconds)))
            (.setCredentialsProvider credentials-provider))
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
  Prunes local refs that no longer exist on the remote so deleted branches are reflected locally.

  Throws ExceptionInfo if the fetch operation fails."
  [{:keys [^Git git] :as git-source}]
  (when (some? git)
    (log/info "Fetching repository" {:repo (str git)})
    (u/prog1 (call-remote-command (.. git fetch (setRemoveDeletedRefs true))
                                  git-source)
      (log/info "Successfully fetched repository"))))

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
                                      (.setBare true)) {:token token :remote-url remote-url})
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

  Returns the full commit SHA string, or nil if the commit-ish cannot be resolved — including a full SHA
  whose object is absent from the local clone (e.g. a base commit orphaned by an upstream force-push or
  rebase). JGit parses a complete SHA into an ObjectId without checking the object exists, so the
  existence check is what makes orphaned bases resolve to nil rather than blowing up on a later read."
  [{:keys [^Git git]} ^String commit-ish]
  (let [repo (.getRepository git)]
    (when-let [object-id (.resolve repo commit-ish)]
      (when (.has (.getObjectDatabase repo) object-id)
        (.name object-id)))))

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

(defn changed-files
  "Paths whose blob differs between commit `from-version` and this snapshot's `version`, classified into
  `{:added #{} :modified #{} :deleted #{}}`. jgit prunes unchanged subtrees as it walks, so the cost is
  proportional to the number of changed entries, not the size of the tree.

  Takes a GitSnapshot (:git instance and current :version) and a `from-version` commit-ish to diff against.

  Returns nil when `from-version` cannot be resolved or is no longer present in the local object store
  (e.g. orphaned by a force-push or rebase), signalling the caller to fall back to a full import."
  [{:keys [^Git git ^String version]} ^String from-version]
  (let [^Repository repo (.getRepository git)
        objects (.getObjectDatabase repo)
        old-id (.resolve repo from-version)
        new-id (.resolve repo version)]
    (when (and old-id new-id (.has objects old-id) (.has objects new-id))
      (with-open [rw (RevWalk. repo)
                  ^TreeWalk tw (TreeWalk. repo)]
        (.addTree tw (.getTree (.parseCommit rw old-id)))
        (.addTree tw (.getTree (.parseCommit rw new-id)))
        (.setRecursive tw true)
        (.setFilter tw TreeFilter/ANY_DIFF)
        (let [zero (ObjectId/zeroId)]
          (loop [acc {:added #{} :modified #{} :deleted #{}}]
            (if (.next tw)
              (let [in-old? (not (.equals zero (.getObjectId tw 0)))
                    in-new? (not (.equals zero (.getObjectId tw 1)))
                    bucket  (cond (not in-old?) :added
                                  (not in-new?) :deleted
                                  :else         :modified)]
                (recur (update acc bucket conj (.getPathString tw))))
              acc)))))))

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

(defn- commit-edits!
  "Builds a commit by editing the branch tip's tree in place and pushes it. Seeds an in-core index from
  the parent commit's tree — so every unchanged entry and subtree is carried forward by object id — then
  applies only the edits: whole subtrees named in `delete-dirs` are removed (used to fully replace a
  managed directory), paths in `delete-paths` are removed, and `upserts` (file specs with :path/:content)
  are written as new blobs. `writeTree` only rewrites the subtrees on the path to an edit, so the work is
  proportional to the number of changes rather than the size of the repo.

  Returns the new commit sha. Throws ExceptionInfo if the write or push fails."
  [{:keys [^Git git ^String version ^String branch] :as snapshot} ^String message upserts delete-paths delete-dirs]
  (let [repo       (.getRepository git)
        branch-ref (qualify-branch branch)
        parent-id  (.resolve repo version)]
    (with-open [inserter (.newObjectInserter repo)
                reader   (.newObjectReader repo)
                rev-walk (RevWalk. repo)]
      (let [index (DirCache/newInCore)]
        ;; Seed the index from the parent tree; unchanged entries and subtrees carry forward by id.
        (let [builder (.builder index)]
          (when parent-id
            (.addTree builder (byte-array 0) DirCacheEntry/STAGE_0 reader
                      (.getTree (.parseCommit rev-walk parent-id))))
          (.finish builder))
        ;; Apply only the edits.
        (let [editor (.editor index)]
          (doseq [^String dir delete-dirs]
            (.add editor (DirCacheEditor$DeleteTree. dir)))
          (doseq [^String path delete-paths]
            (.add editor (DirCacheEditor$DeletePath. path)))
          (doseq [{:keys [^String path content]} upserts]
            (let [blob-id (.insert inserter Constants/OBJ_BLOB (.getBytes ^String content "UTF-8"))]
              (.add editor (proxy [DirCacheEditor$PathEdit] [path]
                             (apply [^DirCacheEntry entry]
                               (.setFileMode entry FileMode/REGULAR_FILE)
                               (.setObjectId entry blob-id))))))
          (.finish editor))
        (let [tree-id        (.writeTree index inserter)
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

(defn- write-files!
  "Full export: replace every managed dir wholesale with `files` (managed-dir files not in `files` are
  removed), preserving everything outside the managed dirs."
  [{:keys [managed-dirs] :as snapshot} ^String message files]
  (commit-edits! snapshot message files nil managed-dirs))

(defn- apply-changes!
  "Incremental patch: write `upserts`, remove `delete-paths`, and preserve every other file."
  [snapshot ^String message upserts delete-paths]
  (commit-edits! snapshot message upserts delete-paths nil))

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

(defrecord GitSnapshot [git remote-url branch version token managed-dirs]
  source.p/SourceSnapshot

  (list-files [this]
    (list-files this))

  (read-file [this path]
    (read-file this path))

  (write-files! [this message files]
    (write-files! this message files))

  (apply-changes! [this message upserts delete-paths]
    (apply-changes! this message upserts delete-paths))

  (version [this]
    (:version this))

  source.p/Diffable
  (changed-files* [this from-version]
    (changed-files this from-version)))

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
  (if-let [obj (when (.exists path) (get @jgit (.getPath path)))]
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
      (->GitSnapshot (:git source) (:remote-url source) (:branch source) version (:token source) (:managed-dirs source))
      (throw (ex-info (str "Invalid branch: " (:branch source))
                      {:error-type :missing-branch
                       :branch (:branch source)})))))

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

(defn snapshot-at-version
  "Builds a GitSnapshot for `source` at an already-fetched `version` (commit-ish), or nil if the version
  cannot be resolved against local state (e.g. it was orphaned by a force-push or rebase). Does not fetch."
  [source version]
  (when version
    (when-let [sha (commit-sha source version)]
      (->GitSnapshot (:git source) (:remote-url source) (:branch source) sha (:token source) (:managed-dirs source)))))

(defrecord GitSource [git remote-url branch token managed-dirs]
  source.p/Source
  (branches [source] (branches source))

  (create-branch [source branch-name base-commit-ish]
    (create-branch source branch-name base-commit-ish))

  (default-branch [this]
    (default-branch this))

  (snapshot [this]
    (snapshot this))

  (snapshot-at [this version]
    (snapshot-at-version this version)))

(defn git-source
  "Creates a new GitSource instance for a git repository.

  Takes a URL string (the git repository URL), a branch, an
  optional token string (authentication token for private repositories),
  and a set of managed top-level directory names. Files in managed directories
  are fully replaced during writes — any existing file not in the write set is removed.

  Returns a GitSource record implementing the Source protocol."
  [url branch token managed-dirs]
  (->GitSource (get-jgit (repo-path {:remote-url url :token token}) {:remote-url url :token token})
               url branch token managed-dirs))
