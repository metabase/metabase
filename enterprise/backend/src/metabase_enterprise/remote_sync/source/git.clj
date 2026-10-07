(ns metabase-enterprise.remote-sync.source.git
  (:require
   [clojure.string :as str]
   [metabase-enterprise.remote-sync.source.clone-registry :as clone-registry]
   [metabase-enterprise.remote-sync.source.protocol :as source.p]
   [metabase.analytics-interface.core :as analytics]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.net URI)
   (org.eclipse.jgit.api Git GitCommand PushCommand TransportCommand TransportConfigCallback)
   (org.eclipse.jgit.dircache DirCache DirCacheBuilder DirCacheEditor DirCacheEditor$DeletePath
                              DirCacheEditor$DeleteTree DirCacheEditor$PathEdit DirCacheEntry)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode ObjectId PersonIdent ProgressMonitor Ref Repository)
   (org.eclipse.jgit.lib ObjectInserter ObjectReader)
   (org.eclipse.jgit.revwalk RevCommit RevTree RevWalk)
   (org.eclipse.jgit.transport PushResult RefSpec RemoteConfig RemoteRefUpdate
                               RemoteRefUpdate$Status Transport Transport$Operation URIish
                               UsernamePasswordCredentialsProvider)
   (org.eclipse.jgit.treewalk TreeWalk)
   (org.eclipse.jgit.treewalk.filter TreeFilter)
   (org.eclipse.jgit.util FS FS_POSIX FS_Win32_Cygwin ProcessResult ProcessResult$Status)))

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
             ;; the data of the root cause, for example a URL refusal, stays readable on the thrown exception
             (merge (ex-data root-ex) {:remote remote?})
             root-ex)))

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

(defn- check-transport-url!
  "Throws unless `transport` goes to `remote-url`. The error names both URLs, without a password, and the remedy.
  `clone-dir` is the directory of the clone that runs the command, or nil."
  [^Transport transport ^String remote-url ^File clone-dir]
  ;; URIish/toString leaves out the password.
  (let [expected (some-> remote-url URIish.)
        uri      (.getURI transport)]
    (when-not (= expected uri)
      (throw (ex-info (str "Remote sync sends git commands only to the URL of the remote-sync-url setting, " expected
                           ". The git config sends this command to " uri " instead."
                           " Remove each remote or url entry that names another URL from the git config"
                           (when clone-dir (str " of the clone " clone-dir))
                           ", or restart Metabase to make a new clone. Then try again.")
                      {:reason :transport-url :url (str expected) :transport-url (str uri)})))))

(defn- remote-transport-config
  "The transport callback of a remote command to `remote-url` from the clone in `clone-dir` (nil for none). It throws
  unless the transport goes to `remote-url`, and sets the default upload-pack and receive-pack programs."
  ^TransportConfigCallback [^String remote-url ^File clone-dir]
  ;; JGit picks the URL of a transport, and reads the remote.<name>.uploadpack and receivepack keys, from the git config
  ;; when it opens the transport. The URL can come from remote.<name>.url or pushurl, or from a url.<base>.insteadOf or
  ;; pushInsteadOf rewrite. For a file:// remote or a plain path, JGit runs any pack program other than the default. The
  ;; callback runs after the transport is open and before it connects, so it sees the URL that the command would use.
  (reify TransportConfigCallback
    (configure [_ transport]
      (check-transport-url! transport remote-url clone-dir)
      (.setOptionUploadPack transport RemoteConfig/DEFAULT_UPLOAD_PACK)
      (.setOptionReceivePack transport RemoteConfig/DEFAULT_RECEIVE_PACK))))

