(ns metabase.sample-data.embedded-postgres
  "Production lifecycle for the embedded Postgres instance that hosts the
   sample database.

   On the first call to `ensure-started!`, this namespace will:

   1. Resolve a stable data directory (default `<plugins-dir>/sample-postgres-data`,
      overridable via `MB_SAMPLE_PG_DATA_DIR`).
   2. If the directory's `PG_VERSION` doesn't match the embedded binaries' major
      version, wipe the directory so Postgres can re-initdb.
   3. Start an `EmbeddedPostgres` pointed at that directory (Zonky runs initdb
      automatically when the directory is empty).
   4. If the sample dump (`resources/sample-database.sql.gz`) has not yet been
      loaded into this directory, `DROP SCHEMA public CASCADE`, recreate, and
      stream the dump into the running server.
   5. Record a sentinel file (`.metabase-sample-loaded`) containing the
      sha-256 of the dump so subsequent starts can short-circuit the reload.

   Subsequent calls are idempotent — they return the already-running instance.

   A JVM shutdown hook is registered on the first successful start so the
   Postgres process is stopped cleanly on exit."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.plugins.core :as plugins]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log]
   [next.jdbc :as jdbc])
  (:import
   (io.zonky.test.db.postgres.embedded EmbeddedPostgres)
   (java.io File)
   (java.nio.file Files)
   (java.security MessageDigest)
   (java.util.zip GZIPInputStream)))

(set! *warn-on-reflection* true)

(def ^:private dump-resource "sample-database.sql.gz")

(def ^:private sentinel-filename ".metabase-sample-loaded")

(def ^:private dbname "sample")

(def ^:private superuser "postgres")

;; Major version of the Postgres binaries we bundle (kept in sync with the
;; `io.zonky.test.postgres/embedded-postgres-binaries-*` deps in deps.edn).
;; If the data directory's PG_VERSION doesn't match, we wipe it.
(def ^:private bundled-pg-major-version "18")

(defonce ^:private state
  ;; {:pg <EmbeddedPostgres>, :port <int>, :data-dir <File>}
  (atom nil))

(defonce ^:private shutdown-hook-registered? (atom false))

(defn- data-dir ^File []
  (let [override (System/getenv "MB_SAMPLE_PG_DATA_DIR")]
    (io/file (if (str/blank? override)
               (str (u.files/append-to-path (plugins/plugins-dir) "sample-postgres-data"))
               override))))

