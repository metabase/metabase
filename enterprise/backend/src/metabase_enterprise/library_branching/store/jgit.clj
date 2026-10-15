(ns metabase-enterprise.library-branching.store.jgit
  "A `Store` over JGit. Each store object owns one bare repository in a new owner-only directory under
  `java.io.tmpdir`. It fetches from and pushes to one remote, and `close` removes the directory."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.library-branching.store :as store]
   [metabase.util :as u])
  (:import
   (java.io File)
   (java.net UnknownHostException)
   (java.nio.file Files Path)
   (java.nio.file.attribute FileAttribute PosixFilePermissions)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git)
   (org.eclipse.jgit.dircache DirCache DirCacheBuilder DirCacheEntry)
   (org.eclipse.jgit.errors MissingObjectException NoRemoteRepositoryException TransportException)
   (org.eclipse.jgit.internal JGitText)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode NullProgressMonitor ObjectId ObjectInserter PersonIdent
                         Ref Repository)
   (org.eclipse.jgit.revwalk RevCommit RevWalk)
   (org.eclipse.jgit.revwalk.filter RevFilter)
   (org.eclipse.jgit.transport FetchConnection FetchResult PushResult RefSpec RemoteRefUpdate RemoteRefUpdate$Status
                               Transport URIish UsernamePasswordCredentialsProvider)
   (org.eclipse.jgit.treewalk EmptyTreeIterator TreeWalk)
   (org.eclipse.jgit.treewalk.filter TreeFilter)))

(set! *warn-on-reflection* true)

(def ^:private fetch-spec
  "Every remote branch, into the tracking refs of this store's own repository."
  (RefSpec. "+refs/heads/*:refs/remotes/origin/*"))

(defn- qualify ^String [^String ref]
  (if (str/starts-with? ref "refs/heads/")
    ref
    (str "refs/heads/" ref)))

(defn- owner-only-temp-dir ^File []
  (let [tmp    (.toPath (io/file (System/getProperty "java.io.tmpdir")))
        posix? (contains? (.supportedFileAttributeViews (.getFileSystem tmp)) "posix")
        attrs  (if posix?
                 (into-array FileAttribute [(PosixFilePermissions/asFileAttribute
                                             (PosixFilePermissions/fromString "rwx------"))])
                 (make-array FileAttribute 0))]
    (.toFile (Files/createTempDirectory ^Path tmp "metabase-library-branching-" ^"[Ljava.nio.file.attribute.FileAttribute;" attrs))))

