(ns metabase.cmd.load-from-h2
  "Commands for loading data from an H2 file into another database.
   Run this with `lein run load-from-h2` or `java -jar metabase.jar load-from-h2`.

   Test this as follows:

   ```
   # Postgres
   psql -c 'DROP DATABASE IF EXISTS metabase;'
   psql -c 'CREATE DATABASE metabase;'
   MB_DB_TYPE=postgres MB_DB_HOST=localhost MB_DB_PORT=5432 MB_DB_USER=camsaul MB_DB_DBNAME=metabase lein run load-from-h2

   # MySQL
   mysql -u root -e 'DROP DATABASE IF EXISTS metabase; CREATE DATABASE metabase;'
   MB_DB_TYPE=mysql MB_DB_HOST=localhost MB_DB_PORT=3305 MB_DB_USER=root MB_DB_DBNAME=metabase lein run load-from-h2
   ```"
  (:require [clojure.java.jdbc :as jdbc]
            [metabase
             [models :refer [Session Setting]]
             [util :as u]]
            [metabase.cmd.dump-and-load-common :as common]
            [metabase.db
             [connection :as mdb.conn]
             [env :as mdb.env]
             [migrations :refer [DataMigrations]]
             [setup :as mdb.setup]]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db]))

(defn- load-data! [source-jdbc-spec target-db-type target-db-conn]
  (jdbc/with-db-connection [source-conn source-jdbc-spec]
    (doseq [{table-name :table, :as e} common/entities
            :let                       [rows (jdbc/query source-conn [(str "SELECT * FROM " (name table-name))])]
            :when                      (seq rows)]
      (common/insert-entity! target-db-type target-db-conn e rows))))


;;; ---------------------------------------- Enabling / Disabling Constraints ----------------------------------------

(defmulti ^:private disable-db-constraints!
  {:arglists '([target-db-type dest-db-connection])}
  (fn [db-type _]
    db-type))

(defmulti ^:private reenable-db-constraints!
  {:arglists '([target-db-type dest-db-connection])}
  (fn [db-type _]
    db-type))

(defmethod disable-db-constraints! :postgres
  [_ target-db-conn]
  ;; make all of our FK constraints deferrable. This only works on Postgres 9.4+ (December 2014)! (There's no pressing
  ;; reason to turn these back on at the conclusion of this script. It makes things more complicated since it doesn't
  ;; work if done inside the same transaction.)
  (doseq [{constraint :constraint_name, table :table_name} (jdbc/query
                                                            target-db-conn
                                                            [(str "SELECT * "
                                                                  "FROM information_schema.table_constraints "
                                                                  "WHERE constraint_type = 'FOREIGN KEY'")])]
    (jdbc/execute! target-db-conn [(format "ALTER TABLE \"%s\" ALTER CONSTRAINT \"%s\" DEFERRABLE" table constraint)]))
  ;; now enable constraint deferring for the duration of the transaction
  (jdbc/execute! target-db-conn ["SET CONSTRAINTS ALL DEFERRED"]))


(defmethod reenable-db-constraints! :postgres [_ _]) ; no-op

(defmethod disable-db-constraints! :mysql
  [_ target-db-conn]
  (jdbc/execute! target-db-conn ["SET FOREIGN_KEY_CHECKS=0"]))

;; For MySQL we need to re-enable FK checks when we're done
(defmethod reenable-db-constraints! :mysql
  [_ target-db-conn]
  (jdbc/execute! target-db-conn ["SET FOREIGN_KEY_CHECKS=1"]))


;;; --------------------------------------------- Fixing Sequence Values ---------------------------------------------

(def ^:private entities-without-autoinc-ids
  "Entities that do NOT use an auto incrementing ID column."
  #{Setting Session DataMigrations})

(defmulti ^:private update-sequence-values!
  {:arglists '([target-db-type target-jdbc-spec])}
  (fn [target-db-type _]
    target-db-type))

(defmethod update-sequence-values! :mysql [_ _]) ; no-op

;; Update the sequence nextvals.
(defmethod update-sequence-values! :postgres
  [_ target-jdbc-spec]
  (jdbc/with-db-transaction [target-db-conn target-jdbc-spec]
    (println (u/format-color 'blue "Setting postgres sequence ids to proper values..."))
    (doseq [e     common/entities
            :when (not (contains? entities-without-autoinc-ids e))
            :let  [table-name (name (:table e))
                   seq-name   (str table-name "_id_seq")
                   sql        (format "SELECT setval('%s', COALESCE((SELECT MAX(id) FROM %s), 1), true) as val"
                                      seq-name (name table-name))]]
      (jdbc/db-query-with-resultset target-db-conn [sql] :val))
    (common/println-ok)))

(defn- mb-db-populated? [db-type conn]
  (binding [db/*db-connection* conn
            db/*quoting-style* (mdb.conn/quoting-style db-type)]
    (pos? (db/count Setting))))

(defn load!
  "Load data from a source (presumably H2) database with `source-jdbc-spec` into an empty target database with
  `target-jdbc-spec`."
  [source-jdbc-spec target-db-type target-jdbc-spec]
  (assert (#{:postgres :mysql} target-db-type)
          (trs "Metabase can only transfer data from H2 to Postgres or MySQL/MariaDB."))
  (mdb.setup/setup-db! target-db-type target-jdbc-spec true)
  (jdbc/with-db-transaction [target-db-transaction-conn target-jdbc-spec]
    (jdbc/db-set-rollback-only! target-db-transaction-conn)
    (println (u/format-color 'blue "Testing if target DB is already populated..."))
    (assert (not (mb-db-populated? target-db-type target-db-transaction-conn))
            (trs "Target DB is already populated!"))
    (common/println-ok)
    (println (u/format-color 'blue "Temporarily disabling DB constraints..."))
    (disable-db-constraints! target-db-type target-db-transaction-conn)
    (common/println-ok)
    (load-data! source-jdbc-spec target-db-type target-db-transaction-conn)
    (println (u/format-color 'blue "Re-enabling DB constraints..."))
    (reenable-db-constraints! target-db-type target-db-transaction-conn)
    (common/println-ok)
    (jdbc/db-unset-rollback-only! target-db-transaction-conn))
  (update-sequence-values! target-db-type target-jdbc-spec))

(defn load-from-h2!
  "Transfer data from existing H2 database to a newly created (presumably MySQL or Postgres) DB. Intended as a tool for
  upgrading from H2 to a 'real' database.

  Defaults to using `@metabase.db.env/db-file` as the source H2 database if `h2-filename` is `nil`."
  ([h2-filename]
   (let [h2-filename  (str (or h2-filename @mdb.env/db-file) ";IFEXISTS=TRUE")
         h2-jdbc-spec (common/h2-jdbc-spec h2-filename)]
     (load! h2-jdbc-spec @mdb.env/db-type @mdb.env/jdbc-spec))))
