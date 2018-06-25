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
            [colorize.core :as color]
            [medley.core :as m]
            [metabase
             [config :as config]
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
             [view-log :refer [ViewLog]]]))

(defn- println-ok [] (println (color/green "[OK]")))

;;; -------------------------------------------------- Loading Data --------------------------------------------------

(def ^:private entities
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
   Collection
   CollectionRevision
   DashboardFavorite
   Dimension
   ;; migrate the list of finished DataMigrations as the very last thing (all models to copy over should be listed
   ;; above this line)
   DataMigrations])


(defn- h2-details [h2-connection-string-or-nil]
  (let [h2-filename (or h2-connection-string-or-nil @metabase.db/db-file)]
    (mdb/jdbc-details {:type :h2, :db (str h2-filename ";IFEXISTS=TRUE")})))


(defn- insert-entity! [target-db-conn entity objs]
  (print (u/format-color 'blue "Transfering %d instances of %s..." (count objs) (:name entity))) ; TODO - I don't think the print+flush is working as intended :/
  (flush)
  (let [ks         (keys (first objs))
        ;; 1) `:sizeX` and `:sizeY` come out of H2 as `:sizex` and `:sizey` because of automatic lowercasing; fix the
        ;;    names of these before putting into the new DB
        ;; 2) Need to wrap the column names in quotes because Postgres automatically lowercases unquoted identifiers
        quote-char (case (config/config-kw :mb-db-type)
                     :postgres \"
                     :mysql    \`)
        cols       (for [k ks]
                     (str quote-char (name (case k
                                             :sizex :sizeX
                                             :sizey :sizeY
                                             k)) quote-char))]
    ;; The connection closes prematurely on occasion when we're inserting thousands of rows at once. Break into
    ;; smaller chunks so connection stays alive
    (doseq [chunk (partition-all 300 objs)]
      (print (color/blue \.))
      (flush)
      (try
        (jdbc/insert-multi! target-db-conn (:table entity) cols (for [row chunk]
                                                                  (map row ks)))

        (catch java.sql.SQLException e
          (jdbc/print-sql-exception-chain e)
          (throw e)))))
  (println-ok))


(defn- load-data! [target-db-conn h2-connection-string-or-nil]
  (jdbc/with-db-connection [h2-conn (h2-details h2-connection-string-or-nil)]
    (doseq [e     entities
            :let  [rows (for [row (jdbc/query h2-conn [(str "SELECT * FROM " (name (:table e)))])]
                          (m/map-vals u/jdbc-clob->str row))]
            :when (seq rows)]
      (insert-entity! target-db-conn e rows))))


;;; ---------------------------------------- Enabling / Disabling Constraints ----------------------------------------

(defn- disable-db-constraints:postgres! [target-db-conn]
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


(defn- disable-db-constraints:mysql! [target-db-conn]
  (jdbc/execute! target-db-conn ["SET FOREIGN_KEY_CHECKS=0"]))

;; For MySQL we need to reënable FK checks when we're done
(defn- reënable-db-constraints:mysql! [target-db-conn]
  (jdbc/execute! target-db-conn ["SET FOREIGN_KEY_CHECKS=1"]))


(defn- disable-db-constraints! [target-db-conn]
  (println (u/format-color 'blue "Temporarily disabling DB constraints..."))
  ((case (mdb/db-type)
      :postgres disable-db-constraints:postgres!
      :mysql    disable-db-constraints:mysql!) target-db-conn)
  (println-ok))

(defn- reënable-db-constraints-if-needed! [target-db-conn]
  (when (= (mdb/db-type) :mysql)
    (println (u/format-color 'blue "Reënabling DB constraints..."))
    (reënable-db-constraints:mysql! target-db-conn)
    (println-ok)))


;;; ---------------------------------------- Fixing Postgres Sequence Values -----------------------------------------

(def ^:private entities-without-autoinc-ids
  "Entities that do NOT use an auto incrementing ID column."
  #{Setting Session DataMigrations})

(defn- set-postgres-sequence-values-if-needed!
  "When loading data into a Postgres DB, update the sequence nextvals."
  []
  (when (= (mdb/db-type) :postgres)
    (jdbc/with-db-transaction [target-db-conn (mdb/jdbc-details)]
      (println (u/format-color 'blue "Setting postgres sequence ids to proper values..."))
      (doseq [e     entities
              :when (not (contains? entities-without-autoinc-ids e))
              :let  [table-name (name (:table e))
                     seq-name   (str table-name "_id_seq")
                     sql        (format "SELECT setval('%s', COALESCE((SELECT MAX(id) FROM %s), 1), true) as val"
                                        seq-name (name table-name))]]
        (jdbc/db-query-with-resultset target-db-conn [sql] :val))
      (println-ok))))


;;; --------------------------------------------------- Public Fns ---------------------------------------------------

(defn load-from-h2!
  "Transfer data from existing H2 database to the newly created (presumably MySQL or Postgres) DB specified by env
  vars. Intended as a tool for upgrading from H2 to a 'real' Database.

  Defaults to using `@metabase.db/db-file` as the connection string."
  [h2-connection-string-or-nil]
  (mdb/setup-db!)
  (jdbc/with-db-transaction [target-db-conn (mdb/jdbc-details)]
    (jdbc/db-set-rollback-only! target-db-conn)
    (disable-db-constraints! target-db-conn)
    (load-data! target-db-conn h2-connection-string-or-nil)
    (reënable-db-constraints-if-needed! (mdb/jdbc-details))
    (jdbc/db-unset-rollback-only! target-db-conn))
  (set-postgres-sequence-values-if-needed!))
