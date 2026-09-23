(ns metabase-enterprise.semantic-search.sqlite
  "Hackathon: a semantic search index stored in a local SQLite file, searched with the vec1 extension.

  Enabled by setting `MB_SEMANTIC_SEARCH_SQLITE_PATH`. All access goes through one JDBC connection, serialized by
  [[with-conn]]. See `native/vec1/PLAN_001_store.md`.

  vec1 is native code in this process: a bad statement against a vec1 table crashes the JVM rather than throwing
  (see `native/vec1/LIMITATION_001_update_crash.md`). Keep every statement that touches a vec1 table in this
  namespace."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [environ.core :refer [env]]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc]
   [next.jdbc.result-set :as jdbc.rs])
  (:import
   (java.nio ByteBuffer ByteOrder)
   (java.sql Connection DriverManager)
   (org.sqlite SQLiteConfig SQLiteConfig$JournalMode)))

(set! *warn-on-reflection* true)

;;; ------------------------------------------------ Configuration -------------------------------------------------

(defn db-path
  "The configured SQLite file path (`MB_SEMANTIC_SEARCH_SQLITE_PATH`), or nil when unset or blank."
  []
  (not-empty (str/trim (or (env :mb-semantic-search-sqlite-path) ""))))

(defn enabled?
  "Is the SQLite semantic search store configured?"
  []
  (some? (db-path)))

(defn platform
  "The `<os>-<arch>` directory name for this JVM's vec1 binary, e.g. `darwin-aarch64` or `linux-x86_64`."
  []
  (let [os   (u/lower-case-en (or (System/getProperty "os.name") ""))
        arch (u/lower-case-en (or (System/getProperty "os.arch") ""))]
    (str (cond
           (str/includes? os "mac")     "darwin"
           (str/includes? os "linux")   "linux"
           (str/includes? os "windows") "windows"
           :else                        os)
         "-"
         (case arch
           ("aarch64" "arm64") "aarch64"
           ("amd64" "x86_64")  "x86_64"
           arch))))

(defn- library-extension [platform]
  (cond
    (str/starts-with? platform "darwin")  "dylib"
    (str/starts-with? platform "windows") "dll"
    :else                                 "so"))

(defn extension-path
  "Absolute filesystem path of the vec1 binary to load: `MB_VEC1_EXTENSION_PATH` when set, else the
  `vec1/<platform>/vec1.<ext>` classpath resource. Throws when there is no loadable file."
  []
  (let [override (not-empty (str/trim (or (env :mb-vec1-extension-path) "")))
        platform (platform)
        resource (str "vec1/" platform "/vec1." (library-extension platform))
        file     (if override
                   (io/file override)
                   (when-let [^java.net.URL url (io/resource resource)]
                     ;; load_extension dlopens a filesystem path. A resource inside the uberjar would need extracting
                     ;; to a temp file first -- out of scope for the hackathon.
                     (when (= "file" (.getProtocol url))
                       (io/file (.toURI url)))))]
    (when-not (and file (.isFile ^java.io.File file))
      (throw (ex-info (str "No vec1 extension for this platform. Build it (see native/vec1/README.md) or set "
                           "MB_VEC1_EXTENSION_PATH.")
                      {:platform platform :resource resource :override override})))
    (.getAbsolutePath ^java.io.File file)))

;;; -------------------------------------------------- Connection --------------------------------------------------

(defonce ^:private lock (Object.))

(defonce ^:private state
  ;; {:conn Connection, :path String} while open, nil otherwise. Written only while holding `lock`.
  (atom nil))

(defn- open-connection ^Connection [path]
  (let [config (doto (SQLiteConfig.)
                 (.enableLoadExtension true)
                 (.setJournalMode SQLiteConfig$JournalMode/WAL)
                 (.setBusyTimeout 5000))
        conn   (DriverManager/getConnection (str "jdbc:sqlite:" path) (.toProperties config))]
    (try
      (jdbc/execute-one! conn ["SELECT load_extension(?)" (extension-path)])
      conn
      (catch Throwable t
        (.close conn)
        (throw t)))))

(defn open!
  "Open the store at `path` (default [[db-path]]), closing a store open at another path. No-op when already open
  at `path`. Returns `path`."
  ([]
   (open! (or (db-path)
              (throw (ex-info "MB_SEMANTIC_SEARCH_SQLITE_PATH is not set" {})))))
  ([path]
   (locking lock
     (when-not (= path (:path @state))
       (when-let [{:keys [^Connection conn]} @state]
         (.close conn))
       (reset! state nil)
       (io/make-parents (io/file path))
       (reset! state {:conn (open-connection path) :path path})
       (log/infof "Opened SQLite semantic search store at %s" path))
     path)))

(defn close!
  "Close the store if it is open."
  []
  (locking lock
    (when-let [{:keys [^Connection conn path]} @state]
      (.close conn)
      (reset! state nil)
      (log/infof "Closed SQLite semantic search store at %s" path))
    nil))

(defn delete-store!
  "Close the store and delete its files (`path` defaults to the open store's path, else [[db-path]])."
  ([]
   (delete-store! (or (:path @state) (db-path))))
  ([path]
   (locking lock
     (when (= path (:path @state))
       (close!))
     (doseq [suffix ["" "-wal" "-shm" "-journal"]]
       (io/delete-file (str path suffix) true))
     nil)))

(defn do-with-conn
  "Call `(f conn)` with the store's connection while holding the store lock, opening the store if needed.
  Prefer [[with-conn]]."
  [f]
  (locking lock
    (when-not @state
      (open!))
    (f (:conn @state))))

(defmacro with-conn
  "Evaluate `body` with `conn-binding` bound to the store's `java.sql.Connection`. Access is serialized: SQLite has a
  single writer and one JDBC connection is not safe to share between threads."
  [[conn-binding] & body]
  `(do-with-conn (fn [~(vary-meta conn-binding assoc :tag `Connection)] ~@body)))

(defn vec1-info
  "The loaded vec1 version string, e.g. `version 0.7 (NEON, multi-threaded)`."
  []
  (with-conn [conn]
    (:info (jdbc/execute-one! conn ["SELECT vec1_info() AS info"] {:builder-fn jdbc.rs/as-unqualified-maps}))))

;;; ---------------------------------------------------- Blobs -----------------------------------------------------

(defn ->blob
  "Encode `embedding` (a seq of numbers) as vec1's native vector format: float32s in machine byte order."
  ^bytes [embedding]
  (let [buffer (.order (ByteBuffer/allocate (* 4 (count embedding))) (ByteOrder/nativeOrder))]
    (doseq [x embedding]
      (.putFloat buffer (float x)))
    (.array buffer)))

(defn <-blob
  "Decode a vec1 vector blob into a vector of floats."
  [^bytes blob]
  (let [buffer (.order (ByteBuffer/wrap blob) (ByteOrder/nativeOrder))]
    (into [] (repeatedly (quot (alength blob) 4) #(.getFloat buffer)))))
