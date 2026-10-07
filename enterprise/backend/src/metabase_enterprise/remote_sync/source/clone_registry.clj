(ns metabase-enterprise.remote-sync.source.clone-registry
  "The local clones of git remotes that one process holds, under its own process root `<base-dir>/p-<uuid>`. The
  registry uses only clones that it made. Each clone of a URL is a generation; at most one generation of a URL is
  active. A source holds one lease, which can hold several generations of its URL. [[acquire!]] adds the active
  generation to a lease, [[retire!]] retires a stale one, [[release!]] ends a lease, [[lease-git]] reads the newest
  generation of a lease, [[shutdown!]] removes everything at exit. Nothing ends a lease but [[release!]]."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [toucan2.connection :as t2.conn])
  (:import
   (java.io File IOException)
   (java.nio.channels FileChannel FileLock OverlappingFileLockException)
   (java.nio.file FileSystems Files FileVisitOption LinkOption NoSuchFileException OpenOption Path StandardOpenOption)
   (java.nio.file.attribute FileAttribute PosixFilePermissions UserPrincipal)
   (java.util.concurrent ExecutorService Executors ThreadFactory)
   (org.apache.commons.io FileUtils)))

(set! *warn-on-reflection* true)

(def ^:private lock-file-name
  "The name of the lock file in a process root."
  ".lock")

