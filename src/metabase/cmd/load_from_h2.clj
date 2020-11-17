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
  (:require [clojure.java
             [io :as io]
             [jdbc :as jdbc]]
            [clojure.string :as str]
            [colorize.core :as color]
            [metabase
             [db :as mdb]
             [util :as u]]
            [metabase.db.migrations :refer [DataMigrations]]
            [metabase.models
             [activity :refer [Activity]]
             [card :refer [Card]]
             [card-favorite :refer [CardFavorite]]
             [collection :refer [Collection]]
             [collection-revision :refer [CollectionRevision]]
             [dashboard :refer [Dashboard]]
             [dashboard-card :refer [DashboardCard]]
             [dashboard-card-series :refer [DashboardCardSeries]]
             [dashboard-favorite :refer [DashboardFavorite]]
             [database :refer [Database]]
             [dependency :refer [Dependency]]
             [dimension :refer [Dimension]]
             [field :refer [Field]]
             [field-values :refer [FieldValues]]
             [metric :refer [Metric]]
             [metric-important-field :refer [MetricImportantField]]
             [native-query-snippet :refer [NativeQuerySnippet]]
             [permissions :refer [Permissions]]
             [permissions-group :refer [PermissionsGroup]]
             [permissions-group-membership :refer [PermissionsGroupMembership]]
             [permissions-revision :refer [PermissionsRevision]]
             [pulse :refer [Pulse]]
             [pulse-card :refer [PulseCard]]
             [pulse-channel :refer [PulseChannel]]
             [pulse-channel-recipient :refer [PulseChannelRecipient]]
             [revision :refer [Revision]]
             [segment :refer [Segment]]
             [session :refer [Session]]
             [setting :refer [Setting]]
             [table :refer [Table]]
             [user :refer [User]]
             [view-log :refer [ViewLog]]]
            [metabase.util.i18n :refer [trs]]
            [toucan.db :as db])
  (:import java.sql.SQLException))

(defn- println-ok [] (println (color/green "[OK]")))

(defn- dispatch-on-db-type [& _] (mdb/db-type))

;;; ------------------------------------------ Models to Migrate (in order) ------------------------------------------

(def entities
  "Entities in the order they should be serialized/deserialized. This is done so we make sure that we load load
  instances of entities before others that might depend on them, e.g. `Databases` before `Tables` before `Fields`."
  [Database
   User
   Setting
   Dependency
   Table
   Field
   FieldValues
   Segment
   Metric
   MetricImportantField
   Revision
   ViewLog
   Session
   Collection
   CollectionRevision
   Dashboard
   Card
   CardFavorite
   DashboardCard
   DashboardCardSeries
   Activity
   Pulse
   PulseCard
   PulseChannel
   PulseChannelRecipient
   PermissionsGroup
   PermissionsGroupMembership
   Permissions
   PermissionsRevision
   DashboardFavorite
   Dimension
   NativeQuerySnippet
   ;; migrate the list of finished DataMigrations as the very last thing (all models to copy over should be listed
   ;; above this line)
   DataMigrations])


;;; --------------------------------------------- H2 Connection Options ----------------------------------------------

(defn- add-file-prefix-if-needed [connection-string-or-filename]
  (if (str/starts-with? connection-string-or-filename "file:")
    connection-string-or-filename
    (str "file:" (.getAbsolutePath (io/file connection-string-or-filename)))))

(defn- h2-details [h2-connection-string-or-nil]
  (let [h2-filename (add-file-prefix-if-needed (or h2-connection-string-or-nil @metabase.db/db-file))]
    (mdb/jdbc-spec {:type :h2, :db (str h2-filename ";IFEXISTS=TRUE")})))


;;; ------------------------------------------- Fetching & Inserting Rows --------------------------------------------

(defn- objects->colums+values
  "Given a sequence of objects/rows fetched from the H2 DB, return a the `columns` that should be used in the `INSERT`
  statement, and a sequence of rows (as seqeunces)."
  [objs]
  ;; 1) `:sizeX` and `:sizeY` come out of H2 as `:sizex` and `:sizey` because of automatic lowercasing; fix the names
  ;;    of these before putting into the new DB
  ;;
  ;; 2) Need to wrap the column names in quotes because Postgres automatically lowercases unquoted identifiers
  (let [source-keys (keys (first objs))
        dest-keys   (for [k source-keys]
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
      (jdbc/insert-multi! target-db-conn table-name cols vals))
    (catch SQLException e
      (jdbc/print-sql-exception-chain e)
      (throw e))))

