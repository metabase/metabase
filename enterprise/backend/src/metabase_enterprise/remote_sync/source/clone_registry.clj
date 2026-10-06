(ns metabase-enterprise.remote-sync.source.clone-registry
  "The local clones of git remotes that one process holds. A registry makes each clone new, in a directory under its
  process root `<base-dir>/p-<uuid>`, which it creates with owner-only permissions and locks for its whole life. It
  never opens a directory that it did not make.

  Each clone of a URL is one generation of that URL. At most one generation of a URL is active. A source holds one
  lease, which can hold several generations of its URL.

  - [[acquire!]] adds the active generation of a URL to a lease. When the URL has none, the caller waits for the one
    clone job of that URL.
  - [[retire!]] retires a stale generation: no later [[acquire!]] gets it.
  - [[release!]] ends a lease. A retired generation that no lease holds is closed and deleted.
  - [[shutdown!]] closes every clone and deletes the process root. The [[process-registry]] runs it at exit."
  (:require
   [buddy.core.codecs :as codecs]
   [buddy.core.hash :as buddy-hash]
   [clojure.java.io :as io]
   [metabase.util :as u]
   [metabase.util.log :as log])
  (:import
   (java.io File)
   (java.nio.channels FileChannel FileLock)
   (java.nio.file FileSystems Files OpenOption StandardOpenOption)
   (java.nio.file.attribute FileAttribute PosixFilePermissions)
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
  "Deletes the directory `dir`. A failure, for example on a file that a JGit gc removes during the delete, does not
  throw; a directory that remains is logged."
  [^File dir]
  (FileUtils/deleteQuietly dir)
  (when (.exists dir)
    (log/warn "Could not delete a git clone directory" {:path (str dir)})))

(defn- create-owner-only-dir!
  "Creates the new directory `dir`. Where the file system has POSIX permissions, only the owner can read, write or enter
  it. Throws if `dir` exists."
  [^File dir]
  (Files/createDirectory (.toPath dir)
                         (if (contains? (.supportedFileAttributeViews (FileSystems/getDefault)) "posix")
                           (into-array FileAttribute [(PosixFilePermissions/asFileAttribute
                                                       (PosixFilePermissions/fromString "rwx------"))])
                           (make-array FileAttribute 0))))

(defn- make-root!
  "Creates a new process root under `base-dir` and locks its lock file. Returns the root: its `:dir`, and the `:channel`
  and `:lock` of its lock file."
  [^File base-dir]
  (Files/createDirectories (.toPath base-dir) (make-array FileAttribute 0))
  (let [dir (io/file base-dir (str "p-" (random-uuid)))]
    (create-owner-only-dir! dir)
    ;; The channel stays open until `shutdown!`, and nothing in this JVM opens the lock file again: when a JVM closes
    ;; any channel on a file that it locked, the OS releases the lock.
    (let [channel (FileChannel/open (.toPath (io/file dir lock-file-name))
                                    ^"[Ljava.nio.file.OpenOption;"
                                    (into-array OpenOption [StandardOpenOption/CREATE StandardOpenOption/WRITE]))]
      (try
        (u/prog1 {:dir dir :channel channel :lock (.tryLock channel)}
          (swap! own-roots conj (.getCanonicalPath dir))
          (log/info "Created the git clone directory of this process" {:path (str dir)}))
        (catch Throwable e
          (.close channel)
          (throw e))))))

(defn- clone-thread-factory
  "Daemon threads for the clone jobs."
  ^ThreadFactory []
  (let [n (atom 0)]
    (reify ThreadFactory
      (newThread [_ runnable]
        (doto (Thread. runnable (str "remote-sync-git-clone-" (swap! n inc)))
          (.setDaemon true))))))

(defn make-registry
  "A registry whose process root is a new directory under `base-dir`. It makes nothing on disk before its first clone."
  [^File base-dir]
  {:base-dir base-dir
   :root     (atom nil)
   :state    (atom {})
   :executor (delay (Executors/newCachedThreadPool (clone-thread-factory)))})

(defn- root!
  "The process root of `registry`. Makes it at the first call."
  [{:keys [base-dir root]}]
  (or @root
      (locking root
        (or @root
            (reset! root (make-root! base-dir))))))

(defn- generation-dir
  "The directory of generation `id` of `url`."
  ^File [registry url id]
  (io/file (:dir (root! registry)) (str (url-key url) "-" id)))

(defn new-lease
  "A new lease on the clones of `url`. It holds no generation before [[acquire!]]."
  [url]
  {:id (random-uuid) :url url})

(defn- close-generation!
  "Closes the Git instance of `generation` and deletes its directory."
  [{:keys [^java.lang.AutoCloseable git dir]}]
  (try
    (.close git)
    (catch Throwable e
      (log/warn e "Could not close a git clone" {:path (str dir)})))
  (delete-dir! dir))

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
  (delete-unleased! registry url))

