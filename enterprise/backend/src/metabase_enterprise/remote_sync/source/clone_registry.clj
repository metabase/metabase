(ns metabase-enterprise.remote-sync.source.clone-registry
  "The local clones of git remotes that one process holds. A registry makes each clone new, in a directory under its
  process root `<base-dir>/p-<uuid>`, which it locks for its whole life. It makes the root and `base-dir` owner-only.
  It never opens a directory that it did not make. It refuses to clone, and throws, when `base-dir` or the root is a
  symbolic link, is not a directory, or is owned by a user other than the user of this process. Each new root that it
  locks starts a sweep, which deletes the process roots of stopped processes.

  Each clone of a URL is one generation of that URL. At most one generation of a URL is active. A source holds one
  lease, which can hold several generations of its URL.

  - [[acquire!]] adds the active generation of a URL to a lease. When the URL has none, the caller waits for the one
    clone job of that URL.
  - [[retire!]] retires a stale generation: no later [[acquire!]] gets it.
  - [[release!]] ends a lease. A retired generation that no lease holds is closed and deleted.
  - [[lease-git]] gives the Git instance of the newest generation that a lease holds.
  - [[shutdown!]] closes every clone and deletes the process root. The [[process-registry]] runs it at exit.

  Nothing ends a lease but [[release!]]. A lease that is older than the age limit of the registry is logged one time,
  with its holder."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.settings.core :as setting]
   [metabase.util :as u]
   [metabase.util.log :as log])
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