(defonce ^:private ^{:doc "The canonical paths of the process roots that this JVM made."}
  own-roots
  (atom #{}))

(defn- lock-file
  "The lock file of the process root `dir`."
  ^File [dir]
  (io/file dir lock-file-name))

(defn- url-key
  "The name prefix of the clone directories of `url`. It does not depend on the token: each remote command gets the
  token of its caller."
  ^String [^String url]
  (-> url buddy-hash/sha1 codecs/bytes->hex))

(defn- delete-dir!
  "Deletes the directory `dir`. When `dir` is a symbolic link, deletes only the link. A failure, for example on a file
  that a JGit gc removes during the delete, does not throw; a directory that remains is logged."
  [^File dir]
  ;; FileUtils/deleteQuietly deletes the files in the target when `dir` itself is a symbolic link to a directory. It
  ;; does not follow a link below `dir`.
  (if (Files/isSymbolicLink (.toPath dir))
    (.delete dir)
    (FileUtils/deleteQuietly dir))
  (when (.exists dir)
    (log/warn "Could not delete a git clone directory" {:path (str dir)})))

(defn- posix?
  "True iff the file system has POSIX permissions."
  []
  (contains? (.supportedFileAttributeViews (FileSystems/getDefault)) "posix"))

(def ^:private owner-only
  "The POSIX permissions that let only the owner read, write or enter a directory."
  (PosixFilePermissions/fromString "rwx------"))

(defn- owner-only-attributes
  "The attributes that create an owner-only directory, where the file system has POSIX permissions."
  ^"[Ljava.nio.file.attribute.FileAttribute;" []
  (if (posix?)
    (into-array FileAttribute [(PosixFilePermissions/asFileAttribute owner-only)])
    (make-array FileAttribute 0)))

(defn- create-owner-only-dir!
  "Creates the new directory `dir`. Where the file system has POSIX permissions, only the owner can read, write or enter
  it. Throws if `dir` exists."
  [^File dir]
  (Files/createDirectory (.toPath dir) (owner-only-attributes)))

(defn- no-follow
  "The link options that do not follow a symbolic link."
  ^"[Ljava.nio.file.LinkOption;" []
  (into-array LinkOption [LinkOption/NOFOLLOW_LINKS]))

(def ^:private process-user*
  "The cached result of [[process-user]]."
  (atom nil))

(defn- process-user
  "The user that owns the files that this process creates."
  ^UserPrincipal []
  ;; A lookup by the `user.name` property fails when the user id of the process has no user name, as in some containers.
  (or @process-user*
      (let [file (Files/createTempFile "metabase-git-owner" nil (make-array FileAttribute 0))]
        (try
          (reset! process-user* (Files/getOwner file (no-follow)))
          (finally
            (Files/deleteIfExists file))))))

(defn- check-own-directory!
  "Throws unless `dir` is a directory, and not a symbolic link, that the user of this process owns. The error names the
  path, the reason and the remedy, and its data has the `:path` and the `:reason`: `:symbolic-link`, `:not-a-directory`
  or `:another-owner`."
  [^File dir]
  (let [path    (.toPath dir)
        refuse! (fn [reason ^String problem]
                  (throw (ex-info (str "The git clone directory " path " " problem
                                       ". Metabase clones only into a directory that the Metabase user owns."
                                       " Remove this path, or make it a directory that the Metabase user owns."
                                       " Then try again.")
                                  {:path (str path) :reason reason})))]
    (cond
      (Files/isSymbolicLink path)
      (refuse! :symbolic-link "is a symbolic link")

      (not (Files/isDirectory path (no-follow)))
      (refuse! :not-a-directory "is not a directory")

      :else
      (let [owner (Files/getOwner path (no-follow))
            user  (process-user)]
        (when-not (= user owner)
          (refuse! :another-owner (str "is owned by the user " (.getName owner)
                                       ", not by the Metabase user " (.getName user))))))))

(def ^:private root-uid
  "The user id of the root user."
  0)

(defn- check-safe-parent!
  "Where the file system has POSIX permissions, throws when another user can rename `base-dir`: when the parent
  directory of `base-dir` exists and is owned by a user other than the user of this process and root, or when the
  group or other users can write to it and it has no sticky bit. The error names the parent, the reason and the remedy,
  and its data has the `:path` and the `:reason` `:unsafe-parent`."
  [^File base-dir]
  (when-let [parent (when (posix?) (.getParentFile (.getAbsoluteFile base-dir)))]
    (let [path (.toPath parent)]
      (when (Files/isDirectory path (make-array LinkOption 0))
        (let [mode    (int (Files/getAttribute path "unix:mode" (make-array LinkOption 0)))
              uid     (int (Files/getAttribute path "unix:uid" (make-array LinkOption 0)))
              problem (cond
                        (not (or (= uid root-uid) (= (process-user) (Files/getOwner path (make-array LinkOption 0)))))
                        "is owned by another user"

                        (and (pos? (bit-and mode 8r022)) (zero? (bit-and mode 8r1000)))
                        "lets other users write to it, and has no sticky bit")]
          (when problem
            (throw (ex-info (str "The directory " parent " holds the git clone directory, and " problem
                                 ". Another user can then rename the git clone directory. Remove the write permission"
                                 " of the group and other users from " parent ", set its sticky bit, or set"
                                 " java.io.tmpdir to a directory that only the Metabase user can write to. Then try"
                                 " again.")
                            {:path (str parent) :reason :unsafe-parent}))))))))

(defn- make-owner-only-base!
  "Creates `base-dir` and its missing parents, and checks it with [[check-own-directory!]] and its parent with
  [[check-safe-parent!]]. Where the file system has POSIX permissions, makes `base-dir` owner-only, also when it exists.
  A failure to change the permissions is logged."
  [^File base-dir]
  ;; A cleaner of the temp dir can delete a process root while a clone writes into it, and JGit then makes the root
  ;; again with default permissions. No other user can enter that root below an owner-only base.
  (let [path (.toPath base-dir)]
    (Files/createDirectories path (owner-only-attributes))
    (check-own-directory! base-dir)
    (check-safe-parent! base-dir)
    (when (posix?)
      (try
        (when (not= owner-only (Files/getPosixFilePermissions path (no-follow)))
          (Files/setPosixFilePermissions path owner-only))
        (catch Throwable e
          (log/warn e "Could not make the git clone directory owner-only" {:path (str base-dir)}))))))

(defn- lock-root!
  "Takes the OS file lock of the lock file of a new process root, on its open `channel`. Returns the lock, or nil when
  another process holds it."
  ^FileLock [^FileChannel channel]
  (.tryLock channel))

(defn- take-root-lock!
  "The lock of the new process root `dir` on its lock file `channel`. When the lock call throws, as on some network
  file systems, logs a warning that names `dir`, closes `channel`, deletes the lock file, and returns nil. Throws when
  another process holds the lock."
  ^FileLock [^File dir ^FileChannel channel]
  (let [lock (try
               (or (lock-root! channel)
                   ::held)
               (catch Exception e
                 (log/warn e (str "Could not lock the git clone directory of this process. Remote sync runs, and it deletes"
                                  " no git clone directory of a stopped process. After a crash of this process, delete"
                                  " this directory: " dir ". To turn the cleanup on, put java.io.tmpdir on a local file"
                                  " system."))
                 nil))]
    (cond
      (= ::held lock)
      ;; No sweep tries the lock of a lock file younger than [[new-lock-file-ms]], so a held lock here is a fault.
      (throw (IOException. (str "Another process holds the lock of the new git clone directory " dir)))

      (nil? lock)
      ;; A sweep keeps a root with no lock file, so no other process deletes this root.
      (do (.close channel)
          (Files/deleteIfExists (.toPath (lock-file dir)))
          nil)

      :else
      lock)))

(defn- make-root!
  "Creates a new process root under `base-dir` and locks its lock file. Returns the root: its `:dir`, and the `:channel`
  and `:lock` of its lock file. Where the lock call throws, the root has no lock file and its `:channel` and `:lock`
  are nil. Throws when [[check-own-directory!]] refuses `base-dir` or the root. On a failure, no new root stays on
  disk."
  [^File base-dir]
  (make-owner-only-base! base-dir)
  (let [dir (io/file base-dir (str "p-" (random-uuid)))]
    (create-owner-only-dir! dir)
    (try
      (check-own-directory! dir)
      ;; The channel stays open until the root is closed, and nothing in this JVM opens the lock file again: when a JVM
      ;; closes any channel on a file that it locked, the OS releases the lock.
      (let [channel (FileChannel/open (.toPath (lock-file dir))
                                      ^"[Ljava.nio.file.OpenOption;"
                                      (into-array OpenOption [StandardOpenOption/CREATE StandardOpenOption/WRITE]))]
        (try
          (let [lock (take-root-lock! dir channel)]
            (u/prog1 {:dir dir :channel (when lock channel) :lock lock}
              (swap! own-roots conj (.getCanonicalPath dir))
              (log/info "Created the git clone directory of this process" {:path (str dir)})))
          (catch Throwable e
            (.close channel)
            (throw e))))
      (catch Throwable e
        (delete-dir! dir)
        (throw e)))))

(defn- close-root!
  "Releases the lock of `root` and closes the channel of its lock file."
  [{:keys [dir ^FileChannel channel ^FileLock lock]}]
  (try
    (when (some-> channel .isOpen)
      (some-> lock .release)
      (.close channel))
    (catch Throwable e
      (log/warn e "Could not release the lock of the git clone directory of this process" {:path (str dir)}))))

(defn- intact-root?
  "True iff the directory of `root` exists, and its lock file exists when `root` has a lock."
  [{:keys [^File dir lock]}]
  ;; A cleaner of the temp dir can delete either one. A lock file that was deleted shows no lock to other processes.
  (and (.isDirectory dir)
       (or (nil? lock)
           (.isFile (lock-file dir)))))

(defn- lock-free?
  "True iff this process can take the lock of the lock file of the process root `dir`. Takes the lock and releases it at
  once. Throws when the lock file does not exist."
  [^File dir]
  ;; No CREATE: a process makes its root before its lock file, so a root with no lock file can be new.
  (with-open [channel (FileChannel/open (.toPath (lock-file dir))
                                        ^"[Ljava.nio.file.OpenOption;"
                                        (into-array OpenOption [StandardOpenOption/WRITE LinkOption/NOFOLLOW_LINKS]))]
    (try
      (if-let [lock (.tryLock channel)]
        (do (.release lock) true)
        false)
      ;; This JVM holds the lock. The close of this channel releases it, so the sweep never opens the lock file of a
      ;; root in [[own-roots]].
      (catch OverlappingFileLockException _
        false))))

(def ^:private new-lock-file-ms
  "A sweep keeps a process root whose lock file is younger than this, in ms."
  60000)

(defn- sweep-dirs!
  "Deletes each directory directly in `base-dir`, other than a symbolic link, whose name matches `name?` and for which
  `(delete? dir)` is true, and logs `deleting` before each delete. Keeps a directory for which `delete?` throws, and logs
  `kept` at the debug level."
  [^File base-dir name? delete? ^String kept ^String deleting]
  (doseq [^File dir (.listFiles base-dir)
          :when     (and (name? (.getName dir))
                         (Files/isDirectory (.toPath dir) (no-follow)))]
    (when (try
            (delete? dir)
            (catch Exception e
              (log/debug e kept {:path (str dir)})
              false))
      (log/info deleting {:path (str dir)})
      (delete-dir! dir))))

(defn- sweep-roots!
  "Deletes each process root in `base-dir` that this JVM did not make, whose lock file is older than
  [[new-lock-file-ms]], and whose lock is free. Keeps a root with no lock file, and a root whose lock check throws."
  [^File base-dir]
  (let [now (System/currentTimeMillis)]
    (sweep-dirs! base-dir
                 #(str/starts-with? % "p-")
                 (fn [^File dir]
                   ;; The sweep never opens the lock file of a root that this JVM made: the close of that channel would
                   ;; release the lock of this JVM. A process creates its lock file before it takes the lock, so a new
                   ;; lock file can be free for a moment. A missing lock file gives 0 here, and then lock-free? throws.
                   (and (not (contains? @own-roots (.getCanonicalPath dir)))
                        (> (- now (.lastModified (lock-file dir))) new-lock-file-ms)
                        (lock-free? dir)))
                 "Kept a git clone directory whose lock could not be checked"
                 "Deleting the git clone directory of a stopped process")))

(def ^:private old-clone-name
  "The name of a clone directory of an earlier Metabase version: a SHA-1 in hexadecimal, alone or followed by `-` and a
  UUID."
  #"[0-9a-f]{40}(-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?")

(defn- last-write-ms
  "The newest modification time, in ms, of the clone directory `dir`, its `FETCH_HEAD`, its `packed-refs`, and the files
  under its `refs` directory."
  [^File dir]
  ;; A fetch that gets new commits writes FETCH_HEAD and refs. A push and a branch creation write refs or packed-refs.
  ;; A fetch with no change writes none of them, but JGit's automatic gc then makes and deletes gc.log.lock in the
  ;; directory, which changes the time of the directory.
  (let [time-ms   (fn [^Path path]
                    (try
                      (.toMillis (Files/getLastModifiedTime path (no-follow)))
                      (catch NoSuchFileException _
                        0)))
        refs      (.toPath (io/file dir "refs"))
        ref-times (when (Files/isDirectory refs (no-follow))
                    (with-open [paths (Files/walk refs (make-array FileVisitOption 0))]
                      (mapv time-ms (iterator-seq (.iterator paths)))))]
    (reduce max 0 (concat (map time-ms [(.toPath dir)
                                        (.toPath (io/file dir "FETCH_HEAD"))
                                        (.toPath (io/file dir "packed-refs"))])
                          ref-times))))

(defn- sweep-old-clones!
  "Deletes each clone directory of an earlier Metabase version directly in `base-dir` whose [[last-write-ms]] is more
  than `idle-ms` ago."
  [^File base-dir idle-ms]
  ;; A process of an earlier version can still use its clone during a rolling upgrade. Each of its tasks fetches at its
  ;; start, and no task runs longer than the task timeout.
  (let [now (System/currentTimeMillis)]
    (sweep-dirs! base-dir
                 #(re-matches old-clone-name %)
                 #(> (- now (last-write-ms %)) idle-ms)
                 "Kept a git clone directory whose last write time could not be read"
                 "Deleting a git clone directory of an earlier Metabase version")))

(defn- sweep!
  "Deletes the process roots of stopped processes in the base directory of `registry`. When `registry` has an
  `:old-clone-idle-ms`, the first sweep in which that function returns also deletes the idle clone directories of
  earlier Metabase versions. A failure is logged."
  [{:keys [^File base-dir old-clone-idle-ms old-clones-swept?]}]
  (try
    (sweep-roots! base-dir)
    ;; The flag is set only after the read of the idle time succeeds, so that a throw of the read does not stop the
    ;; old-clone sweep for the life of the registry.
    (when (and old-clone-idle-ms (not @old-clones-swept?))
      (let [idle-ms (long (old-clone-idle-ms))]
        (when (compare-and-set! old-clones-swept? false true)
          (sweep-old-clones! base-dir idle-ms))))
    (catch Throwable e
      (log/warn e "The sweep of git clone directories failed" {:path (str base-dir)}))))

(defn- clone-thread-factory
  "Daemon threads for the clone jobs."
  ^ThreadFactory []
  (let [n (atom 0)]
    (reify ThreadFactory
      (newThread [_ runnable]
        (doto (Thread. runnable (str "remote-sync-git-clone-" (swap! n inc)))
          (.setDaemon true))))))

(defn- dir-exists?
  "True iff the clone directory `dir` exists."
  [^File dir]
  (.exists dir))

(defn make-registry
  "A registry whose process roots are new directories under `base-dir`. Changes nothing on disk before its first clone.
  Each new locked root sweeps `base-dir`: it deletes the roots of stopped processes.

  `max-lease-age-ms`, a fn of no args (ms): each [[acquire!]] and [[retire!]] of a URL logs, once, each lease of that
  URL older than it.

  `old-clone-idle-ms`, a fn of no args (ms): the first sweep in which it returns also deletes each clone directory of an
  earlier Metabase version idle for longer than it.

  `clone-intact?`, a fn of a clone directory: when it is false for the active generation of a URL, the next
  [[acquire!]] of the URL retires that generation and clones again. Default: the directory exists."
  ([^File base-dir]
   (make-registry base-dir nil))
  ([^File base-dir {:keys [max-lease-age-ms old-clone-idle-ms clone-intact?]}]
   {:base-dir          base-dir
    :clone-intact?     clone-intact?
    :root              (atom nil)
    :old-roots         (atom [])
    :state             (atom {})
    :executor          (delay (Executors/newCachedThreadPool (clone-thread-factory)))
    :max-lease-age-ms  max-lease-age-ms
    :old-clone-idle-ms old-clone-idle-ms
    :old-clones-swept? (atom false)}))

(defn new-lease
  "A new lease on the clones of `url`, held by the caller. It holds no generation before [[acquire!]]."
  [url]
  {:id     (random-uuid)
   :url    url
   ;; The log of a lease that is too old names the thread and the place that made it.
   :holder (.getName (Thread/currentThread))
   :trace  (ex-info "The holder of a git clone lease made the lease here" {})})

(defn- lease-paths
  "The directories of the generations of `url` in `state` that lease `lease-id` holds."
  [state url lease-id]
  (for [[_ {:keys [dir leases]}] (get-in state [url :generations])
        :when                     (contains? leases lease-id)]
    (str dir)))

(defn- log-old-leases!
  "Logs each lease of `url` that is older than the age limit of `registry`, one time."
  [{:keys [state max-lease-age-ms]} url]
  ;; The log does not release the lease: a forced release would delete a clone that its holder can still read.
  (when max-lease-age-ms
    (let [now       (System/nanoTime)
          limit-ns  (* 1000000 (long (max-lease-age-ms)))
          too-old?  (fn [{:keys [since logged?]}] (and (not logged?) (> (- now since) limit-ns)))
          [old new] (swap-vals! state (fn [s]
                                        (cond-> s
                                          (seq (get-in s [url :leases]))
                                          (update-in [url :leases] update-vals
                                                     #(cond-> % (too-old? %) (assoc :logged? true))))))]
      (doseq [[id {:keys [holder trace since logged?]}] (get-in new [url :leases])
              :when (and logged? (not (get-in old [url :leases id :logged?])))]
        (log/warn trace (str "A source holds a git clone for longer than the task timeout. Nothing releases the clone"
                             " until the holder closes the source. The stack trace shows where the holder made the source."
                             " A restart of Metabase releases it.")
                  {:lease  id
                   :holder holder
                   :age-ms (quot (- now (long since)) 1000000)
                   :paths  (vec (lease-paths new url id))})))))

(defn- deletable?
  "True iff `dir` is a symbolic link, or the canonical path of `root` is that of a process root that this JVM made."
  [^File dir ^File root]
  (or (Files/isSymbolicLink (.toPath dir))
      (contains? @own-roots (.getCanonicalPath root))))

(defn- delete-in-root!
  "Deletes `dir`, which is the process root `root` or a directory in it, when [[deletable?]]. Else logs and keeps it."
  [^File dir ^File root]
  ;; [[delete-dir!]] removes a link at `dir` itself. A link in a parent of `dir`, for example a base directory that was
  ;; replaced by a link, makes the canonical path of `root` leave the roots that this JVM made.
  (if (deletable? dir root)
    (delete-dir! dir)
    (log/warn "Did not delete a git clone directory whose path leads out of the git clone directory of this process"
              {:path (str dir)})))

(defn- close-git!
  "Closes `git`, the Git instance of the clone in `dir`. Logs a failure."
  [^java.lang.AutoCloseable git ^File dir]
  (try
    (.close git)
    (catch Throwable e
      (log/warn e "Could not close a git clone" {:path (str dir)}))))

(defn- close-generation!
  "Closes the Git instance of `generation` and deletes its directory, unless its path leads out of the process roots
  that this JVM made."
  [{:keys [git ^File dir]}]
  (close-git! git dir)
  (delete-in-root! dir (.getParentFile dir)))

(defn- delete-empty-old-roots!
  "Deletes each retired process root of `registry` that holds no generation and no running clone job."
  [{:keys [state old-roots]}]
  (let [s    @state
        used (into #{}
                   (map #(.getParentFile ^File %))
                   (concat (for [[_ {:keys [generations]}] s
                                 [_ {:keys [dir]}]          generations]
                             dir)
                           (keep :job-dir (vals s))))]
    ;; A retired root stays in old-roots: a clone job that got its directory before the retire can make it again.
    (doseq [^File root @old-roots
            :when      (and (not (contains? used root)) (.exists root))]
      (log/info "Deleting a retired git clone directory of this process" {:path (str root)})
      (delete-in-root! root root))))

(defn- delete-unleased!
  "Closes and deletes each retired generation of `url` that no lease holds, and each retired process root that is then
  empty."
  [{:keys [state] :as registry} url]
  (let [unleased? (fn [{:keys [retired? leases]}] (and retired? (empty? leases)))
        [old new] (swap-vals! state (fn [s]
                                      (cond-> s
                                        (contains? s url)
                                        (update-in [url :generations] #(into {} (remove (comp unleased? val)) %)))))
        kept      (get-in new [url :generations])]
    ;; Only the swap that removes a generation sees it in `old` and not in `new`, so each one is deleted once.
    (doseq [[id generation] (get-in old [url :generations])
            :when (not (contains? kept id))]
      (log/info "Deleting a retired git clone" {:path (str (:dir generation))})
      (close-generation! generation))
    (delete-empty-old-roots! registry)))

(defn retire!
  "Retires generation `id` of `url` if it is the active generation, so that no later [[acquire!]] gets it. A retired
  generation that no lease holds is closed and deleted."
  [{:keys [state] :as registry} url id]
  (swap! state (fn [s]
                 ;; A nil `id` names no generation, and a URL with no active generation has a nil :active.
                 (if (and (some? id) (= id (get-in s [url :active])))
                   (-> s
                       (update url dissoc :active)
                       (assoc-in [url :generations id :retired?] true))
                   s)))
  (log-old-leases! registry url)
  (delete-unleased! registry url))

(defn release!
  "Ends `lease`: it holds no generation after this. A retired generation that no lease holds is closed and deleted. A
  second call does nothing."
  [{:keys [state] :as registry} {lease-id :id url :url}]
  (swap! state (fn [s]
                 (cond-> s
                   (contains? s url)
                   (-> (update-in [url :generations] update-vals #(update % :leases disj lease-id))
                       (update-in [url :leases] dissoc lease-id)))))
  (delete-unleased! registry url))

(defn lease-git
  "The Git instance of the newest generation that `lease` holds, or nil when it holds none."
  [{:keys [state]} {lease-id :id url :url}]
  (some->> (vals (get-in @state [url :generations]))
           (filter #(contains? (:leases %) lease-id))
           seq
           (apply max-key :id)
           :git))

(defn- retire-missing!
  "Retires the active generation of `url` when the `:clone-intact?` function of `registry` is false for its directory,
  for example after a cleaner of the temp dir deleted it or some of its files."
  [{:keys [state clone-intact?] :as registry} url]
  (let [{:keys [active generations]} (get @state url)]
    (when-let [^File dir (get-in generations [active :dir])]
      (when-not ((or clone-intact? dir-exists?) dir)
        (log/info "A git clone directory or one of its files is gone, so this use clones again" {:path (str dir)})
        (retire! registry url active)))))

(defn- in-root?
  "True iff `dir` is in the process root `root`."
  [root ^File dir]
  (= (:dir root) (.getParentFile dir)))

(defn- retire-broken-root!
  "When the process root of `registry` is not intact, retires it and each active generation in it, so that the next
  clone makes a new root. A retired root is deleted when it holds no generation and no clone job."
  [{:keys [root old-roots state] :as registry}]
  (when-let [current @root]
    (when (and (not (intact-root? current))
               (compare-and-set! root current nil))
      (log/warn "The git clone directory of this process or its lock file is gone, so the next clone makes a new one"
                {:path (str (:dir current))})
      (close-root! current)
      (swap! old-roots conj (:dir current))
      (doseq [[url {:keys [active generations]}] @state
              :let  [^File dir (get-in generations [active :dir])]
              :when (and dir (in-root? current dir))]
        (retire! registry url active))
      (delete-empty-old-roots! registry))))

(defn- check-current-root!
  "Checks the base directory and the current process root of `registry` with [[check-own-directory!]], and returns the
  current root. Returns nil when there is no current root. Throws when the check refuses one of them."
  [{:keys [base-dir root]}]
  (when-let [current @root]
    (check-own-directory! base-dir)
    (check-own-directory! (:dir current))
    current))

(defn- root!
  "The intact process root of `registry`. Makes a new root at the first call, and when the current root is not intact.
  A new root with a lock starts a [[sweep!]]. Throws when [[check-own-directory!]] refuses the base directory or the
  root."
  [{:keys [base-dir root] :as registry}]
  ;; A clone into a deleted root would make its path again, with default permissions and no lock file.
  (retire-broken-root! registry)
  (or (check-current-root! registry)
      (locking root
        (or @root
            ;; make-root! adds the new root to own-roots before the sweep, so the sweep never opens its lock file.
            (u/prog1 (reset! root (make-root! base-dir))
              (when (:lock <>)
                (sweep! registry)))))))

(defn- generation-dir
  "The directory of generation `id` of `url`."
  ^File [registry url id]
  (io/file (:dir (root! registry)) (str (url-key url) "-" id)))

(defn- start-job!
  "Runs the clone job of generation `id` of `url` on the executor of `registry`, and delivers its result to `job`."
  [{:keys [state executor] :as registry} url id job clone!]
  (let [shut-down? #(.isShutdown ^ExecutorService @executor)
        publish!   (fn [generation]
                     (swap! state update url (fn [entry]
                                               (-> entry
                                                   (assoc-in [:generations id] generation)
                                                   (assoc :active id)
                                                   (dissoc :job :job-dir)))))
        fail!      (fn [^Throwable e]
                     (swap! state update url dissoc :job :job-dir)
                     (deliver job {:error e}))
        run        (fn []
                     (try
                       (let [^File dir (generation-dir registry url id)
                             root      (.getParentFile dir)
                             _         (swap! state assoc-in [url :job-dir] dir)
                             ;; A clone does not stop on the interrupt of shutdown!, and it can make its root again after
                             ;; shutdown! deleted it. Then the job deletes the root.
                             git       (try
                                         (clone! dir)
                                         (catch Throwable e
                                           (delete-in-root! (if (shut-down?) root dir) root)
                                           (throw e)))]
                         (when (shut-down?)
                           (close-git! git dir)
                           (delete-in-root! root root)
                           (throw (ex-info "The git clone registry is shut down" {:url url})))
                         (publish! {:id id :dir dir :git git :leases #{}})
                         (deliver job {:id id}))
                       (catch Throwable e
                         (fail! e))))]
    (try
      ;; The job gets the dynamic bindings of the caller that starts it, but not its app-DB connection: the job can run
      ;; after the caller has left its transaction.
      (.execute ^ExecutorService @executor ^Runnable (bound-fn* #(binding [t2.conn/*current-connectable* nil]
                                                                   (run))))
      (catch Throwable e
        (fail! e)))))

(defn- await-job!
  "Waits for `job`, and throws its failure."
  [job]
  (when-let [e (:error @job)]
    (throw e)))

(defn- take-generation
  "The state `entry` of a URL after an acquire by `lease`. The lease is added to the active generation, and to the
  `:leases` of `entry` with the time of its first generation. When the active generation is not in the current process
  root of the `root` atom, it is retired instead. When the URL then has no active generation and no clone job, `entry`
  gets a new `:job` promise and the next generation id in `:next`."
  [{:keys [active] :as entry} root {lease-id :id :keys [holder trace]}]
  ;; A clone job writes into the directory that it got before it started. If an acquire retires that root in the
  ;; meantime, the job publishes a generation in a retired root. The swap reads the root, so that it never takes a
  ;; generation in a root that was retired before the swap.
  (let [{:keys [active job] :as entry} (cond-> entry
                                         (and active (not (in-root? @root (get-in entry [:generations active :dir]))))
                                         (-> (dissoc :active)
                                             (assoc-in [:generations active :retired?] true)))]
    (cond
      active (-> entry
                 (update-in [:generations active :leases] (fnil conj #{}) lease-id)
                 (update-in [:leases lease-id] #(or % {:since (System/nanoTime) :holder holder :trace trace})))
      job    entry
      :else  (-> entry
                 (update :next (fnil inc 0))
                 (assoc :job (promise))))))

(defn acquire!
  "Adds the active generation of the URL of `lease` to `lease`, and returns that generation: a map with its `:id`, its
  `:dir` and its `:git`.

  When the URL has no active generation, the caller waits for the one clone job of that URL. The job calls
  `(clone! dir)` on an executor thread, with the dynamic bindings of the caller that started it. `clone!` makes the
  clone in the new directory `dir` and returns its Git instance (an AutoCloseable). An interrupt of a caller ends only
  its own wait. A failure of the job goes to every caller that waits for it, and the next call starts a new job.
  Throws when [[check-own-directory!]] refuses the base directory or the current process root, also when the URL has an
  active generation. After the removal of the refused path, the next call makes a new root."
  [{:keys [root state] :as registry} {url :url :as lease} clone!]
  (log-old-leases! registry url)
  (loop []
    (retire-broken-root! registry)
    (check-current-root! registry)
    (retire-missing! registry url)
    (let [[old new]                         (swap-vals! state update url take-generation root lease)
          {old-active :active old-job :job} (get old url)
          {:keys [active job next]}         (get new url)]
      (when (and old-active (not= old-active active))
        (log/warn "A git clone is outside the git clone directory of this process, so this use clones again"
                  {:path (str (get-in old [url :generations old-active :dir]))})
        (delete-unleased! registry url))
      (cond
        active                   (select-keys (get-in new [url :generations active]) [:id :dir :git])
        (identical? job old-job) (do (await-job! job)
                                     (recur))
        :else                    (do (start-job! registry url next job clone!)
                                     (await-job! job)
                                     (recur))))))

(defn shutdown!
  "Interrupts the clone jobs of `registry`, closes every clone, releases the lock of the process root, and deletes the
  root and each retired root. A clone job that ends after the shutdown deletes its clone and its root. Keeps, and logs,
  a root whose path leads out of the roots that this JVM made."
  [{:keys [state root old-roots executor]}]
  ;; Before the deletes: a clone job reads the shutdown of the executor after its clone.
  (when (realized? executor)
    (.shutdownNow ^ExecutorService @executor))
  (doseq [[_ {:keys [generations]}] @state
          [_ {:keys [git dir]}]      generations]
    (close-git! git dir))
  (when-let [current @root]
    (close-root! current)
    (delete-in-root! (:dir current) (:dir current)))
  (run! #(delete-in-root! % %) @old-roots))

(defonce ^:private ^{:doc "The registry of this process, under `<java.io.tmpdir>/metabase-git`. Its shutdown hook
  runs [[shutdown!]]."}
  process-registry*
  (delay
    (let [;; the task timeout: a task runs at most this long
          task-timeout-ms #(* 10 (setting/get :remote-sync-task-time-limit-ms))
          registry        (make-registry (io/file (System/getProperty "java.io.tmpdir") "metabase-git")
                                         {:max-lease-age-ms  task-timeout-ms
                                          :old-clone-idle-ms task-timeout-ms
                                          ;; JGit cannot open a bare clone without them.
                                          :clone-intact?     (fn [dir]
                                                               (every? #(.isFile (io/file dir %)) ["HEAD" "config"]))})]
      (.addShutdownHook (Runtime/getRuntime)
                        (Thread. ^Runnable (fn [] (shutdown! registry)) "remote-sync-git-clones-shutdown"))
      registry)))

(defn process-registry
  "The registry of this process."
  []
  @process-registry*)
