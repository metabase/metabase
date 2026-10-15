(ns metabase-enterprise.library-branching.store.jgit
  "A `Store` over JGit. Each store object owns one bare repository in a new owner-only directory under
  `java.io.tmpdir`. It fetches from and pushes to one remote, and `close` removes the directory."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase-enterprise.library-branching.store :as store])
  (:import
   (java.io File)
   (java.nio.file Files Path)
   (java.nio.file.attribute FileAttribute PosixFilePermissions)
   (org.apache.commons.io FileUtils)
   (org.eclipse.jgit.api Git)
   (org.eclipse.jgit.dircache DirCache DirCacheBuilder DirCacheEntry)
   (org.eclipse.jgit.errors MissingObjectException)
   (org.eclipse.jgit.lib CommitBuilder Constants FileMode NullProgressMonitor ObjectId ObjectInserter PersonIdent
                         Ref Repository)
   (org.eclipse.jgit.revwalk RevCommit RevWalk)
   (org.eclipse.jgit.revwalk.filter RevFilter)
   (org.eclipse.jgit.transport FetchResult PushResult RefSpec RemoteRefUpdate RemoteRefUpdate$Status Transport
                               URIish UsernamePasswordCredentialsProvider)
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

(defn- open-transport ^Transport [^Repository repo ^String url token timeout-seconds]
  (let [transport (Transport/open repo (URIish. url))]
    (.setTimeout transport (int timeout-seconds))
    (when token
      (.setCredentialsProvider transport (UsernamePasswordCredentialsProvider. "x-access-token" ^String token)))
    transport))

(defn- transport-failure [op url ^Exception e]
  (ex-info (format "Git %s of %s failed: %s" op url (ex-message e)) {:operation op :url url} e))

(defn- parse-commit ^RevCommit [^RevWalk rw ^String commit]
  (try
    (.parseCommit rw (ObjectId/fromString commit))
    (catch MissingObjectException e
      (throw (ex-info (format "Commit %s is not in the local object store" commit) {:commit commit} e)))))

(defn- file-mode? [^FileMode mode]
  (= FileMode/TYPE_FILE (bit-and (.getBits mode) FileMode/TYPE_MASK)))

(defn- fetch-head [^Repository repo url token timeout-seconds ref]
  (let [^FetchResult result (with-open [transport (open-transport repo url token timeout-seconds)]
                              (.setRemoveDeletedRefs transport true)
                              (try
                                (.fetch transport NullProgressMonitor/INSTANCE [fetch-spec])
                                (catch Exception e
                                  (throw (transport-failure "fetch" url e)))))]
    (some-> (.getAdvertisedRef result (qualify ref)) ^Ref identity .getObjectId .name)))

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
      (doseq [[path content] (sort-by key tree)]
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

(defn- cas-ref!* [^Repository repo url token timeout-seconds ref _expected new]
  (let [ref      (qualify ref)
        update   (RemoteRefUpdate. repo nil (ObjectId/fromString ^String new) ref false nil nil)
        ^PushResult result (with-open [transport (open-transport repo url token timeout-seconds)]
                             (try
                               (.push transport NullProgressMonitor/INSTANCE [update])
                               (catch Exception e
                                 (throw (transport-failure "push" url e)))))
        status   (.getStatus (.getRemoteUpdate result ref))]
    (if (#{RemoteRefUpdate$Status/OK RemoteRefUpdate$Status/UP_TO_DATE} status)
      :ok
      (throw (ex-info (format "Git push of %s to %s failed: %s" ref url status) {:ref ref :status status})))))

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
  sent as the password of the user `x-access-token`) and `:timeout-seconds` of each remote operation (default
  60). The caller must `close` it."
  [url & {:keys [token timeout-seconds] :or {timeout-seconds 60}}]
  (let [dir (owner-only-temp-dir)
        git (try
              (-> (Git/init) (.setBare true) (.setDirectory dir) (.call))
              (catch Throwable e
                (FileUtils/deleteDirectory dir)
                (throw e)))]
    (->JGitStore git dir url token timeout-seconds)))