(defn- make-owner-only-base!
  "Creates `base-dir` and its missing parents, and checks it with [[check-own-directory!]]. Where the file system has
  POSIX permissions, makes `base-dir` owner-only, also when it exists. A failure to change the permissions is logged."
  [^File base-dir]
  ;; A cleaner of the temp dir can delete a process root while a clone writes into it, and JGit then makes the root
  ;; again with default permissions. No other user can enter that root below an owner-only base.
  (let [path (.toPath base-dir)]
    (Files/createDirectories path (owner-only-attributes))
    (check-own-directory! base-dir)
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
                                  " this directory: " dir))
                 nil))]
    (cond
      (= ::held lock)
      ;; Only a sweep of another process can hold the lock of a new root. That sweep deletes the root.
      (throw (IOException. (str "Another process holds the lock of the new git clone directory " dir)))

      (nil? lock)
      ;; A sweep keeps a root with no lock file, so no other process deletes this root.
      (do (.close channel)
          (Files/deleteIfExists (.toPath (io/file dir lock-file-name)))
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
      (let [channel (FileChannel/open (.toPath (io/file dir lock-file-name))
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
           (.isFile (io/file dir lock-file-name)))))

(defn- lock-free?
  "True iff this process can take the lock of the lock file of the process root `dir`. Takes the lock and releases it at
  once. Throws when the lock file does not exist."
  [^File dir]
  ;; No CREATE: a process makes its root before its lock file, so a root with no lock file can be new.
  (with-open [channel (FileChannel/open (.toPath (io/file dir lock-file-name))
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

(defn- sweep-roots!
  "Deletes each process root in `base-dir` that this JVM did not make and whose lock is free. Keeps a root with no lock
  file, and a root whose lock check throws."
  [^File base-dir]
  (doseq [^File dir (.listFiles base-dir)
          :when     (and (str/starts-with? (.getName dir) "p-")
                         (Files/isDirectory (.toPath dir) (no-follow))
                         (not (contains? @own-roots (.getCanonicalPath dir))))]
    (when (try
            (lock-free? dir)
            (catch Exception e
              (log/debug e "Kept a git clone directory whose lock could not be checked" {:path (str dir)})
              false))
      (log/info "Deleting the git clone directory of a stopped process" {:path (str dir)})
      (delete-dir! dir))))

(def ^:private old-clone-name
  "The name of a clone directory of an earlier Metabase version: a SHA-1 in hexadecimal, alone or followed by `-` and a
  UUID."
  #"[0-9a-f]{40}(-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?")

(defn- last-write-ms
  "The newest modification time, in ms, of the clone directory `dir`, its `FETCH_HEAD`, its `packed-refs`, and the files
  under its `refs` directory."
  [^File dir]
  ;; A fetch writes FETCH_HEAD. A push and a branch creation write refs or packed-refs.
  (let [time-ms   (fn [^Path path]
                    (try
                      (.toMillis (Files/getLastModifiedTime path (no-follow)))
                      (catch NoSuchFileException _
                        0)))
        refs      (.toPath (io/file dir "refs"))
        ref-times (when (Files/isDirectory refs (no-follow))
                    (with-open [paths (Files/walk refs (make-array FileVisitOption 0))]
                      (mapv time-ms (iterator-seq (.iterator paths)))))]
    (reduce max (concat (map #(time-ms (.toPath (io/file dir ^String %))) ["." "FETCH_HEAD" "packed-refs"])
                        ref-times))))

(defn- sweep-old-clones!
  "Deletes each clone directory of an earlier Metabase version directly in `base-dir` whose [[last-write-ms]] is more
  than `idle-ms` ago."
  [^File base-dir idle-ms]
  ;; A process of an earlier version can still use its clone during a rolling upgrade. Each of its tasks fetches at its
  ;; start, and no task runs longer than the task timeout.
  (let [now (System/currentTimeMillis)]
    (doseq [^File dir (.listFiles base-dir)
            :when     (and (re-matches old-clone-name (.getName dir))
                           (Files/isDirectory (.toPath dir) (no-follow)))]
      (when (try
              (> (- now (last-write-ms dir)) idle-ms)
              (catch Exception e
                (log/debug e "Kept a git clone directory whose last write time could not be read" {:path (str dir)})
                false))
        (log/info "Deleting a git clone directory of an earlier Metabase version" {:path (str dir)})
        (delete-dir! dir)))))

(defn- sweep!
  "Deletes the process roots of stopped processes in the base directory of `registry`. At the first sweep of `registry`,
  when it has an `:old-clone-idle-ms`, also deletes the idle clone directories of earlier Metabase versions. A failure
  is logged."
  [{:keys [^File base-dir old-clone-idle-ms old-clones-swept?]}]
  (try
    (sweep-roots! base-dir)
    (when (and old-clone-idle-ms (compare-and-set! old-clones-swept? false true))
      (sweep-old-clones! base-dir (long (old-clone-idle-ms))))
    (catch Throwable e
      (log/warn e "Could not delete the git clone directories of stopped processes" {:path (str base-dir)}))))

(defn- clone-thread-factory
  "Daemon threads for the clone jobs."
  ^ThreadFactory []
  (let [n (atom 0)]
    (reify ThreadFactory
      (newThread [_ runnable]
        (doto (Thread. runnable (str "remote-sync-git-clone-" (swap! n inc)))
          (.setDaemon true))))))

(defn make-registry
  "A registry whose process root is a new directory under `base-dir`. It changes nothing on disk before its first clone.
  Each new process root that it locks starts a sweep of `base-dir`: the sweep deletes each process root of another
  process whose lock is free. It never opens the lock file of a root that this JVM made. Where the lock call throws, the
  registry runs with no sweep.

  `max-lease-age-ms`, when given, is a function of no arguments that returns the age limit of a lease in ms. Each
  [[acquire!]] and [[retire!]] of a URL logs each lease of that URL that is older than the limit, one time.

  `old-clone-idle-ms`, when given, is a function of no arguments that returns a time in ms. The first sweep then also
  deletes each clone directory of an earlier Metabase version directly in `base-dir` that nobody wrote to for longer
  than that time: a directory whose name is a SHA-1 in lowercase hexadecimal, alone or followed by `-` and a UUID."
  ([^File base-dir]
   (make-registry base-dir nil))
  ([^File base-dir {:keys [max-lease-age-ms old-clone-idle-ms]}]
   {:base-dir          base-dir
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
                             " until the holder closes the source. The stack trace shows where the holder made the source.")
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

(defn- close-generation!
  "Closes the Git instance of `generation` and deletes its directory, unless its path leads out of the process roots
  that this JVM made."
  [{:keys [^java.lang.AutoCloseable git ^File dir]}]
  (try
    (.close git)
    (catch Throwable e
      (log/warn e "Could not close a git clone" {:path (str dir)})))
  (delete-in-root! dir (.getParentFile dir)))

(defn- delete-unleased!
  "Closes and deletes each retired generation of `url` that no lease holds."
  [{:keys [state]} url]
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
      (close-generation! generation))))

(defn retire!
  "Retires generation `id` of `url` if it is the active generation, so that no later [[acquire!]] gets it. A retired
  generation that no lease holds is closed and deleted."
  [{:keys [state] :as registry} url id]
  (swap! state (fn [s]
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
  "Retires the active generation of `url` if its directory no longer exists, for example after a cleaner of the temp
  dir deleted it."
  [{:keys [state] :as registry} url]
  (let [{:keys [active generations]} (get @state url)]
    (when-let [^File dir (get-in generations [active :dir])]
      (when-not (.exists dir)
        (log/info "A git clone directory is gone, so the next use clones again" {:path (str dir)})
        (retire! registry url active)))))

(defn- in-root?
  "True iff `dir` is in the process root `root`."
  [root ^File dir]
  (= (:dir root) (.getParentFile dir)))

(defn- retire-broken-root!
  "When the process root of `registry` is not intact, retires it and each active generation in it, so that the next
  clone makes a new root. [[shutdown!]] deletes a retired root."
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
        (retire! registry url active)))))

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
  (let [publish! (fn [generation]
                   (swap! state update url (fn [entry]
                                             (-> entry
                                                 (assoc-in [:generations id] generation)
                                                 (assoc :active id)
                                                 (dissoc :job)))))
        fail!    (fn [^Throwable e]
                   (swap! state update url dissoc :job)
                   (deliver job {:error e}))
        run      (fn []
                   (try
                     (let [dir (generation-dir registry url id)
                           git (try
                                 (clone! dir)
                                 (catch Throwable e
                                   (delete-in-root! dir (.getParentFile dir))
                                   (throw e)))]
                       (publish! {:id id :dir dir :git git :leases #{}})
                       (deliver job {:id id}))
                     (catch Throwable e
                       (fail! e))))]
    (try
      ;; The job gets the dynamic bindings of the caller that starts it.
      (.execute ^ExecutorService @executor ^Runnable (bound-fn* run))
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
        (log/warn "A git clone is outside the git clone directory of this process, so the next use clones again"
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
  "Stops the clone jobs of `registry`, closes every clone, releases the lock of the process root, and deletes the root
  and each retired root. A root whose path leads through a symbolic link out of the roots that this JVM made is kept,
  and logged."
  [{:keys [state root old-roots executor]}]
  (when (realized? executor)
    (.shutdownNow ^ExecutorService @executor))
  (doseq [[_ {:keys [generations]}] @state
          [_ {:keys [^java.lang.AutoCloseable git dir]}] generations]
    (try
      (.close git)
      (catch Throwable e
        (log/warn e "Could not close a git clone" {:path (str dir)}))))
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
                                          :old-clone-idle-ms task-timeout-ms})]
      (.addShutdownHook (Runtime/getRuntime)
                        (Thread. ^Runnable (fn [] (shutdown! registry)) "remote-sync-git-clones-shutdown"))
      registry)))

(defn process-registry
  "The registry of this process."
  []
  @process-registry*)
