(ns metabase.cmd.dump-to-h2
  "Commands for dumping data to an H2 file from app database.
   Run this with `lein run dump-to-h2` or `java -jar metabase.jar dump-to-h2`.

   Test this as follows:
  ```lein run dump-to-h2 \"/path/to/h2\"```
   Validate with:
  ```lein run load-from-h2 \"/path/to/h2\"```
   "
  (:require [clojure.java
             [io :as io]
             [jdbc :as jdbc]]
            [clojure.string :as str]
            [colorize.core :as color]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.cmd.load-from-h2 :refer [entities]]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db])
  (:import java.sql.SQLException))


(defn- println-ok [] (println (color/green "[OK]")))


;;; --------------------------------------------- H2 Connection Options ----------------------------------------------

(defn- add-file-prefix-if-needed [connection-string-or-filename]
  (if (str/starts-with? connection-string-or-filename "file:")
    connection-string-or-filename
    (str "file:" (.getAbsolutePath (io/file connection-string-or-filename)))))

(defn- h2-details [h2-connection-string-or-nil]
  (let [h2-filename (add-file-prefix-if-needed h2-connection-string-or-nil)]
    (mdb/jdbc-spec {:type :h2, :db h2-filename})))


;;; ------------------------------------------- Fetching & Inserting Rows --------------------------------------------

(defn- objects->colums+values
  "Given a sequence of objects/rows fetched from the H2 DB, return a the `columns` that should be used in the `INSERT`
  statement, and a sequence of rows (as sequences)."
  [objs]
  ;; 1) `:sizeX` and `:sizeY` come out of H2 as `:sizex` and `:sizey` because of automatic lowercasing; fix the names
  ;;    of these before putting into the new DB
  ;;
  ;; 2) Need to wrap the column names in quotes because Postgres automatically lowercases unquoted identifiers
  (let [source-keys (keys (first objs))
        dest-keys (for [k source-keys]
                    ((db/quote-fn) (name (case k
                                           :sizex :sizeX
                                           :sizey :sizeY
                                           k))))]
    {:cols dest-keys
     :vals (for [row objs]
             (map row source-keys))}))

(def ^:private chunk-size 100)

(defn- insert-chunk! [target-db-conn table-name chunkk]
  (print (color/blue \.))
  (flush)
  (try
    (let [{:keys [cols vals]} (objects->colums+values chunkk)]
      (jdbc/insert-multi! target-db-conn table-name (map str/upper-case cols) vals))
    (catch SQLException e
      (jdbc/print-sql-exception-chain e)
      (throw e))))

(defn- insert-entity! [target-db-conn {table-name :table, entity-name :name} objs]
  (print (u/format-color 'blue "Transferring %s data..." entity-name))
  (flush)
  ;; The connection closes prematurely on occasion when we're inserting thousands of rows at once. Break into
  ;; smaller chunks so connection stays alive
  (doseq [chunk (partition-all chunk-size objs)]
    (insert-chunk! target-db-conn table-name chunk))
  (println-ok))

(def ^:private table-select-fragments
  {"metabase_field" "ORDER BY id ASC"}) ; ensure ID order to ensure that parent fields are inserted before children

(defn- load-data! [target-db-conn]
  (println "Source db:" (dissoc (mdb/jdbc-spec) :password))
  (jdbc/with-db-connection [db-conn (mdb/jdbc-spec)]
    (doseq [{table-name :table, :as e} entities
            :let [fragment (table-select-fragments (str/lower-case (name table-name)))
                  rows     (jdbc/query db-conn [(str "SELECT * FROM " (name table-name)
                                                     (when fragment (str " " fragment)))])]
            :when (seq rows)]
      (insert-entity! target-db-conn e rows))))

(defn- get-target-db-conn [h2-filename]
  (h2-details h2-filename))

;;; --------------------------------------------------- Public Fns ---------------------------------------------------

(defn dump-to-h2!
  "Transfer data from existing database specified by connection string to the H2 DB specified by env vars. Intended as a
  tool for migrating from one instance to another using H2 as serialization target.

  Defaults to using `@metabase.db/db-file` as the connection string.

  Target H2 DB will be deleted if it exists, unless `keep-existing?` is truthy."
  [h2-filename & [{:keys [keep-existing?]
                   :or   {keep-existing? false}}]]
  (let [h2-filename (or h2-filename "metabase_dump.h2")]
    (println "Dumping to " h2-filename)
    (doseq [filename [h2-filename
                      (str h2-filename ".mv.db")]]
      (when (and (.exists (io/file filename))
                 (not keep-existing?))
        (io/delete-file filename)
        (println (u/format-color 'red (trs "Output H2 database already exists: %s, removing.") filename))))

    (println "Dumping from configured Metabase db to H2 file" h2-filename)

    (mdb/setup-db!* (get-target-db-conn h2-filename) true)
    (mdb/setup-db!)

    (if (= :h2 (mdb/db-type))
      (println (u/format-color 'yellow (trs "Don't need to migrate, just use the existing H2 file")))
      (jdbc/with-db-transaction [target-db-conn (get-target-db-conn h2-filename)]
        (println "Conn of target: " target-db-conn)
        (println-ok)
        (println (u/format-color 'blue "Loading data..."))
        (load-data! target-db-conn)
        (println-ok)
        (jdbc/db-unset-rollback-only! target-db-conn)))

    (println "Dump complete")))
