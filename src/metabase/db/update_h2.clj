(ns metabase.db.update-h2
  "Functions for updating an H2 v1.x database to v2.x"
  (:require    [clj-http.client :as http]
               [clojure.java.io :as io]
               [clojure.java.jdbc :as jdbc]
               [clojure.java.shell :as sh]
               [clojure.string :as str]
               [clojure.tools.logging :as log]
               [metabase.util.i18n :refer [trs]])
  (:import [java.nio.file Files Paths]))

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

(defn db-version
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

(def ^:private jar-path
  "/tmp/metabase_h2-1.4.197.jar")

(def ^:private migration-sql-path "/tmp/metabase-migrate-h2-db-v1-v2.sql")

;;; Migration logic

(defn- update!
  [jdbc-url]
  (log/info (trs "Downloading {0}" v1-jar-url))
  (clojure.java.io/copy (:body (http/get v1-jar-url {:as :stream})) (io/file jar-path))
  (log/info (trs "Creating v1 database backup at {0}" migration-sql-path))
  (let [result (sh/sh "java" "-cp" jar-path "org.h2.tools.Script" "-url" jdbc-url "-script" migration-sql-path)]
    (when-not (= 0 (:exit result))
      (log/error "Dumping H2 database failed:" (:out result))
      (throw (RuntimeException. "Dumping H2 database failed!"))))
  (log/info (trs "Moving old H2 database to backup location"))
  (let [base-path   (h2-base-path jdbc-url)]
    (Files/move (Paths/get (str base-path ".mv.db") (into-array String []))
                (Paths/get (str base-path ".v1-backup.mv.db") (into-array String []))
                (into-array java.nio.file.CopyOption [])))
  (log/info (trs "Restoring backup into v2 database"))
  (jdbc/execute! {:connection-uri jdbc-url} ["RUNSCRIPT FROM ? FROM_1X" migration-sql-path])
  (log/info (trs "Backup restored into H2 v2 database. Update complete!")))

(def ^:private h2-lock (Object.))

(defn update-if-needed
  "Updates H2 database at db-path from version 1.x to 2.x if jdbc-url points
   to version 1 H2 database."
  [jdbc-url]
  (locking h2-lock
    (when (= 1 (db-version jdbc-url))
      (log/info (trs "H2 v1 database detected, updating..."))
      (try
        (update! jdbc-url)
        (catch Exception e
          (log/error (trs "Failed to update H2 database:") e)
          (throw e))))))
