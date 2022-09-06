(ns metabase.cmd.copy
  "Shared lower-level implementation of the `dump-to-h2` and `load-from-h2` commands. The `copy!` function implemented
  here supports loading data from an application database to any empty application database for all combinations of
  supported application database types."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [honeysql.format :as hformat]
            [metabase.db.connection :as mdb.connection]
            [metabase.db.data-migrations :refer [DataMigrations]]
            [metabase.db.setup :as mdb.setup]
            [metabase.models :refer [Activity
                                     App
                                     ApplicationPermissionsRevision
                                     BookmarkOrdering
                                     Card
                                     CardBookmark
                                     Collection
                                     CollectionBookmark
                                     CollectionPermissionGraphRevision
                                     Dashboard
                                     DashboardBookmark
                                     DashboardCard
                                     DashboardCardSeries
                                     Database
                                     Dimension
                                     Emitter
                                     Field
                                     FieldValues
                                     LoginHistory
                                     Metric
                                     MetricImportantField
                                     ModerationReview
                                     NativeQuerySnippet
                                     Permissions
                                     PermissionsGroup
                                     PermissionsGroupMembership
                                     PermissionsRevision
                                     PersistedInfo
                                     Pulse
                                     PulseCard
                                     PulseChannel
                                     PulseChannelRecipient
                                     Revision
                                     Secret
                                     Segment
                                     Session
                                     Setting
                                     Table
                                     Timeline
                                     TimelineEvent
                                     User
                                     ViewLog]]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
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
      (throw (ex-info (trs "ERROR {0}: {1}" msg (ex-message e))
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
   CardBookmark
   DashboardBookmark
   Emitter
   CollectionBookmark
   BookmarkOrdering
   DashboardCard
   DashboardCardSeries
   Activity
   App
   Pulse
   PulseCard
   PulseChannel
   PulseChannelRecipient
   PermissionsGroup
   PermissionsGroupMembership
   Permissions
   PermissionsRevision
   PersistedInfo
   ApplicationPermissionsRevision
   Dimension
   NativeQuerySnippet
   LoginHistory
   Timeline
   TimelineEvent
   Secret
   ;; migrate the list of finished DataMigrations as the very last thing (all models to copy over should be listed
   ;; above this line)
   DataMigrations])

(defn- objects->colums+values
  "Given a sequence of objects/rows fetched from the H2 DB, return a the `columns` that should be used in the `INSERT`
  statement, and a sequence of rows (as sequences)."
  [target-db-type objs]
  ;; Need to wrap the column names in quotes because Postgres automatically lowercases unquoted identifiers. (This
  ;; should be ok now that #16344 is resolved -- we might be able to remove this code entirely now. Quoting identifiers
  ;; is still a good idea tho.)
  (let [source-keys (keys (first objs))
        quote-style (mdb.connection/quoting-style target-db-type)
        quote-fn    (get @#'hformat/quote-fns quote-style)
        _           (assert (fn? quote-fn) (str "No function for quote style: " quote-style))
        dest-keys   (for [k source-keys]
                      (quote-fn (name k)))]
    {:cols dest-keys
     :vals (for [row objs]
             (map row source-keys))}))

(def ^:private chunk-size 100)

(defn- insert-chunk!
  "Insert of `chunkk` of rows into the target database table with `table-name`."
  [target-db-type target-db-conn-spec table-name chunkk]
  (log/debugf "Inserting chunk of %d rows" (count chunkk))
  (try
    (let [{:keys [cols vals]} (objects->colums+values target-db-type chunkk)]
      (jdbc/insert-multi! target-db-conn-spec table-name cols vals {:transaction? false}))
    (catch SQLException e
      (log/error (with-out-str (jdbc/print-sql-exception-chain e)))
      (throw e))))

(def ^:private table-select-fragments
  {;; ensure ID order to ensure that parent fields are inserted before children
   "metabase_field" "ORDER BY id ASC"})

(defn- copy-data! [^javax.sql.DataSource source-data-source target-db-type target-db-conn-spec]
  (with-open [source-conn (.getConnection source-data-source)]
    (doseq [{table-name :table, :as entity} entities
            :let                            [fragment (table-select-fragments (str/lower-case (name table-name)))
                                             sql      (str "SELECT * FROM "
                                                           (name table-name)
                                                           (when fragment (str " " fragment)))
                                             results (jdbc/reducible-query {:connection source-conn} sql)]]
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
              (insert-chunk! target-db-type target-db-conn-spec table-name chunkk)
              (catch Throwable e
                (throw (ex-info (trs "Error copying instances of {0}" (name entity))
                                {:entity (name entity)}
                                e)))))
          (+ cnt (count chunkk))))
       0
       results))))

