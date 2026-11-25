(ns metabase.app-db.snapshot-test-util.cache
  "Local snapshots at inclusive migration boundaries. Each test gets a separate database."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.java.shell :as shell]
   [clojure.string :as str]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.app-db.liquibase.versions :as versions]
   [metabase.app-db.schema-migrations-test.impl :as impl]
   [metabase.app-db.snapshot-test-util :as snapshot]
   [metabase.app-db.snapshot-test-util.generate :as generate]
   [metabase.app-db.snapshot-test-util.server :as server])
  (:import
   (java.io File OutputStream RandomAccessFile)
   (java.nio.file CopyOption Files StandardCopyOption)
   (java.security DigestInputStream MessageDigest)
   (java.util HexFormat)))

(set! *warn-on-reflection* true)

(def ^:private format-version 1)

(defn- sha256 [^String value]
  (.formatHex (HexFormat/of) (.digest (MessageDigest/getInstance "SHA-256") (.getBytes value "UTF-8"))))

(defn- file-digest [file]
  (let [digest (MessageDigest/getInstance "SHA-256")]
    (with-open [stream (DigestInputStream. (io/input-stream file) digest)]
      (io/copy stream (OutputStream/nullOutputStream)))
    (.formatHex (HexFormat/of) (.digest digest))))

(defn- git-output [root & args]
  (let [{:keys [exit out err]} (apply shell/sh "git" "-C" (str root) args)]
    (when-not (zero? exit)
      (throw (ex-info "Cannot identify snapshot source checkout" {:error err})))
    out))