(defn release!
  "Ends `lease`: it holds no generation after this. A retired generation that no lease holds is closed and deleted. A
  second call does nothing."
  [{:keys [state] :as registry} {lease-id :id url :url}]
  (swap! state (fn [s]
                 (cond-> s
                   (contains? s url)
                   (update-in [url :generations] update-vals #(update % :leases disj lease-id)))))
  (delete-unleased! registry url))

(defn- retire-missing!
  "Retires the active generation of `url` if its directory no longer exists, for example after a cleaner of the temp
  dir deleted it."
  [{:keys [state] :as registry} url]
  (let [{:keys [active generations]} (get @state url)]
    (when-let [^File dir (get-in generations [active :dir])]
      (when-not (.exists dir)
        (log/info "A git clone directory is gone, so the next use clones again" {:path (str dir)})
        (retire! registry url active)))))

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
                                   (delete-dir! dir)
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

(defn acquire!
  "Adds the active generation of the URL of `lease` to `lease`, and returns that generation: a map with its `:id`, its
  `:dir` and its `:git`.

  When the URL has no active generation, the caller waits for the one clone job of that URL. The job calls
  `(clone! dir)` on an executor thread, with the dynamic bindings of the caller that started it. `clone!` makes the
  clone in the new directory `dir` and returns its Git instance (an AutoCloseable). An interrupt of a caller ends only
  its own wait. A failure of the job goes to every caller that waits for it, and the next call starts a new job."
  [{:keys [state] :as registry} {lease-id :id url :url} clone!]
  (loop []
    (retire-missing! registry url)
    (let [[old new]            (swap-vals! state update url
                                           (fn [{:keys [active job] :as entry}]
                                             (cond
                                               active (update-in entry [:generations active :leases] (fnil conj #{}) lease-id)
                                               job    entry
                                               :else  (-> entry
                                                          (update :next (fnil inc 0))
                                                          (assoc :job (promise))))))
          {:keys [active job]} (get old url)]
      (cond
        active (select-keys (get-in new [url :generations active]) [:id :dir :git])
        job    (do (await-job! job)
                   (recur))
        :else  (let [{:keys [next job]} (get new url)]
                 (start-job! registry url next job clone!)
                 (await-job! job)
                 (recur))))))

(defn shutdown!
  "Stops the clone jobs of `registry`, closes every clone, releases the lock of the process root and deletes the root."
  [{:keys [state root executor]}]
  (when (realized? executor)
    (.shutdownNow ^ExecutorService @executor))
  (doseq [[_ {:keys [generations]}] @state
          [_ {:keys [^java.lang.AutoCloseable git dir]}] generations]
    (try
      (.close git)
      (catch Throwable e
        (log/warn e "Could not close a git clone" {:path (str dir)}))))
  (when-let [{:keys [dir ^FileChannel channel ^FileLock lock]} @root]
    (try
      (some-> lock .release)
      (.close channel)
      (catch Throwable e
        (log/warn e "Could not release the lock of the git clone directory of this process" {:path (str dir)})))
    (delete-dir! dir)))

(defonce ^:private ^{:doc "The registry of this process, under `<java.io.tmpdir>/metabase-git`. Its shutdown hook
  runs [[shutdown!]]."}
  process-registry*
  (delay
    (let [registry (make-registry (io/file (System/getProperty "java.io.tmpdir") "metabase-git"))]
      (.addShutdownHook (Runtime/getRuntime)
                        (Thread. ^Runnable (fn [] (shutdown! registry)) "remote-sync-git-clones-shutdown"))
      registry)))

(defn process-registry
  "The registry of this process."
  []
  @process-registry*)