(defn- check-push-transports!
  "Throws unless each transport that `command` pushes to goes to `remote-url`. Opens no connection. `clone-dir` is the
  directory of the clone that runs the command."
  [^PushCommand command ^String remote-url ^File clone-dir]
  ;; A push goes to each push URL in turn, and JGit calls the transport callback just before each one. So the callback
  ;; alone refuses a second push URL only after the push to the first one.
  (let [transports (Transport/openAll (.getRepository command) (.getRemote command) Transport$Operation/PUSH)]
    (try
      (run! #(check-transport-url! % remote-url clone-dir) transports)
      (finally
        (run! #(.close ^Transport %) transports)))))

(defn- call-remote-command [^TransportCommand command {:keys [^String token ^String remote-url]}]
  (let [analytics-labels {:operation (-> command .getClass .getSimpleName) :remote true}
        ;; GitHub convention: use "x-access-token" as username when authenticating with a personal access token
        ;; For Gitlab any values can be used as the user name so x-access-token works just as well
        credentials-provider (when token (credentials-provider remote-url token))
        clone-dir            (some-> (.getRepository command) .getDirectory)]
    (analytics/inc! :metabase-remote-sync/git-operations analytics-labels)
    (try
      (doto command
        ;; bound the network operation so a stalled connection can't hang the sync forever (GHY-3727)
        (.setTimeout (int (setting/get :remote-sync-git-timeout-seconds)))
        (.setCredentialsProvider credentials-provider)
        ;; refuse a URL other than the setting, and run no program that the git config names
        (.setTransportConfigCallback (remote-transport-config remote-url clone-dir)))
      (when (instance? PushCommand command)
        (check-push-transports! command remote-url clone-dir))
      (.call command)
      (catch Exception e
        (analytics/inc! :metabase-remote-sync/git-operations-failed analytics-labels)
        (throw (clean-git-exception e command true))))))

(defn- qualify-branch [branch]
  (if (str/starts-with? branch "refs/heads/")
    branch
    (str "refs/heads/" branch)))

(defn fetch!
  "Fetches updates from the remote git repository.

  Takes a git-source map containing a :git Git instance, its :remote-url and optional :token for authentication.
  Returns the result of the git fetch operation. Uses the 'origin' remote of the clone.
  Prunes local refs that no longer exist on the remote so deleted branches are reflected locally.

  Throws ExceptionInfo if the fetch operation fails, or if the git config sends it to a URL other than :remote-url."
  [{:keys [^Git git] :as git-source}]
  (when (some? git)
    (log/info "Fetching repository" {:repo (str git)})
    (u/prog1 (call-remote-command (.. git fetch (setRemoveDeletedRefs true))
                                  git-source)
      (log/info "Successfully fetched repository"))))

(defn- ref-branch-names
  "Sorted branch names (without 'refs/heads/') among the `refs` returned by an lsRemote."
  [refs]
  (->> refs
       (filter #(str/starts-with? (.getName ^Ref %) "refs/heads/"))
       (remove #(.isSymbolic ^Ref %))
       (map #(str/replace-first (.getName ^Ref %) "refs/heads/" ""))
       sort))

(defn- branch-without-head
  "For the `refs` returned by an lsRemote of a remote that advertises no HEAD, the branch that stands in for HEAD: the
  first of its branches. Nil when the remote advertises HEAD, or has no branches.

  A remote with branches can advertise no HEAD, for example a bare repository whose HEAD names `master` when only
  `main` was pushed. A clone of such a remote (see [[clone-repository!]]) and its default branch (see
  [[ref-head-branch]]) both use this branch, so they agree."
  [refs]
  (when-not (some #(= Constants/HEAD (.getName ^Ref %)) refs)
    (first (ref-branch-names refs))))

(defn- ls-remote-refs
  "The refs of the repository at `remote-url`, from one lsRemote with the optional `token`."
  [{:keys [^String remote-url] :as remote}]
  ;; not `setHeads true`: that would filter out the symbolic HEAD ref that [[ref-head-branch]] reads
  (call-remote-command (-> (Git/lsRemoteRepository)
                           (.setRemote remote-url))
                       remote))

(defn- clone-failure
  "The exception for a clone of `remote-url` into `dir` that failed with `e`."
  [^Exception e remote-url ^File dir]
  (ex-info (format "Failed to clone git repository: %s" (ex-message e))
           {:url       remote-url
            :repo-path dir
            :error     (.getMessage e)}
           e))

(defmacro ^:private no-hooks-proxy
  "A proxy of the JGit file system class `klass`, with the settings of the file system `fs`, that finds and runs no git
  hook."
  [klass fs]
  `(proxy [~klass] [~fs]
     ;; JGit can copy a file system with newInstance; a copy of the class runs hooks.
     (~'newInstance [] ~'this)
     (~'findHook [~'_repository ~'_hook-name] nil)
     (~'runHookIfPresent
       ([~'_repository ~'_hook-name ~'_args]
        (ProcessResult. ProcessResult$Status/NOT_PRESENT))
       ([~'_repository ~'_hook-name ~'_args ~'_out ~'_err ~'_stdin]
        (ProcessResult. ProcessResult$Status/NOT_PRESENT)))))

(defn- no-hooks-fs-of
  "For the JGit file system `fs`, the file system of the clones of remote sync: a file system of the same class that
  finds and runs no git hook."
  ^FS [^FS fs]
  ;; FS_POSIX and FS_Win32_Cygwin are the JGit file systems that run hooks. FS_Win32 and the base FS run none.
  (cond
    (instance? FS_POSIX fs)        (no-hooks-proxy FS_POSIX fs)
    (instance? FS_Win32_Cygwin fs) (no-hooks-proxy FS_Win32_Cygwin fs)
    :else                          fs))

(def ^:private no-hooks-fs
  "A delay of the JGit file system of the clones of remote sync. A repository with this file system runs no git hook."
  ;; Metabase puts no hook in its clones, and a clone gets no hook from its remote. So a hook in a clone comes from a
  ;; write into the clone, and remote sync does not run it. The `core.hooksPath` setting is not used for this: it is in
  ;; the config file of the clone, which the same write can change.
  (delay (no-hooks-fs-of FS/DETECTED)))

(defn- clone-repository!
  "Clones every branch of the repository at `remote-url` with the optional `token` into the new directory `dir`, as a
  bare clone, and returns its Git instance. A remote that advertises no HEAD is cloned too. The clone runs no git hook.

  Throws \"Cannot connect to uninitialized repository\" for a remote with no branch, before any clone. Throws
  ExceptionInfo if the remote or the clone fails, for example on a network error, an invalid URL or a rejected token."
  [^File dir {:keys [^String remote-url ^String token]}]
  (log/info "Cloning repository" {:url remote-url :repo-path dir})
  ;; One lsRemote tells whether the remote has a branch, and gives the branch to clone when it advertises no HEAD.
  (let [args {:token token :remote-url remote-url}
        refs (try
               (ls-remote-refs args)
               (catch Exception e
                 (throw (clone-failure e remote-url dir))))]
    (when (empty? (ref-branch-names refs))
      (throw (ex-info "Cannot connect to uninitialized repository" {:url remote-url})))
    (try
      (let [command (-> (Git/cloneRepository)
                        (.setDirectory dir)
                        (.setURI remote-url)
                        (.setBare true)
                        (.setFs ^FS @no-hooks-fs))]
        ;; A JGit clone first fetches the branch that it is given (by default HEAD), and fails when the remote does not
        ;; advertise that ref. Nothing reads the HEAD of the bare clone, so the branch has no other effect.
        (when-let [branch (branch-without-head refs)]
          (.setBranch command (qualify-branch branch)))
        (u/prog1 (call-remote-command command args)
          (log/info "Successfully cloned repository" {:repo-path dir})))
      (catch Exception e
        (throw (clone-failure e remote-url dir))))))

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

(defn- tree-children
  "Paths of the entries at the walk's current depth, consuming the walk. `next` climbs back out of a
  subtree once it's exhausted, so a drop in depth is what marks the end of the children.

  Sorted rather than left in tree order: git orders a tree's entries as if directories ended in `/`, so
  raw order puts a sibling `a-b` before the directory `a` (`\\-` < `\\/`). Sorting gives plain
  lexicographic order instead — the one rule the flat snapshots can honour too, since they have no tree
  order to inherit."
  [^TreeWalk tree-walk]
  (let [depth (.getDepth tree-walk)]
    (loop [paths []]
      (if (and (.next tree-walk) (= depth (.getDepth tree-walk)))
        (recur (conj paths (.getPathString tree-walk)))
        (vec (sort paths))))))

(defn list-dir
  "Lists the immediate children of one directory in the git repository at the snapshot.

  Takes a GitSnapshot containing a :git Git instance and :version specifying which commit to read, and a
  repo-root relative directory path (no trailing slash).

  Resolves the commit's root tree, looks `path` up in it and reads that single tree object, iterating its
  entries non-recursively — so the cost is proportional to the depth of `path` plus the number of entries
  it holds, not to the size of the repository. The clone is bare (git objects, no working tree), which is
  exactly what this walks.

  `.isSubtree` is what makes a non-directory return `[]`: a symlink and a submodule are entries with
  their own modes, not trees, so neither can be descended into (and a submodule's tree isn't in this
  repository at all).

  See [[metabase-enterprise.remote-sync.source.protocol/list-dir]] for the contract this implements and
  why it takes the shape it does."
  [{:keys [^Git git ^String version]} ^String path]
  (let [repo (.getRepository git)]
    (with-open [rev-walk (RevWalk. repo)]
      (or (when-let [commit-id (.resolve repo version)]
            (let [tree (.getTree (.parseCommit rev-walk commit-id))]
              (if (str/blank? path)
                (with-open [^TreeWalk tree-walk (TreeWalk. repo)]
                  (.addTree tree-walk tree)
                  (tree-children tree-walk))
                ;; one binary search per path segment down to the entry, then a single tree object read
                (when-let [found (TreeWalk/forPath repo path tree)]
                  (with-open [^TreeWalk tree-walk found]
                    (when (.isSubtree tree-walk)
                      (.enterSubtree tree-walk)
                      (tree-children tree-walk)))))))
          []))))

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

(def ^:private commit-progress-checkpoint
  "Export progress fraction reported once the local commit is durable, just before the network push begins."
  0.8)

(def ^:private push-progress-start
  "Progress fraction at which the network push begins."
  0.8)

(def ^:private push-progress-end
  "Progress fraction the network push approaches as it completes; the final 1.0 is reported elsewhere."
  0.99)

(defn- ->push-progress-monitor
  "A JGit ProgressMonitor that maps the client-side \"Writing objects\" phase onto
  [push-progress-start, push-progress-end] and calls `report-progress` (a 1-arg fraction fn) on every
  `update` tick — even outside the writing phase, falling back to `push-progress-start` — so the push
  always heartbeats regardless of JVM locale (which can rename or suppress the \"Writing objects\" title)
  or an unknown (zero) total. Upstream throttling/monotonicity is handled by the reporter, so the repeated
  fallback values are cheap and safe."
  ^ProgressMonitor [report-progress]
  (let [writing? (volatile! false)
        total    (volatile! 0)
        done     (volatile! 0)
        report!  (fn []
                   (report-progress
                    (if (and @writing? (pos? @total))
                      (+ push-progress-start
                         (* (- push-progress-end push-progress-start)
                            (min 1.0 (/ (double @done) @total))))
                      push-progress-start)))]
    (reify ProgressMonitor
      (start [_ _total-tasks])
      (beginTask [_ title tot]
        (vreset! writing? (= title "Writing objects"))
        (vreset! total (max 0 tot))
        (vreset! done 0)
        (report!))
      (update [_ completed]
        (vswap! done + completed)
        (report!))
      (endTask [_]
        (vreset! writing? false))
      (isCancelled [_] false)
      (showDuration [_ _]))))

(defn push-branch!
  "Pushes a local branch to the remote repository. Optional `progress-monitor` (a JGit ProgressMonitor)
  reports push progress.

  Takes a git-source map containing a :git Git instance, its :remote-url, :branch, and optional :token for
  authentication. Uses the 'origin' remote of the clone.

  Returns the push response from JGit. Throws ExceptionInfo if the push operation fails or returns a
  non-OK/UP_TO_DATE status. Throws ExceptionInfo, and pushes to no URL, if the git config sends the push to any URL
  other than :remote-url."
  ([git-source] (push-branch! git-source nil))
  ([{:keys [^Git git ^String branch] :as git-source} ^ProgressMonitor progress-monitor]
   (let [branch-name (qualify-branch branch)
         push-cmd    (cond-> (-> (.push git)
                                 ;; with no remote, JGit takes the push remote from the git config
                                 (.setRemote Constants/DEFAULT_REMOTE_NAME)
                                 (.setRefSpecs (doto (java.util.ArrayList.)
                                                 (.add (RefSpec. (str branch-name ":" branch-name))))))
                       progress-monitor (.setProgressMonitor progress-monitor))
         push-response (call-remote-command push-cmd git-source)
         push-results  (->> push-response
                            (map #(into [] (.getRemoteUpdates ^PushResult %)))
                            flatten)]
     (when-let [failures (seq (remove #(#{RemoteRefUpdate$Status/OK RemoteRefUpdate$Status/UP_TO_DATE} %)
                                      (map #(.getStatus ^RemoteRefUpdate %) push-results)))]
       (throw (ex-info (str "Failed to push branch " branch-name " to remote") {:failures failures})))
     push-response)))

(defn- remote-refs
  "The refs of `remote`: the answer that a [[git-remote]] holds, else the answer of a new lsRemote."
  [{:keys [refs] :as remote}]
  (if refs
    @refs
    (ls-remote-refs remote)))

(defn- ref-head-branch
  "The branch (without 'refs/heads/') that the symbolic HEAD among the `refs` returned by an lsRemote points at. For a
  remote that advertises no HEAD, the branch that a clone of it gets (see [[branch-without-head]]). Throws
  ExceptionInfo if there is none."
  [refs]
  (let [head-ref (first (filter #(= "HEAD" (.getName ^Ref %)) refs))]
    (or (when head-ref
          (when (.isSymbolic ^Ref head-ref)
            (when-let [target (.getTarget ^Ref head-ref)]
              (str/replace-first (.getName ^Ref target) "refs/heads/" ""))))
        (branch-without-head refs)
        (throw (ex-info "Failed to get a default branch for git repository." {:head-ref head-ref})))))

(defn default-branch
  "The default branch name (without 'refs/heads/') of the repository at `remote-url`, read from the remote with the
  optional `token`, or from the answer that a [[git-remote]] holds. Needs no local clone. Throws ExceptionInfo if no
  default branch is found."
  [remote]
  (ref-head-branch (remote-refs remote)))

(defn- close-commit-resources! [inserter reader rev-walk]
  (.close ^ObjectInserter inserter)
  (.close ^ObjectReader reader)
  (.close ^RevWalk rev-walk))

(defn- written-tree-id
  "Finalize the editor and write the staged tree, memoizing it in `tree-id` so repeated calls (e.g.
  `empty-commit?` then `finish-commit!`) finalize and write the tree only once."
  ^ObjectId [{:keys [^DirCacheEditor editor ^DirCache index ^ObjectInserter inserter tree-id]}]
  (or @tree-id
      (do (.finish editor)
          (reset! tree-id (.writeTree index inserter)))))

;; A commit being built incrementally against a GitSnapshot. Holds the open JGit resources (inserter, reader,
;; rev-walk) and the in-core index/editor; blobs are inserted as files are staged and the tree is written and
;; pushed at finish. Edits the branch tip's tree in place — unchanged entries/subtrees carry forward by object
;; id — so writeTree's work is proportional to the number of changes, not the repo size.
(defrecord GitCommit [snapshot inserter reader rev-walk index editor parent-id parent-tree-id tree-id]
  source.p/CommitBuilder
  (stage-upsert! [_ {:keys [^String path content]}]
    (let [blob-id (.insert ^ObjectInserter inserter Constants/OBJ_BLOB (.getBytes ^String content "UTF-8"))]
      (.add ^DirCacheEditor editor
            (proxy [DirCacheEditor$PathEdit] [path]
              (apply [^DirCacheEntry entry]
                (.setFileMode entry FileMode/REGULAR_FILE)
                (.setObjectId entry blob-id)))))
    nil)

  (stage-delete! [_ path]
    (.add ^DirCacheEditor editor (DirCacheEditor$DeletePath. ^String path))
    nil)

  (replace-all! [_]
    (doseq [^String dir (:managed-dirs snapshot)]
      (.add ^DirCacheEditor editor (DirCacheEditor$DeleteTree. dir)))
    nil)

  (empty-commit? [this]
    (boolean (when parent-tree-id
               (.equals (written-tree-id this) ^ObjectId parent-tree-id))))

  (finish-commit! [this message]
    (source.p/finish-commit! this message nil))

  (finish-commit! [this message report-progress]
    (let [^Git git   (:git snapshot)
          repo       (.getRepository git)
          branch-ref (qualify-branch (:branch snapshot))
          tree-id    (written-tree-id this)
          commit-builder (doto (CommitBuilder.)
                           (.setTreeId tree-id)
                           (.setAuthor (PersonIdent. "Metabase Library" "library@metabase.com"))
                           (.setCommitter (PersonIdent. "Metabase Library" "library@metabase.com"))
                           (.setMessage ^String message))]
      (when parent-id
        (.setParentId commit-builder parent-id))
      (let [commit-id (.insert ^ObjectInserter inserter commit-builder)]
        (.flush ^ObjectInserter inserter)
        (doto (.updateRef repo branch-ref)
          (.setNewObjectId commit-id)
          (.update))
        ;; local commit durable; push about to start — force this one-shot checkpoint past the throttle
        (when report-progress (report-progress commit-progress-checkpoint {:force? true}))
        (push-branch! snapshot (when report-progress (->push-progress-monitor report-progress)))
        (close-commit-resources! inserter reader rev-walk)   ; close only after a successful push
        (.name commit-id))))

  (abort-commit! [_]
    (close-commit-resources! inserter reader rev-walk)
    nil))

(defn- open-commit*
  "Begin a GitCommit against `snapshot`, seeding the in-core index from the parent tree."
  [{:keys [^Git git ^String version] :as snapshot}]
  (let [repo        (.getRepository git)
        parent-id   (.resolve repo version)
        inserter    (.newObjectInserter repo)
        reader      (.newObjectReader repo)
        rev-walk    (RevWalk. repo)
        index       (DirCache/newInCore)
        parent-tree (when parent-id (.getTree (.parseCommit rev-walk parent-id)))]
    (let [^DirCacheBuilder builder (.builder index)]
      (when parent-tree
        (.addTree builder (byte-array 0) DirCacheEntry/STAGE_0 reader ^RevTree parent-tree))
      (.finish builder))
    (->GitCommit snapshot inserter reader rev-walk index (.editor index) parent-id
                 (when parent-tree (.copy ^RevTree parent-tree)) (atom nil))))

(defn branches
  "The branch names (without 'refs/heads/') of the repository at `remote-url`, read from the remote with the optional
  `token`, or from the answer that a [[git-remote]] holds, sorted. Needs no local clone."
  [remote]
  (ref-branch-names (remote-refs remote)))

;; `refs` is a delay of the one lsRemote that answers every question of this remote.
(defrecord GitRemote [remote-url token refs]
  source.p/Remote
  (branches [this]
    (branches this))

  (default-branch [this]
    (default-branch this)))

(defn git-remote
  "The [[source.p/Remote]] for the git repository at `url`, authenticated with the optional `token`. Makes no network
  call and no clone. Its first question asks the remote with one lsRemote; it answers every question from that one
  answer."
  [url token]
  (->GitRemote url token (delay (ls-remote-refs {:remote-url url :token token}))))

(defn- delete-branches-without-remote!
  [{:keys [^Git git] :as source}]
  (let [remote-branch-set (set (branches source))
        local-refs (call-command (.branchList git))
        branches-to-delete (keep (fn [^Ref ref]
                                   (let [branch-name (str/replace-first (.getName ref) "refs/heads/" "")]
                                     (when (not (remote-branch-set branch-name))
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

  (list-dir [this path]
    (list-dir this path))

  (read-file [this path]
    (read-file this path))

  (open-commit [this]
    (open-commit* this))

  (version [this]
    (:version this))

  source.p/Diffable
  (changed-files* [this from-version]
    (changed-files this from-version)))

(defn- stale-cache-error?
  "Returns true if the exception indicates a stale git cache (e.g., after a force-push on the remote)."
  [^Exception e]
  (some-> (ex-message e) (str/includes? "Missing commit")))

(defn- clone-job
  "The function that clones the repository at `url` with `token` into a new directory, for [[clone-registry/acquire!]]."
  [url token]
  (fn [dir]
    (clone-repository! dir {:remote-url url :token token})))

(defn- recover-stale-clone!
  "Recovers `source` from a stale clone (see [[stale-cache-error?]]). Retires the generation that `source` read, unless
  a concurrent recovery did, and adds the next generation of its URL to its lease. Returns `source` on that generation.

  The retired clone stays while a lease holds it: another operation, or this source object, can still read it."
  [{:keys [remote-url token lease generation] :as source}]
  (log/info "Re-cloning stale git cache" {:url remote-url :generation generation})
  (let [registry         (clone-registry/process-registry)
        _                (clone-registry/retire! registry remote-url generation)
        {:keys [id git]} (clone-registry/acquire! registry lease (clone-job remote-url token))]
    (assoc source :git git :generation id)))

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
  [source]
  (try
    (snapshot* source)
    (catch Exception e
      (if (stale-cache-error? e)
        (let [fresh-source (recover-stale-clone! source)]
          (log/info "Retrying snapshot after re-cloning stale cache")
          (snapshot* fresh-source))
        (throw e)))))

(defn snapshot-at-version
  "Builds a GitSnapshot for `source` at an already-fetched `version` (commit-ish), or nil if the version
  cannot be resolved against local state (e.g. it was orphaned by a force-push or rebase). Does not fetch."
  [source version]
  (when version
    (when-let [sha (commit-sha source version)]
      (->GitSnapshot (:git source) (:remote-url source) (:branch source) sha (:token source) (:managed-dirs source)))))

(defn- on-newest-clone
  "`source` on the Git instance of the newest generation that its lease holds. Unchanged when the lease holds none."
  [{:keys [lease] :as source}]
  ;; A recovery returns a copy of the source on a new generation, and the caller can keep the original. A commit on a
  ;; snapshot of the copy is only in the new generation, so a read of that commit through the original needs it.
  (if-let [git (some->> lease (clone-registry/lease-git (clone-registry/process-registry)))]
    (assoc source :git git)
    source))

;; A GitSource also answers the remote questions, from its URL and token, as a GitRemote does. `lease` is its lease in
;; the clone registry, and `generation` is the id of the generation whose Git instance is `git`. A recovery returns a
;; copy with the same lease, so a close of either one releases every generation of the lease, and `snapshot-at` of
;; either one reads the newest generation of the lease.
(defrecord GitSource [git remote-url branch token managed-dirs lease generation]
  java.io.Closeable
  (close [_]
    (clone-registry/release! (clone-registry/process-registry) lease))

  source.p/Remote
  (branches [this]
    (branches this))

  (default-branch [this]
    (default-branch this))

  source.p/Source
  (create-branch [source branch-name base-commit-ish]
    (create-branch source branch-name base-commit-ish))

  (snapshot [this]
    (snapshot this))

  (snapshot-at [this version]
    (snapshot-at-version (on-newest-clone this) version)))

(defn git-source
  "Creates a new GitSource instance for a git repository.

  Takes a URL string (the git repository URL), a branch, an
  optional token string (authentication token for private repositories),
  and a set of managed top-level directory names. Files in managed directories
  are fully replaced during writes — any existing file not in the write set is removed.

  Returns a GitSource record implementing the Source protocol. Its lease holds a clone of `url` in the clone registry
  of this process. The first use of `url` in the process clones the repository.

  The caller closes the source when it reads neither the source nor a snapshot of it any more. The close releases the
  lease. A clone that a stale-cache recovery retired is deleted when no lease holds it. A second close does nothing."
  [url branch token managed-dirs]
  (let [lease            (clone-registry/new-lease url)
        {:keys [id git]} (clone-registry/acquire! (clone-registry/process-registry) lease (clone-job url token))]
    (->GitSource git url branch token managed-dirs lease id)))