(defn- sha-256-hex ^String [input-bytes]
  (let [md (MessageDigest/getInstance "SHA-256")]
    (apply str (map #(format "%02x" %) (.digest md input-bytes)))))

(defn- dump-bytes ^bytes []
  (with-open [in (io/input-stream (or (io/resource dump-resource)
                                      (throw (ex-info "Sample database dump resource missing"
                                                      {:resource dump-resource}))))]
    (.readAllBytes in)))

(defn- expected-sentinel
  "What we'd write to the sentinel file for the current resource bundle."
  []
  (str bundled-pg-major-version " " (sha-256-hex (dump-bytes))))

(defn- already-loaded? [^File dir]
  (let [sentinel (io/file dir sentinel-filename)]
    (and (.exists sentinel)
         (= (str/trim (slurp sentinel)) (expected-sentinel)))))

(defn- wipe-dir! [^File dir]
  (when (.exists dir)
    (log/infof "Wiping embedded-postgres data directory at %s" (.getAbsolutePath dir))
    (doseq [^File f (reverse (file-seq dir))]
      (.delete f))))

(defn- ensure-version-matches!
  "If `dir` exists and its PG_VERSION disagrees with the binaries we ship,
   wipe it. Postgres refuses to start across major-version boundaries."
  [^File dir]
  (let [pg-version-file (io/file dir "PG_VERSION")]
    (when (.exists pg-version-file)
      (let [on-disk (str/trim (slurp pg-version-file))]
        (when-not (= on-disk bundled-pg-major-version)
          (log/warnf "Embedded postgres binary version %s != data dir PG_VERSION %s; wiping"
                     bundled-pg-major-version on-disk)
          (wipe-dir! dir))))))

(defn- start-pg! ^EmbeddedPostgres [^File dir]
  (.mkdirs dir)
  (.start
   (doto (EmbeddedPostgres/builder)
     (.setDataDirectory dir))))

(defn- spec-for [pg dbname]
  {:dbtype "postgresql"
   :host "localhost"
   :port (.getPort ^EmbeddedPostgres pg)
   :dbname dbname
   :user superuser})

(defn- ensure-sample-db-created! [pg]
  (with-open [conn (jdbc/get-connection (spec-for pg "postgres"))]
    (let [exists? (-> (jdbc/execute-one!
                       conn ["SELECT 1 AS x FROM pg_database WHERE datname = ?" dbname])
                      :x)]
      (when-not exists?
        (jdbc/execute! conn [(format "CREATE DATABASE \"%s\"" dbname)])))))

(defn- reset-public-schema! [pg]
  (with-open [conn (jdbc/get-connection (spec-for pg dbname))]
    (jdbc/execute! conn ["DROP SCHEMA IF EXISTS public CASCADE"])
    (jdbc/execute! conn ["CREATE SCHEMA public"])))

(defn- read-dump-text ^String []
  (with-open [in  (-> (io/resource dump-resource) io/input-stream GZIPInputStream.)
              rdr (io/reader in)]
    (slurp rdr)))

(defn- load-dump! [pg]
  (log/info "Loading sample-database dump into embedded Postgres...")
  (with-open [conn (jdbc/get-connection (spec-for pg dbname))
              stmt (.createStatement conn)]
    (.execute stmt (read-dump-text)))
  (log/info "Sample-database dump loaded."))

(defn- write-sentinel! [^File dir]
  (spit (io/file dir sentinel-filename) (expected-sentinel)))

(defn- register-shutdown-hook! []
  (when (compare-and-set! shutdown-hook-registered? false true)
    (.addShutdownHook (Runtime/getRuntime)
                      (Thread. ^Runnable
                       (fn []
                         (try
                           (when-let [pg (:pg @state)]
                             (.close ^EmbeddedPostgres pg))
                           (catch Throwable e
                             (log/warn e "Error stopping embedded postgres"))))))))

(defn ensure-started!
  "Idempotently start the embedded Postgres instance that hosts the sample
   database, loading the bundled SQL dump on first run. Returns a map of
   `{:host :port :dbname :user :password}` suitable for use as a Metabase
   Database `:details`."
  []
  (or (when-let [s @state]
        {:host "localhost"
         :port (:port s)
         :dbname dbname
         :user superuser
         :password ""})
      (locking state
        (or (when-let [s @state]
              {:host "localhost" :port (:port s) :dbname dbname :user superuser :password ""})
            (let [dir (data-dir)]
              (ensure-version-matches! dir)
              (let [pg          (start-pg! dir)
                    actual-port (.getPort pg)]
                (try
                  (ensure-sample-db-created! pg)
                  (when-not (already-loaded? dir)
                    (reset-public-schema! pg)
                    (load-dump! pg)
                    (write-sentinel! dir))
                  (reset! state {:pg pg :port actual-port :data-dir dir})
                  (register-shutdown-hook!)
                  (log/infof "Embedded sample Postgres ready on port %d (data dir: %s)"
                             actual-port (.getAbsolutePath dir))
                  {:host "localhost"
                   :port actual-port
                   :dbname dbname
                   :user superuser
                   :password ""}
                  (catch Throwable e
                    (.close pg)
                    (throw e)))))))))

(defn stop!
  "Stop the embedded Postgres instance if it's running. Mostly for tests."
  []
  (locking state
    (when-let [s @state]
      (try
        (.close ^EmbeddedPostgres (:pg s))
        (catch Throwable e
          (log/warn e "Error stopping embedded postgres")))
      (reset! state nil))))
