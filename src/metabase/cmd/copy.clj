(ns metabase.cmd.copy
  "Shared lower-level implementation of the `dump-to-h2` and `load-from-h2` commands. The `copy!` function implemented
  here supports loading data from an application database to any empty application database for all combinations of
  supported application database types."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.format :as hformat]
            [metabase.db.connection :as mdb.conn]
            [metabase.db.data-migrations :refer [DataMigrations]]
            [metabase.db.setup :as mdb.setup]
            [metabase.models :refer [Activity Card CardFavorite Collection CollectionPermissionGraphRevision Dashboard
                                     DashboardCard DashboardCardSeries DashboardFavorite Database Dependency Dimension Field
                                     FieldValues LoginHistory Metric MetricImportantField ModerationReview NativeQuerySnippet
                                     Permissions PermissionsGroup PermissionsGroupMembership PermissionsRevision Pulse PulseCard
                                     PulseChannel PulseChannelRecipient Revision Segment Session Setting Table User
                                     ViewLog]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [metabase.util.schema :as su]
            [schema.core :as s])
  (:import java.sql.SQLException))

(defn- log-ok []
  (log/info (u/colorize 'green "[OK]")))

(defn- do-step [msg f]
  (log/info (str (u/colorize 'blue msg) " "))
  (try
    (f)
    (catch Throwable e
      (log/error (u/colorize 'red "[FAIL]\n"))
      (throw (ex-info (trs "ERROR {0}" msg)
                      {}
                      e))))
  (log-ok))

(defmacro ^:private step
  "Convenience for executing `body` with some extra logging."
  {:style/indent 1}
  [msg & body]
  `(do-step ~msg (fn [] ~@body)))

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
   ModerationReview
   Revision
   ViewLog
   Session
   Collection
   CollectionPermissionGraphRevision
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
   LoginHistory
   ;; migrate the list of finished DataMigrations as the very last thing (all models to copy over should be listed
   ;; above this line)
   DataMigrations])

(defn- objects->colums+values
  "Given a sequence of objects/rows fetched from the H2 DB, return a the `columns` that should be used in the `INSERT`
  statement, and a sequence of rows (as sequences)."
  [target-db-type objs]
  ;; 1) `:sizeX` and `:sizeY` come out of H2 as `:sizex` and `:sizey` because of automatic lowercasing; fix the names
  ;;    of these before putting into the new DB
  ;;
  ;; 2) Need to wrap the column names in quotes because Postgres automatically lowercases unquoted identifiers
  (let [source-keys (keys (first objs))
        quote-style (mdb.conn/quoting-style target-db-type)
        quote-fn    (get @#'hformat/quote-fns quote-style)
        _           (assert (fn? quote-fn) (str "No function for quote style: " quote-style))
        dest-keys   (for [k source-keys]
                      (quote-fn (name (case k
                                        :sizex :sizeX
                                        :sizey :sizeY
                                        k))))]
    {:cols dest-keys
     :vals (for [row objs]
             (map row source-keys))}))

(def ^:private chunk-size 100)

(defn- insert-chunk!
  "Insert of `chunkk` of rows into the target database table with `table-name`."
  [target-db-type target-db-conn table-name chunkk]
  (log/debugf "Inserting chunk of %d rows" (count chunkk))
  (try
    (let [{:keys [cols vals]} (objects->colums+values target-db-type chunkk)]
      (jdbc/insert-multi! target-db-conn table-name cols vals {:transaction? false}))
    (catch SQLException e
      (log/error (with-out-str (jdbc/print-sql-exception-chain e)))
      (throw e))))

(def ^:private table-select-fragments
  {"metabase_field" "ORDER BY id ASC"}) ; ensure ID order to ensure that parent fields are inserted before children

(defn- copy-data! [source-jdbc-spec target-db-type target-db-conn]
  (jdbc/with-db-connection [source-conn source-jdbc-spec]
    (doseq [{table-name :table, :as entity} entities
            :let                            [fragment (table-select-fragments (str/lower-case (name table-name)))
                                             sql      (str "SELECT * FROM "
                                                           (name table-name)
                                                           (when fragment (str " " fragment)))
                                             results (jdbc/reducible-query source-conn sql)]]
      (transduce
       (partition-all chunk-size)
       ;; cnt    = the total number we've inserted so far
       ;; chunkk = current chunk to insert
       (fn
         ([cnt]
          (when (pos? cnt)
            (log/info (str " " (u/colorize 'green (trs "copied {0} instances." cnt))))))
         ([cnt chunkk]
          (when (seq chunkk)
            (when (zero? cnt)
              (log/info (u/colorize 'blue (trs "Copying instances of {0}..." (name entity)))))
            (try
              (insert-chunk! target-db-type target-db-conn table-name chunkk)
              (catch Throwable e
                (throw (ex-info (trs "Error copying instances of {0}" (name entity))
                                {:entity (name entity)}
                                e)))))
          (+ cnt (count chunkk))))
       0
       results))))

(defn- assert-db-empty
  "Make sure [target] application DB is empty before we start copying data."
  [jdbc-spec]
  ;; check that there are no permissions groups yet -- the default ones normally get created during data migrations
  (let [[{:keys [cnt]}] (jdbc/query jdbc-spec "SELECT count(*) AS \"cnt\" FROM permissions_group;")]
    (assert (integer? cnt))
    (when (pos? cnt)
      (throw (ex-info (trs "Target DB is already populated!")
                      {})))))

(defn- do-with-connection-rollback-only [conn f]
  (jdbc/db-set-rollback-only! conn)
  (f)
  (jdbc/db-unset-rollback-only! conn))

(defmacro ^:private with-connection-rollback-only
  "Make database transaction connection `conn` rollback-only until `body` completes successfully; then and only then
  disable rollback-only. This basically makes the load data operation an all-or-nothing affair (if it fails at some
  point, the whole transaction will rollback)."
  {:style/indent 1}
  [conn & body]
  `(do-with-connection-rollback-only ~conn (fn [] ~@body)))

(defmulti ^:private disable-db-constraints!
  {:arglists '([db-type conn])}
  (fn [db-type _]
    db-type))

(defmethod disable-db-constraints! :postgres
  [_ conn]
  ;; make all of our FK constraints deferrable. This only works on Postgres 9.4+ (December 2014)! (There's no pressing
  ;; reason to turn these back on at the conclusion of this script. It makes things more complicated since it doesn't
  ;; work if done inside the same transaction.)
  (doseq [{constraint :constraint_name, table :table_name} (jdbc/query
                                                            conn
                                                            [(str "SELECT * "
                                                                  "FROM information_schema.table_constraints "
                                                                  "WHERE constraint_type = 'FOREIGN KEY'")])]
    (jdbc/execute! conn [(format "ALTER TABLE \"%s\" ALTER CONSTRAINT \"%s\" DEFERRABLE" table constraint)]))
  ;; now enable constraint deferring for the duration of the transaction
  (jdbc/execute! conn ["SET CONSTRAINTS ALL DEFERRED"]))

(defmethod disable-db-constraints! :mysql
  [_ conn]
  (jdbc/execute! conn ["SET FOREIGN_KEY_CHECKS=0"]))

(defmethod disable-db-constraints! :h2
  [_ conn]
  (jdbc/execute! conn "SET REFERENTIAL_INTEGRITY FALSE"))

(defmulti ^:private reenable-db-constraints!
  {:arglists '([db-type conn])}
  (fn [db-type _]
    db-type))

(defmethod reenable-db-constraints! :default [_ _]) ; no-op

;; For MySQL we need to re-enable FK checks when we're done
(defmethod reenable-db-constraints! :mysql
  [_ conn]
  (jdbc/execute! conn ["SET FOREIGN_KEY_CHECKS=1"]))

(defmethod reenable-db-constraints! :h2
  [_ conn]
  (jdbc/execute! conn "SET REFERENTIAL_INTEGRITY TRUE"))

(defn- do-with-disabled-db-constraints [db-type conn f]
  (step (trs "Temporarily disabling DB constraints...")
    (disable-db-constraints! db-type conn))
  (try
    (f)
    (finally
      (step (trs "Re-enabling DB constraints...")
        (reenable-db-constraints! db-type conn)))))

(defmacro ^:private with-disabled-db-constraints
  "Disable foreign key constraints for the duration of `body`."
  {:style/indent 2}
  [db-type conn & body]
  `(do-with-disabled-db-constraints ~db-type ~conn (fn [] ~@body)))

(def ^:private entities-without-autoinc-ids
  "Entities that do NOT use an auto incrementing ID column."
  #{Setting Session DataMigrations})

(defmulti ^:private update-sequence-values!
  {:arglists '([db-type jdbc-spec])}
  (fn [db-type _]
    db-type))

(defmethod update-sequence-values! :default [_ _]) ; no-op

;; Update the sequence nextvals.
(defmethod update-sequence-values! :postgres
  [_ jdbc-spec]
  (jdbc/with-db-transaction [target-db-conn jdbc-spec]
    (step (trs "Setting Postgres sequence ids to proper values...")
      (doseq [e     entities
              :when (not (contains? entities-without-autoinc-ids e))
              :let  [table-name (name (:table e))
                     seq-name   (str table-name "_id_seq")
                     sql        (format "SELECT setval('%s', COALESCE((SELECT MAX(id) FROM %s), 1), true) as val"
                                        seq-name (name table-name))]]
        (jdbc/db-query-with-resultset target-db-conn [sql] :val)))))

(s/defn copy!
  "Copy data from a source application database into an empty destination application database."
  [source-db-type   :- (s/enum :h2 :postgres :mysql)
   source-jdbc-spec :- (s/cond-pre #"^jdbc:" su/Map)
   target-db-type   :- (s/enum :h2 :postgres :mysql)
   target-jdbc-spec :- (s/cond-pre #"^jdbc:" su/Map)]
  ;; make sure the source database is up-do-date
  (step (trs "Set up {0} source database and run migrations..." (name source-db-type))
    (mdb.setup/setup-db! source-db-type source-jdbc-spec true))
  ;; make sure the dest DB is up-to-date
  ;;
  ;; don't need or want to run data migrations in the target DB, since the data is already migrated appropriately
  (step (trs "Set up {0} target database and run migrations..." (name target-db-type))
    (binding [mdb.setup/*disable-data-migrations* true]
      (mdb.setup/setup-db! target-db-type target-jdbc-spec true)))
  ;; make sure target DB is empty
  (step (trs "Testing if target {0} database is already populated..." (name target-db-type))
    (assert-db-empty target-jdbc-spec))
  ;; create a transaction and load the data.
  (jdbc/with-db-transaction [target-conn target-jdbc-spec]
    ;; transaction should be set as rollback-only until it completes. Only then should we disable rollback-only so the
    ;; transaction will commit (i.e., only commit if the whole thing succeeds)
    (with-connection-rollback-only target-conn
      ;; disable FK constraints for the duration of loading data.
      (with-disabled-db-constraints target-db-type target-conn
        (copy-data! source-jdbc-spec target-db-type target-conn))))
  ;; finally, update sequence values (if needed)
  (update-sequence-values! target-db-type target-jdbc-spec))
