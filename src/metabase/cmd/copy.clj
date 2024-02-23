(ns metabase.cmd.copy
  "Shared lower-level implementation of the [[metabase.cmd.dump-to-h2/dump-to-h2!]]
  and [[metabase.cmd.load-from-h2/load-from-h2!]] commands. The [[copy!]] function implemented here supports loading
  data from an application database to any empty application database for all combinations of supported application
  database types."
  (:require
   [clojure.java.jdbc :as jdbc]
   [honey.sql :as sql]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   #_{:clj-kondo/ignore [:deprecated-namespace]}
   [metabase.db.setup :as mdb.setup]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [schema.core :as s]
   [toucan2.core :as t2])
  (:import
   (java.sql SQLException)))

(set! *warn-on-reflection* true)

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
  "Entities in the order they should be serialized/deserialized. This is done so we make sure that we load
  instances of entities before others that might depend on them, e.g. `Databases` before `Tables` before `Fields`."
  (concat
   [:model/Database
    :model/User
    :model/Setting
    :model/Table
    :model/Field
    :model/FieldValues
    :model/Segment
    :model/LegacyMetric
    :model/LegacyMetricImportantField
    :model/ModerationReview
    :model/Revision
    :model/ViewLog
    :model/Session
    :model/Collection
    :model/CollectionPermissionGraphRevision
    :model/Dashboard
    :model/Card
    :model/CardBookmark
    :model/DashboardBookmark
    :model/CollectionBookmark
    :model/BookmarkOrdering
    :model/DashboardCard
    :model/DashboardCardSeries
    :model/Activity
    :model/Pulse
    :model/PulseCard
    :model/PulseChannel
    :model/PulseChannelRecipient
    :model/PermissionsGroup
    :model/PermissionsGroupMembership
    :model/Permissions
    :model/PermissionsRevision
    :model/PersistedInfo
    :model/ApplicationPermissionsRevision
    :model/Dimension
    :model/NativeQuerySnippet
    :model/LoginHistory
    :model/Timeline
    :model/TimelineEvent
    :model/Secret
    :model/ParameterCard
    :model/Action
    :model/ImplicitAction
    :model/HTTPAction
    :model/QueryAction
    :model/DashboardTab
    :model/ModelIndex
    :model/ModelIndexValue
    ;; 48+
    :model/TablePrivileges
    :model/AuditLog
    :model/RecentViews]
   (when config/ee-available?
     [:model/GroupTableAccessPolicy
      :model/ConnectionImpersonation])))