(defn- source-identity [root]
  (sha256
   (pr-str [(git-output root "rev-parse" "HEAD")
            (git-output root "diff" "--no-ext-diff" "--no-textconv" "--binary" "HEAD" "--")
            (mapv (fn [path] [path (file-digest (io/file root path))])
                  (sort (remove str/blank?
                                (str/split (git-output root "ls-files" "--others" "--exclude-standard" "-z")
                                           #"\u0000"))))])))

(defn- dependency-identity [root classpath]
  (let [root-path (.toPath (.getCanonicalFile (io/file root)))]
    (mapv (fn [path]
            (let [file (.getCanonicalFile (io/file path))]
              (cond
                (.isFile file) [(.getName file) (file-digest file)]
                (.startsWith (.toPath file) root-path)
                [(str (.relativize root-path (.toPath file)))
                 (mapv (fn [^File compiled]
                         [(str (.relativize root-path (.toPath compiled))) (file-digest compiled)])
                       (sort-by str (filter #(and (.isFile ^File %) (str/ends-with? (str %) ".class"))
                                            (file-seq file))))]
                :else (mapv (fn [^File dependency]
                              [(str (.relativize (.toPath file) (.toPath dependency))) (file-digest dependency)])
                            (sort-by str (filter #(.isFile ^File %) (file-seq file)))))))
          classpath)))

(defn- input-identity []
  (let [root (str/trim (git-output "." "rev-parse" "--show-toplevel"))]
    (sha256 (pr-str [(source-identity root)
                     (dependency-identity root (str/split (System/getProperty "java.class.path")
                                                          (re-pattern File/pathSeparator)))
                     (System/getProperty "java.version")]))))

(defn- cache-directory [{:keys [cache-dir]}]
  (io/file (or cache-dir
               (io/file (or (not-empty (System/getenv "XDG_CACHE_HOME"))
                            (str (System/getProperty "user.home") "/.cache"))
                        "metabase" "app-db-snapshots"))))

(defn- request-identity! [flavor through-id]
  (when-not (snapshot/flavors flavor)
    (throw (ex-info "Unsupported snapshot flavor" {:flavor flavor})))
  (when-not (and (string? through-id) (not (str/blank? through-id)))
    (throw (ex-info "A migration boundary changeset ID is required" {:through-changeset-id through-id})))
  (when-not (snapshot/matches-environment?)
    (throw (ex-info "Cached snapshots require encryption to be disabled" {})))
  (sorted-map :format format-version
              :flavor flavor
              :through-changeset-id through-id
              :recorded-version (versions/current-recorded-version)
              :inputs (input-identity)
              :image (server/image-identity! flavor)))

(defn- cached? [sql-file metadata-file identity]
  (try
    (let [metadata (edn/read-string (slurp metadata-file))]
      (and (= identity (:identity metadata))
           (= (file-digest sql-file) (:sha256 metadata))))
    (catch java.io.IOException _ false)
    (catch RuntimeException _ false)))

(defn- validate-snapshot! [flavor through-id sql]
  (generate/do-with-empty-db!
   flavor
   (fn [conn _server]
     (snapshot/load-sql! conn flavor sql)
     (liquibase/with-liquibase [lb conn]
       (.validate lb))
     (let [boundary (jdbc/query {:connection conn}
                                ["SELECT c.id FROM DATABASECHANGELOG c
                                 JOIN DATABASECHANGELOG_VERSION v ON c.deployment_id = v.deployment_id
                                 WHERE c.id = ? AND v.ran_migrations = TRUE" through-id])]
       (when-not (seq boundary)
         (throw (ex-info "Snapshot does not record its migration boundary version"
                         {:through-changeset-id through-id})))))))

(defn- atomic-write! [^File destination content]
  (let [temporary (File/createTempFile "snapshot-" ".tmp" (.getParentFile destination))]
    (try
      (spit temporary content)
      (Files/move (.toPath temporary) (.toPath destination)
                  (into-array CopyOption [StandardCopyOption/ATOMIC_MOVE StandardCopyOption/REPLACE_EXISTING]))
      (finally
        (Files/deleteIfExists (.toPath temporary))))))

(defn- generate-entry! [sql-file metadata-file {:keys [flavor through-changeset-id] :as identity}]
  (let [{:keys [content]} (generate/dump-boundary! flavor through-changeset-id)]
    (validate-snapshot! flavor through-changeset-id content)
    (when-not (= identity (request-identity! flavor through-changeset-id))
      (throw (ex-info "Snapshot inputs changed during generation; retry with the updated code" {})))
    (atomic-write! sql-file content)
    (atomic-write! metadata-file (pr-str {:identity identity :sha256 (file-digest sql-file)}))))

(def ^:private process-lock (Object.))

(defn ensure-snapshot!
  "Return a cached SQL file through the inclusive changeset ID. Generate and validate missing or corrupt entries.
  Options: `:cache-dir` overrides the user cache directory. Non-H2 requests require Docker."
  (^File [flavor through-id]
   (ensure-snapshot! flavor through-id {}))
  (^File [flavor through-id options]
   (let [identity      (request-identity! flavor through-id)
         directory     (cache-directory options)
         cache-key     (sha256 (pr-str identity))
         sql-file      (io/file directory (str cache-key ".sql"))
         metadata-file (io/file directory (str cache-key ".edn"))
         lock-file     (io/file directory (str cache-key ".lock"))]
     (io/make-parents sql-file)
     (locking process-lock
       (with-open [file    (RandomAccessFile. lock-file "rw")
                   channel (.getChannel file)
                   _lock   (.lock channel)]
         (when-not (cached? sql-file metadata-file identity)
           (generate-entry! sql-file metadata-file identity))))
     sql-file)))

(defn do-with-snapshot!
  "Call `f` with a separate database restored through the inclusive changeset ID, then close and remove it."
  [{:keys [flavor through-changeset-id] :as options} f]
  (let [file    (ensure-snapshot! flavor through-changeset-id options)
        db-type (if (#{:mariadb :mariadb-legacy-timestamp} flavor) :mysql flavor)]
    (impl/with-temp-empty-app-db [conn db-type]
      (when-not (= flavor (snapshot/flavor conn db-type))
        (throw (ex-info "Test database does not match the snapshot flavor" {:flavor flavor})))
      (snapshot/load-sql! conn flavor (slurp file))
      (f conn))))

(defmacro with-snapshot
  "Bind a connection using `:flavor`, inclusive `:through-changeset-id`, and optional `:cache-dir`."
  {:style/indent 1}
  [[conn options] & body]
  `(do-with-snapshot! ~options (fn [~conn] ~@body)))
