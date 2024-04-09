(ns metabase.db.update-h2
  "Functions for updating an H2 v1.x database to v2.x"
  (:require
   [clj-http.client :as http]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.java.shell :as sh]
   [clojure.string :as str]
   [metabase.util.files :as u.files]
   [metabase.util.log :as log])
  (:import
   (java.nio.file Files)))

(set! *warn-on-reflection* true)

;;; Generic utils

(defn- head
  "Returns seq of first n bytes of file at path"
  [path n]
  (let [f (io/file path)
        bytes (byte-array n)]
    (with-open [input (io/input-stream f)]
      (take (.read input bytes) bytes))))

(defn- try-char
  "Tries to parse and return x as char, else nil"
  [x]
  (try (char x) (catch IllegalArgumentException _ nil)))

;;; H2-specific utils

(defn- h2-base-path
  "Returns H2 database base path from JDBC URL, i.e. without .mv.db"
  [jdbc-url]
  (second (re-matches #"jdbc:h2:file:(.*)$" jdbc-url)))

(defn- db-version!
  "Returns the H2 major version number of H2 MV database file at path, or nil if no file exists"
  [jdbc-url]
  ;; The H2 database version is indicated in the "format:" key of the MV file header, which is 4096 bytes
  ;; See: https://www.h2database.com/html/mvstore.html
  (when-let [path (str (h2-base-path jdbc-url) ".mv.db")]
    (when (.exists (io/file path))
      (let [header     (str/join (map try-char (head path 4096)))
            format-key "format:"]
        (when-not (.startsWith header "H:2")
          (throw (IllegalArgumentException. "File does not appear to be an H2 MV database file")))
        (Integer/parseInt (str (nth header (+ (.indexOf header format-key) (count format-key)))))))))

;;; Migration constants/utils

(def ^:private v1-jar-url
  "https://repo1.maven.org/maven2/com/h2database/h2/1.4.197/h2-1.4.197.jar")

(defn- tmp-path
  [& components]
  (str (apply u.files/get-path (System/getProperty "java.io.tmpdir") components)))

(def ^:private jar-path
  (tmp-path (last (.split ^String v1-jar-url "/"))))

(def ^:private migration-sql-path
  (tmp-path "metabase-migrate-h2-db-v1-v2.sql"))

;;; Migration logic

(defn- update!
  "Updates existing H2 v1 database to H2 v2"
  [jdbc-url]
  (when-not (.exists (io/file jar-path))
    (log/info "Downloading" v1-jar-url)
    (io/copy (:body (http/get v1-jar-url {:as :stream})) (io/file jar-path)))
  (log/info "Creating v1 database backup at" migration-sql-path)
  (let [result (sh/sh "java" "-cp" jar-path "org.h2.tools.Script" "-url" jdbc-url "-script" migration-sql-path)]
    (when-not (= 0 (:exit result))
      (throw (ex-info "Dumping H2 database failed." {:result result}))))
  (let [base-path (h2-base-path jdbc-url)
        backup-path (str base-path ".v1-backup.mv.db")]
    (log/info "Moving old app database to" backup-path)
    (Files/move (u.files/get-path (str base-path ".mv.db"))
                (u.files/get-path backup-path)
                (into-array java.nio.file.CopyOption [])))
  (log/info "Restoring backup into v2 database")
  (jdbc/execute! {:connection-uri jdbc-url} ["RUNSCRIPT FROM ? FROM_1X" migration-sql-path])
  (log/info "Backup restored into H2 v2 database. Update complete!"))

(def ^:private h2-lock (Object.))

(defn- update-needed?
  [jdbc-url]
  (= 1 (db-version! jdbc-url)))

(defn update-if-needed!
  "Updates H2 database at db-path from version 1.x to 2.x if jdbc-url points
  to version 1 H2 database."
  [jdbc-url]
  (when (and (h2-base-path jdbc-url) (update-needed? jdbc-url))
    (locking h2-lock
      ;; the database may have been upgraded while we waited for the lock
      (when (update-needed? jdbc-url)
        (log/info "H2 v1 database detected, updating...")
        (try
         (update! jdbc-url)
         (catch Exception e
           (log/error e "Failed to update H2 database:")
           (throw e)))))))