(defn- assert-db-empty
  "Make sure [target] application DB is empty before we start copying data."
  [data-source]
  ;; check that there are no Users yet
  (let [[{:keys [cnt]}] (jdbc/query {:datasource data-source} "SELECT count(*) AS \"cnt\" FROM core_user;")]
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
  {:arglists '([db-type conn-spec])}
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
  {:arglists '([db-type conn-spec])}
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

(defn- clear-existing-rows!
  "Make sure the target database is empty -- rows created by migrations (such as the magic permissions groups and
  default perms entries) need to be deleted so we can copy everything over from the source DB without running into
  conflicts."
  [target-db-type ^javax.sql.DataSource target-data-source]
  (with-open [conn (.getConnection target-data-source)
              stmt (.createStatement conn)]
    (with-disabled-db-constraints target-db-type {:connection conn}
      (try
        (.setAutoCommit conn false)
        (let [save-point (.setSavepoint conn)]
          (try
            (letfn [(add-batch! [^String sql]
                      (log/debug (u/colorize :yellow sql))
                      (.addBatch stmt sql))]
              ;; do these in reverse order so child rows get deleted before parents
              (doseq [{table-name :table} (reverse entities)]
                (add-batch! (format (if (= target-db-type :postgres)
                                      "TRUNCATE TABLE %s CASCADE;"
                                      "TRUNCATE TABLE %s;")
                                    (name table-name)))))
            (.executeBatch stmt)
            (.commit conn)
            (catch Throwable e
              (try
                (.rollback conn save-point)
                (catch Throwable e2
                  (throw (Exception. (ex-message e2) e))))
              (throw e))))
        (finally
          (.setAutoCommit conn true))))))

(def ^:private entities-without-autoinc-ids
  "Entities that do NOT use an auto incrementing ID column."
  #{Setting Session DataMigrations})

(defmulti ^:private update-sequence-values!
  {:arglists '([db-type data-source])}
  (fn [db-type _]
    db-type))

(defmethod update-sequence-values! :default [_ _]) ; no-op

;; Update the sequence nextvals.
(defmethod update-sequence-values! :postgres
  [_ data-source]
  (jdbc/with-db-transaction [target-db-conn {:datasource data-source}]
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
  [source-db-type     :- (s/enum :h2 :postgres :mysql)
   source-data-source :- javax.sql.DataSource
   target-db-type     :- (s/enum :h2 :postgres :mysql)
   target-data-source :- javax.sql.DataSource]
  ;; make sure the source database is up-do-date
  (step (trs "Set up {0} source database and run migrations..." (name source-db-type))
    (mdb.setup/setup-db! source-db-type source-data-source true))
  ;; make sure the dest DB is up-to-date
  ;;
  ;; don't need or want to run data migrations in the target DB, since the data is already migrated appropriately
  (step (trs "Set up {0} target database and run migrations..." (name target-db-type))
    (binding [mdb.setup/*disable-data-migrations* true]
      (mdb.setup/setup-db! target-db-type target-data-source true)))
  ;; make sure target DB is empty
  (step (trs "Testing if target {0} database is already populated..." (name target-db-type))
    (assert-db-empty target-data-source))
  ;; clear any rows created by the Liquibase migrations.
  (step (trs "Clearing default entries created by Liquibase migrations...")
    (clear-existing-rows! target-db-type target-data-source))
  ;; create a transaction and load the data.
  (jdbc/with-db-transaction [target-conn-spec {:datasource target-data-source}]
    ;; transaction should be set as rollback-only until it completes. Only then should we disable rollback-only so the
    ;; transaction will commit (i.e., only commit if the whole thing succeeds)
    (with-connection-rollback-only target-conn-spec
      ;; disable FK constraints for the duration of loading data.
      (with-disabled-db-constraints target-db-type target-conn-spec
        (copy-data! source-data-source target-db-type target-conn-spec))))
  ;; finally, update sequence values (if needed)
  (update-sequence-values! target-db-type target-data-source))
