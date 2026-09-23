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
   [metabase-enterprise.semantic-search.embedding :as semantic.embedding]
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

;;; ---------------------------------------------------- Schema ----------------------------------------------------

(def schema-version
  "Version of the store's DDL. Bump it on any schema change: a store written by another version is deleted and
  recreated on open (the store is a cache; re-indexing refills it)."
  1)

(def vec-meta-columns
  "`search_doc` columns duplicated onto the vec1 table. vec1 applies filters on these inside the KNN scan, so they
  don't shrink the top k; filters on any other column do."
  ["model" "archived" "verified" "database_id" "creator_id" "collection_id"])

(def ^:private search-doc-ddl
  ;; Same column names as the pgvector index table (`semantic.index/index-table-schema`), minus the embedding and the
  ;; tsvectors, so the pgvector query code can later run against it. `id` is the vec1 rowid.
  "CREATE TABLE search_doc (
     id                   INTEGER PRIMARY KEY,
     model                TEXT NOT NULL,
     model_id             TEXT NOT NULL,
     collection_id        INTEGER,
     personal_owner_id    INTEGER,
     creator_id           INTEGER,
     database_id          INTEGER,
     last_editor_id       INTEGER,
     name                 TEXT NOT NULL,
     content              TEXT NOT NULL,
     display_type         TEXT,
     archived             BOOLEAN DEFAULT FALSE,
     official_collection  BOOLEAN,
     pinned               BOOLEAN,
     verified             BOOLEAN,
     collection_type      TEXT,
     root_collection_type TEXT,
     data_layer           TEXT,
     data_authority       TEXT,
     curated              BOOLEAN,
     dashboardcard_count  INTEGER,
     view_count           INTEGER,
     created_at           TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
     model_created_at     TEXT,
     model_updated_at     TEXT,
     last_viewed_at       TEXT,
     legacy_input         TEXT,
     metadata             TEXT,
     UNIQUE (model, model_id))")

(defn- resolve-model
  "`embedding-model` with its `:embedding-space-id`, resolving it through the provider only when missing."
  [embedding-model]
  (if (:embedding-space-id embedding-model)
    embedding-model
    (semantic.embedding/resolve-model embedding-model)))

(defn- expected-meta
  "The `meta` table contents for a store holding embeddings of the (resolved) `embedding-model`. A store is reusable
  only when every entry matches -- the same identity pgvector uses to find a compatible index."
  [{:keys [provider model-name vector-dimensions embedding-space-id]}]
  {"schema_version"     (str schema-version)
   "provider"           (str provider)
   "model_name"         (str model-name)
   "vector_dimensions"  (str vector-dimensions)
   "embedding_space_id" (str embedding-space-id)})

(defn- table-names [conn]
  (into #{} (map :name) (jdbc/execute! conn ["SELECT name FROM sqlite_master WHERE type = 'table'"]
                                       {:builder-fn jdbc.rs/as-unqualified-maps})))

(defn- read-meta
  "The `meta` table as a map, or nil when the file has no `meta` table."
  [conn]
  (when (contains? (table-names conn) "meta")
    (into {} (map (juxt :k :v)) (jdbc/execute! conn ["SELECT k, v FROM meta"] {:builder-fn jdbc.rs/as-unqualified-maps}))))

(defn- create-schema! [conn meta]
  (jdbc/with-transaction [tx conn]
    (jdbc/execute! tx ["CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)"])
    (jdbc/execute! tx [search-doc-ddl])
    (jdbc/execute! tx [(str "CREATE VIRTUAL TABLE search_vec USING vec1(vector, " (str/join ", " vec-meta-columns) ")")])
    ;; Flat nearest-neighbour index with cosine distance: exhaustive, needs no training.
    (jdbc/execute! tx ["INSERT INTO search_vec(cmd, arg) VALUES ('rebuild', '{index:\"flat\", distance:\"cos\"}')"])
    (doseq [[k v] (sort meta)]
      (jdbc/execute! tx ["INSERT INTO meta (k, v) VALUES (?, ?)" k v]))))

;;; -------------------------------------------------- Connection --------------------------------------------------

(defonce ^:private lock (Object.))

(defonce ^:private state
  ;; {:conn Connection, :path String, :embedding-model resolved-model, :schema status} while open, nil otherwise.
  ;; Written only while holding `lock`.
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

(defn- delete-files! [path]
  (doseq [suffix ["" "-wal" "-shm" "-journal"]]
    (io/delete-file (str path suffix) true)))

(defn- open-store
  "Open `path` with a schema for `embedding-model`: reuse a matching store, create one in a new file, and delete and
  recreate a store written for another model or schema version (or a file that isn't a store)."
  [path embedding-model]
  (let [expected (expected-meta embedding-model)
        conn     (open-connection path)]
    (try
      (let [stored (read-meta conn)]
        (cond
          (= expected stored)
          {:conn conn :schema :existing}

          (and (nil? stored) (empty? (table-names conn)))
          (do (create-schema! conn expected)
              {:conn conn :schema :created})

          :else
          (do (log/warnf "SQLite semantic search store at %s does not match %s (found %s); recreating it"
                         path (pr-str expected) (pr-str stored))
              (.close conn)
              (delete-files! path)
              (let [conn (open-connection path)]
                (try
                  (create-schema! conn expected)
                  {:conn conn :schema :recreated}
                  (catch Throwable t
                    (.close conn)
                    (throw t)))))))
      (catch Throwable t
        (when-not (.isClosed conn)
          (.close conn))
        (throw t)))))

(defn open!
  "Open the store at `path` (default [[db-path]]) for `:embedding-model` (default: the configured model), creating
  or recreating its schema as needed (see [[store-info]] for which). Closes a store open at another path or for
  another model; no-op when already open at `path` for the same model. Returns `path`."
  ([]
   (open! (or (db-path)
              (throw (ex-info "MB_SEMANTIC_SEARCH_SQLITE_PATH is not set" {})))))
  ([path]
   (open! path {}))
  ([path {:keys [embedding-model]}]
   (let [embedding-model (resolve-model (or embedding-model (semantic.embedding/get-configured-model)))]
     (locking lock
       (when-not (and (= path (:path @state))
                      (= (expected-meta embedding-model) (expected-meta (:embedding-model @state))))
         (when-let [{:keys [^Connection conn]} @state]
           (.close conn))
         (reset! state nil)
         (io/make-parents (io/file path))
         (let [{:keys [conn schema]} (open-store path embedding-model)]
           (reset! state {:conn conn :path path :embedding-model embedding-model :schema schema})
           (log/infof "Opened SQLite semantic search store at %s (%s)" path (name schema))))
       path))))

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
     (delete-files! path)
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

;; with-conn opens the store if needed, so these report the store the next call would use.

(defn embedding-model
  "The resolved embedding model the open store holds vectors for."
  []
  (with-conn [_conn]
    (:embedding-model @state)))

(defn store-info
  "`{:path :schema :embedding-model :meta}` for the store; `:schema` is how the last open found it: `:created`,
  `:existing` or `:recreated`."
  []
  (with-conn [conn]
    (-> @state
        (select-keys [:path :schema :embedding-model])
        (assoc :meta (read-meta conn)))))

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