(defn url-error
  "nil when a store may connect to `url`, else the message for the person. Accepted: an https:// URL of any host,
  and an http:// URL, a file:// URL or a local path with no colon."
  [^String url]
  (when-not (or (not (str/includes? url ":"))
                (some #(str/starts-with? url %) ["https://" "http://" "file://"]))
    "Invalid repository URL: only HTTPS URLs are supported (e.g., https://git-host.example.com/yourcompany/repo.git)"))

(defn token-user
  "The user name that the host of `url` expects with an access token as the password."
  [^String url]
  (if (= "bitbucket.org" (some-> (URIish. url) .getHost u/lower-case-en))
    "x-token-auth"
    "x-access-token"))

(defn- credentials-provider [url token]
  (when token
    (UsernamePasswordCredentialsProvider. ^String (token-user url) ^String token)))

(defn- open-transport
  "A new transport to the remote at `url`, with the network timeout and the credentials of every remote call. The
  caller closes it."
  ^Transport [^Repository repo ^String url token timeout-seconds]
  (doto (Transport/open repo (URIish. url))
    (.setTimeout (int timeout-seconds))
    (.setCredentialsProvider (credentials-provider url token))))

(defn- failure-reason
  "The kind of failure of a remote call, from the exception `e` and its causes, or nil."
  [^Throwable e]
  (let [chain         (take-while some? (iterate ex-cause e))
        jgit-text     (JGitText/get)
        auth-messages [(.-notAuthorized jgit-text) (.-noCredentialsProvider jgit-text)
                       (.-authenticationNotSupported jgit-text)]
        auth-failure? (fn [c]
                        (and (instance? TransportException c)
                             (let [message (str (ex-message c))]
                               (some #(str/includes? message %) auth-messages))))]
    (cond
      (some #(instance? NoRemoteRepositoryException %) chain) :not-found
      (some #(instance? UnknownHostException %) chain)        :unreachable
      (some auth-failure? chain)                              :auth-failed)))

(def ^:private failure-messages
  {:auth-failed "Authentication failed: Please check your git credentials"
   :not-found   "Repository not found: Please check the repository URL"
   :unreachable "Network error: Unable to reach git repository host"})

(defn failure-message
  "The message for the person for the `:reason` of the ex-data of a failed remote call, or nil when it has none."
  [reason]
  (failure-messages reason))

(defn- remote-op
  "Calls `(f transport)` on a new transport to the remote, and closes it. Throws an ex-info that names `op` when
  the transport fails; its ex-data has a `:reason` when the failure is of a known kind."
  [^Repository repo ^String url token timeout-seconds op f]
  (try
    (with-open [transport (open-transport repo url token timeout-seconds)]
      (f transport))
    (catch Exception e
      (let [reason (failure-reason e)]
        (throw (ex-info (format "Git %s of %s failed: %s" op url (ex-message e))
                        (cond-> {:operation op :url url} reason (assoc :reason reason))
                        e))))))

(defn- parse-commit ^RevCommit [^RevWalk rw ^String commit]
  (try
    (.parseCommit rw (ObjectId/fromString commit))
    (catch MissingObjectException e
      (throw (ex-info (format "Commit %s is not in the local object store" commit) {:commit commit} e)))))

(defn- file-mode? [^FileMode mode]
  (= FileMode/TYPE_FILE (bit-and (.getBits mode) FileMode/TYPE_MASK)))

(defn- fetch-head [^Repository repo url token timeout-seconds ref]
  (let [^FetchResult result (remote-op repo url token timeout-seconds "fetch"
                                       (fn [^Transport transport]
                                         (.fetch transport NullProgressMonitor/INSTANCE [fetch-spec])))]
    (some-> (.getAdvertisedRef result (qualify ref)) ^Ref identity .getObjectId .name)))

(defn- remote-refs
  "{ref-name Ref} of the refs that the remote advertises now."
  [^Repository repo url token timeout-seconds]
  (remote-op repo url token timeout-seconds "ls-remote"
             (fn [^Transport transport]
               (with-open [^FetchConnection conn (.openFetch transport)]
                 (into {} (.getRefsMap conn))))))

(defn- branch-name [^String ref]
  (when (str/starts-with? ref Constants/R_HEADS)
    (subs ref (count Constants/R_HEADS))))

(defn- branches* [repo url token timeout-seconds]
  (into (sorted-set) (keep branch-name) (keys (remote-refs repo url token timeout-seconds))))

(defn- default-branch* [repo url token timeout-seconds]
  (let [refs      (remote-refs repo url token timeout-seconds)
        ^Ref head (get refs Constants/HEAD)]
    ;; a remote advertises no HEAD that names a ref that does not exist
    (when (and head (.isSymbolic head))
      (branch-name (.getName (.getTarget head))))))

(defn- read-tree* [^Repository repo commit]
  (with-open [rw (RevWalk. repo)
              tw (TreeWalk. repo)]
    (.addTree tw (.getTree (parse-commit rw commit)))
    (.setRecursive tw true)
    (let [reader (.getObjectReader tw)]
      (loop [acc (transient {})]
        (if (.next tw)
          (recur (if (file-mode? (.getFileMode tw 0))
                   (assoc! acc (.getPathString tw) (.getBytes (.open reader (.getObjectId tw 0))))
                   acc))
          (persistent! acc))))))

(defn- changed-paths* [^Repository repo from to]
  (with-open [rw (RevWalk. repo)
              tw (TreeWalk. repo)]
    (if from
      (.addTree tw (.getTree (parse-commit rw from)))
      (.addTree tw (EmptyTreeIterator.)))
    (.addTree tw (.getTree (parse-commit rw to)))
    (.setRecursive tw true)
    (.setFilter tw TreeFilter/ANY_DIFF)
    (loop [acc {:added #{} :modified #{} :deleted #{}}]
      (if (.next tw)
        (let [in-from? (file-mode? (.getFileMode tw 0))
              in-to?   (file-mode? (.getFileMode tw 1))]
          (recur (cond
                   (and in-from? in-to?) (update acc :modified conj (.getPathString tw))
                   in-to?                (update acc :added conj (.getPathString tw))
                   in-from?              (update acc :deleted conj (.getPathString tw))
                   :else                 acc)))
        acc))))

(defn- directories
  "The directories of `path`: \"a/b/c\" gives (\"a\" \"a/b\")."
  [^String path]
  (let [parts (str/split path #"/")]
    (map #(str/join "/" (take % parts)) (range 1 (count parts)))))

(defn- check-tree! [tree]
  (let [paths (set (keys tree))]
    (doseq [path paths
            dir  (directories path)
            :when (contains? paths dir)]
      (throw (ex-info (format "Path %s is a file and a directory of %s" dir path) {:path path :directory dir})))))

(defn- tree-entry ^DirCacheEntry [^ObjectInserter inserter ^String path ^bytes content]
  (let [^DirCacheEntry entry (try
                               (DirCacheEntry. path)
                               (catch IllegalArgumentException e
                                 (throw (ex-info (format "Invalid path %s" (pr-str path)) {:path path} e))))]
    (doto entry
      (.setFileMode FileMode/REGULAR_FILE)
      (.setObjectId (.insert inserter Constants/OBJ_BLOB content)))))

(defn- write-commit* [^Repository repo parents tree ^String message]
  (check-tree! tree)
  (with-open [inserter (.newObjectInserter repo)
              rw       (RevWalk. repo)]
    (let [parent-ids (mapv #(parse-commit rw %) parents)
          index      (DirCache/newInCore)
          ^DirCacheBuilder builder (.builder index)]
      ;; `finish` sorts the entries in git order
      (doseq [[path content] tree]
        (.add builder (tree-entry inserter path content)))
      (.finish builder)
      (let [ident   (PersonIdent. "Metabase Library" "library@metabase.com")
            commit  (doto (CommitBuilder.)
                      (.setTreeId (.writeTree index inserter))
                      (.setAuthor ident)
                      (.setCommitter ident)
                      (.setMessage message))]
        (doseq [^RevCommit parent parent-ids]
          (.addParentId commit parent))
        (let [id (.insert inserter commit)]
          (.flush inserter)
          (.name id))))))

(defn- cas-ref!* [^Repository repo url token timeout-seconds ref ^String expected ^String new]
  ;; JGit refuses the update when the advertised ref is not `expected` (REJECTED_REMOTE_CHANGED), and sends
  ;; `expected` as the old id of the push command, so the receiving side checks it again under its ref lock.
  ;; Forced: the expected id is the only condition, so a move that is not a fast-forward is allowed.
  (let [ref        (qualify ref)
        update     (RemoteRefUpdate. repo nil (ObjectId/fromString new) ref true nil
                                     (if expected (ObjectId/fromString expected) (ObjectId/zeroId)))
        ^PushResult result (remote-op repo url token timeout-seconds "push"
                                      (fn [^Transport transport]
                                        (.push transport NullProgressMonitor/INSTANCE [update])))
        remote     (.getRemoteUpdate result ref)
        advertised (some-> (.getAdvertisedRef result ref) .getObjectId .name)
        status     (.getStatus remote)]
    (condp = status
      RemoteRefUpdate$Status/OK                      :ok
      ;; the remote is at `new` already; that is a move only when it is also at `expected`
      RemoteRefUpdate$Status/UP_TO_DATE              (if (= expected advertised) :ok {:moved advertised})
      RemoteRefUpdate$Status/REJECTED_REMOTE_CHANGED {:moved advertised}
      ;; the receiving side refused it: when the ref moved after the advertisement, that is a lost race
      (let [actual (fetch-head repo url token timeout-seconds ref)]
        (if (not= expected actual)
          {:moved actual}
          (throw (ex-info (format "Git push of %s to %s failed: %s %s" ref url status (.getMessage remote))
                          {:ref ref :status status :message (.getMessage remote)})))))))

(defn- ancestor?* [^Repository repo a b]
  (with-open [rw (RevWalk. repo)]
    (.isMergedInto rw (parse-commit rw a) (parse-commit rw b))))

(defn- merge-base* [^Repository repo a b]
  (with-open [rw (RevWalk. repo)]
    (.setRevFilter rw RevFilter/MERGE_BASE)
    (.markStart rw (parse-commit rw a))
    (.markStart rw (parse-commit rw b))
    (some-> (.next rw) .name)))

;; A deftype and not a record: a record prints its fields, and one field is the token.
(deftype JGitStore [^Git git ^File dir url token timeout-seconds]
  store/Store
  (head [_ ref]
    (fetch-head (.getRepository git) url token timeout-seconds ref))
  (branches [_]
    (branches* (.getRepository git) url token timeout-seconds))
  (default-branch [_]
    (default-branch* (.getRepository git) url token timeout-seconds))
  (read-tree [_ commit]
    (read-tree* (.getRepository git) commit))
  (changed-paths [_ from to]
    (changed-paths* (.getRepository git) from to))
  (write-commit [_ parents tree message]
    (write-commit* (.getRepository git) parents tree message))
  (cas-ref! [_ ref expected new]
    (cas-ref!* (.getRepository git) url token timeout-seconds ref expected new))
  (ancestor? [_ a b]
    (ancestor?* (.getRepository git) a b))
  (merge-base [_ a b]
    (merge-base* (.getRepository git) a b))
  (close [_]
    (.close git)
    (FileUtils/deleteDirectory dir)))

(defn directory
  "The local directory of `store`."
  ^File [^JGitStore store]
  (.dir store))

(defn open-store
  "A new JGitStore on the remote at `url`, with an empty local repository. Options: `:token` (an access token,
  sent as the password of the user that `token-user` names) and `:timeout-seconds`, the network timeout of each
  remote call (default 60). Throws when `url-error` refuses `url`. The caller must `close` it."
  [url & {:keys [token timeout-seconds] :or {timeout-seconds 60}}]
  (when-let [message (url-error url)]
    (throw (ex-info message {:url url})))
  (let [dir (owner-only-temp-dir)
        git (try
              (let [git (-> (Git/init) (.setBare true) (.setDirectory dir) (.call))]
                (doto (.getConfig (.getRepository git))
                  ;; A fetch starts an automatic gc, by default on another thread, which races with `close`
                  (.setInt "gc" nil "auto" 0)
                  (.setInt "gc" nil "autoPackLimit" 0)
                  (.setBoolean "gc" nil "autoDetach" false)
                  ;; A push runs the pre-push hook of `core.hooksPath`. This repository's own value overrides the
                  ;; user's and the system's, and names a directory that is never created.
                  (.setString "core" nil "hooksPath" (.getAbsolutePath (io/file dir "no-hooks")))
                  (.save))
                git)
              (catch Throwable e
                (FileUtils/deleteDirectory dir)
                (throw e)))]
    (->JGitStore git dir url token timeout-seconds)))