(defn- insert-entity! [target-db-conn {table-name :table, entity-name :name} objs]
  (print (u/format-color 'blue "Transfering %d instances of %s..." (count objs) entity-name))
  (flush)
  ;; The connection closes prematurely on occasion when we're inserting thousands of rows at once. Break into
  ;; smaller chunks so connection stays alive
  (doseq [chunk (partition-all chunk-size objs)]
    (insert-chunk! target-db-conn table-name chunk))
  (println-ok))

(defn- load-data! [target-db-conn h2-connection-string-or-nil]
  (jdbc/with-db-connection [h2-conn (h2-details h2-connection-string-or-nil)]
    (doseq [{table-name :table, :as e} entities
            :let                       [rows (jdbc/query h2-conn [(str "SELECT * FROM " (name table-name))])]
            :when                      (seq rows)]
      (insert-entity! target-db-conn e rows))))


;;; ---------------------------------------- Enabling / Disabling Constraints ----------------------------------------

(defmulti ^:private disable-db-constraints!
  {:arglists '([target-db-conn])}
  dispatch-on-db-type)

(defmulti ^:private reenable-db-constraints!
  {:arglists '([target-db-conn])}
  dispatch-on-db-type)


(defmethod disable-db-constraints! :postgres [target-db-conn]
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

(defmethod reenable-db-constraints! :postgres [_]) ; no-op


(defmethod disable-db-constraints! :mysql [target-db-conn]
  (jdbc/execute! target-db-conn ["SET FOREIGN_KEY_CHECKS=0"]))

;; For MySQL we need to re-enable FK checks when we're done
(defmethod reenable-db-constraints! :mysql [target-db-conn]
  (jdbc/execute! target-db-conn ["SET FOREIGN_KEY_CHECKS=1"]))


;;; --------------------------------------------- Fixing Sequence Values ---------------------------------------------

(def ^:private entities-without-autoinc-ids
  "Entities that do NOT use an auto incrementing ID column."
  #{Setting Session DataMigrations})

(defmulti ^:private update-sequence-values!
  {:arglists '([])}
  dispatch-on-db-type)

(defmethod update-sequence-values! :mysql []) ; no-op

;; Update the sequence nextvals.
(defmethod update-sequence-values! :postgres []
  (jdbc/with-db-transaction [target-db-conn (mdb/jdbc-spec)]
    (println (u/format-color 'blue "Setting postgres sequence ids to proper values..."))
    (doseq [e     entities
            :when (not (contains? entities-without-autoinc-ids e))
            :let  [table-name (name (:table e))
                   seq-name   (str table-name "_id_seq")
                   sql        (format "SELECT setval('%s', COALESCE((SELECT MAX(id) FROM %s), 1), true) as val"
                                      seq-name (name table-name))]]
      (jdbc/db-query-with-resultset target-db-conn [sql] :val))
    (println-ok)))

(defn- mb-db-populated? [conn]
  (binding [db/*db-connection* conn]
    (pos? (db/count Setting))))

;;; --------------------------------------------------- Public Fns ---------------------------------------------------

(defn load-from-h2!
  "Transfer data from existing H2 database to the newly created (presumably MySQL or Postgres) DB specified by env
  vars. Intended as a tool for upgrading from H2 to a 'real' Database.

  Defaults to using `@metabase.db/db-file` as the connection string."
  [h2-connection-string-or-nil]
  (mdb/setup-db!)

  (assert (#{:postgres :mysql} (mdb/db-type))
    (trs "Metabase can only transfer data from H2 to Postgres or MySQL/MariaDB."))

  (jdbc/with-db-transaction [target-db-conn (mdb/jdbc-spec)]
    (jdbc/db-set-rollback-only! target-db-conn)

    (println (u/format-color 'blue "Testing if target DB is already populated..."))
    (assert (not (mb-db-populated? target-db-conn))
      (trs "Target DB is already populated!"))
    (println-ok)

    (println (u/format-color 'blue "Temporarily disabling DB constraints..."))
    (disable-db-constraints! target-db-conn)
    (println-ok)

    (load-data! target-db-conn h2-connection-string-or-nil)

    (println (u/format-color 'blue "Re-enabling DB constraints..."))
    (reenable-db-constraints! target-db-conn)
    (println-ok)

    (jdbc/db-unset-rollback-only! target-db-conn))

  (update-sequence-values!))