(defn- objects->colums+values
  "Given a sequence of objects/rows fetched from the H2 DB, return a the `columns` that should be used in the `INSERT`
  statement, and a sequence of rows (as sequences)."
  [target-db-type objs]
  ;; Need to wrap the column names in quotes because Postgres automatically lowercases unquoted identifiers. (This
  ;; should be ok now that #16344 is resolved -- we might be able to remove this code entirely now. Quoting identifiers
  ;; is still a good idea tho.)
  (let [source-keys (keys (first objs))
        quote-fn    (partial mdb.setup/quote-for-application-db (mdb.connection/quoting-style target-db-type))
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

(def ^:dynamic *copy-h2-database-details*
  "Whether [[copy-data!]] (and thus [[metabase.cmd.load-from-h2/load-from-h2!]]) should copy connection details for H2
  Databases from the source application database. Normally disabled for security reasons. This is only here so we can
  disable this check for tests."
  false)

(defn- model-select-fragment
  [model]
  (case model
    :model/Field {:order-by [[:id :asc]]}
    nil))

(defn- sql-for-selecting-instances-from-source-db [model]
  (first
   (sql/format
    (merge {:select [[:*]]
            :from   [[(t2/table-name model)]]}
           (model-select-fragment model))
    {:quoted false})))

(defn- model-results-xform [model]
  (case model
    :model/Database
    ;; For security purposes, do NOT copy connection details for H2 Databases by default; replace them with an empty map.
    ;; Why? Because this is a potential pathway to injecting sneaky H2 connection parameters that cause RCEs. For the
    ;; Sample Database, the correct details are reset automatically on every
    ;; launch (see [[metabase.sample-data/update-sample-database-if-needed!]]), and we don't support connecting other H2
    ;; Databases in prod anyway, so this ultimately shouldn't cause anyone any problems.
    (if *copy-h2-database-details*
      identity
      (map (fn [database]
             (cond-> database
               (= (:engine database) "h2") (assoc :details "{}")))))
    ;; else
    identity))

(defn- copy-data! [^javax.sql.DataSource source-data-source target-db-type target-db-conn-spec]
  (with-open [source-conn (.getConnection source-data-source)]
    (doseq [model entities
            :let  [table-name (t2/table-name model)
                   sql        (sql-for-selecting-instances-from-source-db model)
                   results    (jdbc/reducible-query {:connection source-conn} sql)]]
      (transduce
       (comp (model-results-xform model)
             (partition-all chunk-size))
       ;; cnt    = the total number we've inserted so far
       ;; chunkk = current chunk to insert
       (fn
         ([cnt]
          (when (pos? cnt)
            (log/info (str " " (u/colorize 'green (trs "copied {0} instances." cnt))))))
         ([cnt chunkk]
          (when (seq chunkk)
            (when (zero? cnt)
              (log/info (u/colorize 'blue (trs "Copying instances of {0}..." (name model)))))
            (try
              (insert-chunk! target-db-type target-db-conn-spec table-name chunkk)
              (catch Throwable e
                (throw (ex-info (trs "Error copying instances of {0}" (name model))
                                {:model (name model)}
                                e)))))
          (+ cnt (count chunkk))))
       0
       results))))

(defn- assert-db-empty
  "Make sure [target] application DB is empty before we start copying data."
  [data-source]
  ;; check that there are no Users yet
  (let [[{:keys [cnt]}] (jdbc/query {:datasource data-source} "SELECT count(*) AS cnt FROM core_user;")]
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
              (doseq [table-name (map t2/table-name (reverse entities))]
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
  #{:model/Setting
    :model/Session
    :model/ImplicitAction
    :model/HTTPAction
    :model/QueryAction
    :model/ModelIndexValue
    :model/TablePrivileges})

(defmulti ^:private postgres-id-sequence-name
  {:arglists '([model])}
  keyword)

(defmethod postgres-id-sequence-name :default
  [model]
  (str (name (t2/table-name model)) "_id_seq"))

;;; we changed the table name to `sandboxes` but never updated the underlying ID sequences or constraint names.
(defmethod postgres-id-sequence-name :model/GroupTableAccessPolicy
  [_model]
  "group_table_access_policy_id_seq")

(defmulti ^:private update-sequence-values!
  {:arglists '([db-type data-source])}
  (fn [db-type _]
    db-type))

(defmethod update-sequence-values! :default [_ _]) ; no-op

;; Update the sequence nextvals.
(defmethod update-sequence-values! :postgres
  [_db-type data-source]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (jdbc/with-db-transaction [target-db-conn {:datasource data-source}]
    (step (trs "Setting Postgres sequence ids to proper values...")
      (doseq [model entities
              :when (not (contains? entities-without-autoinc-ids model))
              :let  [table-name (name (t2/table-name model))
                     seq-name   (postgres-id-sequence-name model)
                     sql        (format "SELECT setval('%s', COALESCE((SELECT MAX(id) FROM %s), 1), true) as val"
                                        seq-name (name table-name))]]
        (try
          (jdbc/db-query-with-resultset target-db-conn [sql] :val)
          (catch Throwable e
            (throw (ex-info (format "Error updating sequence values for %s: %s" model (ex-message e))
                            {:model model}
                            e))))))))


(defmethod update-sequence-values! :h2
  [_db-type data-source]
  #_{:clj-kondo/ignore [:discouraged-var]}
  (jdbc/with-db-transaction [target-db-conn {:datasource data-source}]
    (step (trs "Setting H2 sequence ids to proper values...")
      (doseq [e     entities
              :when (not (contains? entities-without-autoinc-ids e))
              :let  [table-name (name (t2/table-name e))
                     sql        (format "ALTER TABLE %s ALTER COLUMN ID RESTART WITH COALESCE((SELECT MAX(ID) + 1 FROM %s), 1)"
                                        table-name table-name)]]
        (jdbc/execute! target-db-conn sql)))))

(s/defn copy!
  "Copy data from a source application database into an empty destination application database."
  [source-db-type     :- (s/enum :h2 :postgres :mysql)
   source-data-source :- javax.sql.DataSource
   target-db-type     :- (s/enum :h2 :postgres :mysql)
   target-data-source :- javax.sql.DataSource]
  ;; make sure the entire system is loaded before running this test, to make sure we account for all the models.
  (doseq [ns-symb u/metabase-namespace-symbols]
    (classloader/require ns-symb))
  ;; make sure the source database is up-do-date
  (step (trs "Set up {0} source database and run migrations..." (name source-db-type))
    (mdb.setup/setup-db! source-db-type source-data-source true))
  ;; make sure the dest DB is up-to-date
  ;;
  ;; don't need or want to run data migrations in the target DB, since the data is already migrated appropriately
  (step (trs "Set up {0} target database and run migrations..." (name target-db-type))
    (mdb.setup/setup-db! target-db-type target-data-source true))
  ;; make sure target DB is empty
  (step (trs "Testing if target {0} database is already populated..." (name target-db-type))
    (assert-db-empty target-data-source))
  ;; clear any rows created by the Liquibase migrations.
  (step (trs "Clearing default entries created by Liquibase migrations...")
    (clear-existing-rows! target-db-type target-data-source))
  ;; create a transaction and load the data.
  #_{:clj-kondo/ignore [:discouraged-var]}
  (jdbc/with-db-transaction [target-conn-spec {:datasource target-data-source}]
    ;; transaction should be set as rollback-only until it completes. Only then should we disable rollback-only so the
    ;; transaction will commit (i.e., only commit if the whole thing succeeds)
    (with-connection-rollback-only target-conn-spec
      ;; disable FK constraints for the duration of loading data.
      (with-disabled-db-constraints target-db-type target-conn-spec
        (copy-data! source-data-source target-db-type target-conn-spec))))
  ;; finally, update sequence values (if needed)
  (update-sequence-values! target-db-type target-data-source))
