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
            [metabase.cmd.dump-and-load-common :as common]
            [metabase.db
             [env :as mdb.env]
             [setup :as mdb.setup]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]))

(def ^:private table-select-fragments
  {"metabase_field" "ORDER BY id ASC"}) ; ensure ID order to ensure that parent fields are inserted before children

(defn- load-data! [source-jdbc-spec target-db-type target-db-conn]
  (println "Source db:" (dissoc source-jdbc-spec :password))
  (jdbc/with-db-connection [source-db-conn source-jdbc-spec]
    (doseq [{table-name :table, :as e} entities
            :let [fragment (table-select-fragments (str/lower-case (name table-name)))
                  rows     (jdbc/query source-db-conn [(str "SELECT * FROM " (name table-name)
                                                            (when fragment (str " " fragment)))])]
            :when (seq rows)]
      (common/insert-entity! target-db-type target-db-conn e rows))))

(defn- delete-existing-h2-database-files! [h2-filename keep-existing?]
  (doseq [filename [h2-filename
                    (str h2-filename ".mv.db")]]
    (when (and (.exists (io/file filename))
               (not keep-existing?))
      (io/delete-file filename)
      (println (u/format-color 'red (trs "Output H2 database already exists: %s, removing.") filename)))))

(defn dump!
  "Dump/snapshot data from a (presumably non-empty) source application database with `source-jdbc-spec` into a
  destination database with `target-jdbc-spec`."
  [source-db-type source-jdbc-spec target-db-type target-jdbc-spec]
  (mdb.setup/setup-db! :h2 target-jdbc-spec true)
  (if (= :h2 source-db-type)
    (println (u/format-color 'yellow (trs "Don't need to migrate, just use the existing H2 file")))
    (jdbc/with-db-transaction [target-db-conn target-jdbc-spec]
      (println "Conn of target: " target-db-conn)
      (common/println-ok)
      (println (u/format-color 'blue "Loading data..."))
      (load-data! source-jdbc-spec target-db-type target-db-conn)
      (common/println-ok)
      (jdbc/db-unset-rollback-only! target-db-conn)))
  (println "Dump complete"))

(defn dump-to-h2!
  "Transfer data from existing database specified by connection string to the H2 DB specified by env vars. Intended as a
  tool for migrating from one instance to another using H2 as serialization target.

  Defaults to using `@metabase.db.env/db-file` as the connection string.

  Target H2 DB will be deleted if it exists, unless `keep-existing?` is truthy."
  ([h2-filename]
   (dump-to-h2! h2-filename nil))

  ([h2-filename {:keys [keep-existing?]
                 :or   {keep-existing? false}}]
   (let [h2-filename  (or h2-filename "metabase_dump.h2")
         h2-jdbc-spec (common/h2-jdbc-spec h2-filename)]
     (println "Dumping from configured Metabase db to H2 file" h2-filename)
     (delete-existing-h2-database-files! h2-filename keep-existing?)
     (dump! @mdb.env/db-type @mdb.env/jdbc-spec :h2 h2-jdbc-spec))))
