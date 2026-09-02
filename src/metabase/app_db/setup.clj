(ns metabase.app-db.setup
  "Code for setting up the application DB -- verifying that we can connect and for running migrations. Unlike code in
  `metabase.app-db., code here takes a `clojure.java.jdbc` spec as a parameter; the higher-level code in `metabase.app-db.
  presents a similar set of functions but passes in the default (i.e., env var) application DB connection details
  automatically.

  Because functions here don't know where the JDBC spec came from, you can use them to perform the usual application
  DB setup steps on arbitrary databases -- useful for functionality like the `load-from-h2` or `dump-to-h2` commands."
  (:require
   [clojure.edn :as edn]
   [clojure.java.io :as io]
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.app-db.connection :as mdb.connection]
   [metabase.app-db.custom-migrations :as custom-migrations]
   [metabase.app-db.encryption :as mdb.encryption]
   [metabase.app-db.jdbc-protocols :as mdb.jdbc-protocols]
   [metabase.app-db.liquibase :as liquibase]
   [metabase.config.core :as config]
   [metabase.util :as u]
   [metabase.util.honey-sql-2]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]
   [metabase.util.malli.schema :as ms]
   [methodical.core :as methodical]
   [toucan2.honeysql2 :as t2.honeysql]
   [toucan2.jdbc.options :as t2.jdbc.options]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (com.mchange.v2.c3p0 PoolBackedDataSource WrapperConnectionPoolDataSource)
   (liquibase.exception LockException)))

(set! *warn-on-reflection* true)

(comment
  ;; load our custom migrations
  custom-migrations/keep-me
  ;; needed so the `:h2` dialect gets registered with Honey SQL
  metabase.util.honey-sql-2/keep-me)

(defn- print-migrations-and-quit-if-needed!
  "If we are not doing auto migrations then print out migration SQL for user to run manually. Then throw an exception to
  short circuit the setup process and make it clear we can't proceed."
  [liquibase data-source]
  (when (seq (liquibase/unrun-migrations data-source))
    (log/info (str "Database Upgrade Required"
                   "\n\n"
                   "NOTICE: Your database requires updates to work with this version of Metabase."
                   "\n"
                   "Please execute the following sql commands on your database before proceeding."
                   "\n\n"
                   (liquibase/migrations-sql liquibase)
                   "\n\n"
                   "Once your database is updated try running the application again."
                   "\n"))
    (throw (Exception. (trs "Database requires manual upgrade.")))))

(mu/defn migrate!
  "Migrate the application database specified by `data-source`.

  *  `:up`            - Migrate up
  *  `:force`         - Force migrate up, ignoring locks and any DDL statements that fail.
  *  `:down`          - Rollback to the previous major version schema.
  *  `:down-force`    - Rollback to the previous major version schema, ignoring any validation checks.
  *  `:print`         - Just print the SQL for running the migrations, don't actually run them.
  *  `:release-locks` - Manually release migration locks left by an earlier failed migration.
                        (This shouldn't be necessary now that we run migrations inside a transaction, but is
                        available just in case)."
  [data-source :- (ms/InstanceOfClass javax.sql.DataSource)
   direction   :- :keyword
   & args]
  ;; TODO: use [[jdbc/with-db-transaction]] instead of manually commit/rollback
  (with-open [conn (.getConnection ^javax.sql.DataSource data-source)]
    (.setAutoCommit conn false)
    ;; Set up liquibase and let it do its thing
    (log/info "Setting up Liquibase...")
    (liquibase/with-liquibase [liquibase conn]
      (try
        ;; Consolidating the changeset requires the lock, so we may need to release it first.
        (when (= :force direction)
          (liquibase/release-lock-if-needed! liquibase))
        ;; Releasing the locks does not depend on the changesets, so we skip this step as it might require locking.
        (when-not (= :release-locks direction)
          (liquibase/consolidate-liquibase-changesets! conn liquibase))
        (log/info "Liquibase is ready.")
        (case direction
          :up            (liquibase/migrate-up-if-needed! liquibase data-source)
          :force         (liquibase/force-migrate-up-if-needed! liquibase data-source)
          :down          (apply liquibase/rollback-major-version! conn liquibase false args)
          :down-force    (apply liquibase/rollback-major-version! conn liquibase true args)
          :print         (print-migrations-and-quit-if-needed! liquibase data-source)
          :release-locks (liquibase/force-release-locks! liquibase))
        ;; Migrations were successful; commit everything and re-enable auto-commit
        (.commit conn)
        (.setAutoCommit conn true)
        :done
        ;; In the Throwable block, we're releasing the lock assuming we have the lock and we failed while in the
        ;; middle of a migration. It's possible that we failed because we couldn't get the lock. We don't want to
        ;; clear the lock in that case, so handle that case separately
        (catch LockException e
          (.rollback conn)
          (throw e))
        ;; If for any reason any part of the migrations fail then rollback all changes
        (catch Throwable e
          (.rollback conn)
          ;; With some failures, it's possible that the lock won't be released. To make this worse, if we retry the
          ;; operation without releasing the lock first, the real error will get hidden behind a lock error
          (liquibase/release-lock-if-needed! liquibase)
          (throw e))))))

;;; this is somewhat duplicated from [[metabase.driver.sql-jdbc.connection/can-connect-with-spec?]] but it lets us
;;; decouple the `app-db` and `driver` modules.
(defn can-connect-to-data-source?
  "Test connection to a `data-source`. Returns truthy on success; throws an exception or returns falsey if unable to
  connect."
  [^javax.sql.DataSource data-source]
  (let [[first-row] (jdbc/query {:datasource data-source} ["SELECT 1"])
        [result]    (vals first-row)]
    (= result 1)))

(defn- unpooled-data-source
  "The plain [[javax.sql.DataSource]] a c3p0 pool was built from, or `data-source` unchanged if it isn't a c3p0 pool.

  Connecting through the pool hides why a connection could not be established: c3p0 acquires on background threads, so
  the caller only ever learns that its checkout timed out, while the driver's actual complaint (e.g. Postgres `3D000`,
  \"database ... does not exist\") is logged and dropped. Going direct keeps that exception on the stack, which matters
  for the one-shot connectivity check at startup -- see [[verify-db-connection]]."
  ^javax.sql.DataSource [^javax.sql.DataSource data-source]
  (or (when (instance? PoolBackedDataSource data-source)
        (let [pooled (.getConnectionPoolDataSource ^PoolBackedDataSource data-source)]
          (when (instance? WrapperConnectionPoolDataSource pooled)
            (.getNestedDataSource ^WrapperConnectionPoolDataSource pooled))))
      data-source))

(defn- load-supported-db-versions
  []
  (if-let [resource (io/resource "metabase/app_db/supported-db-versions.edn")]
    (edn/read-string (slurp resource))
    (throw (ex-info "Resource not found: metabase/app_db/supported-db-versions.edn"
                    {:path "metabase/app_db/supported-db-versions.edn"}))))

(def ^:private supported-db-versions
  "https://www.metabase.com/docs/latest/installation-and-operation/migrating-from-h2#supported-databases-for-storing-your-metabase-application-data"
  (load-supported-db-versions))

(defn- parse-db-version
  [product-version]
  (let [[_ major minor patch] (re-find #"^(\d+)(?:\.(\d+))?(?:\.(\d+))?" product-version)]
    {:major (or (some-> major parse-long) 0)
     :minor (or (some-> minor parse-long) 0)
     :patch (or (some-> patch parse-long) 0)}))

(mu/defn- db-version
  :- [:map
      [:major [:int {:min 0}]]
      [:minor [:int {:min 0}]]
      [:patch [:int {:min 0}]]]
  [^java.sql.DatabaseMetaData metadata :- (ms/InstanceOfClass java.sql.DatabaseMetaData)]
  (merge
   (parse-db-version (.getDatabaseProductVersion metadata))
   {:major (.getDatabaseMajorVersion metadata)
    :minor (.getDatabaseMinorVersion metadata)}))

(defn- supported-app-db-version?
  [db-type {:keys [major minor patch]}]
  (let [required-version (get supported-db-versions db-type)]
    (and required-version
         (not (pos? (compare ((juxt :major :minor :patch) required-version)
                             [major minor patch]))))))

(mu/defn verify-db-connection
  "Test connection to application database with `data-source` and throw an exception if we have any troubles
  connecting. Public so [[metabase.app-db.core/verify-application-db-connection!]] can call it from outside this
  namespace; most callers should use that wrapper instead of invoking this directly."
  [db-type     :- :keyword
   data-source :- (ms/InstanceOfClass javax.sql.DataSource)]
  (log/info (u/format-color 'cyan "Verifying %s Database Connection ..." (name db-type)))
  (let [error-msg (trs "Unable to connect to Metabase {0} DB." (name db-type))]
    ;; deliberately probing the unpooled data source: a failure here is nearly always a misconfiguration, and we want
    ;; the driver's own exception as the cause rather than c3p0's "checkout has timed out". See
    ;; [[unpooled-data-source]].
    (try (assert (can-connect-to-data-source? (unpooled-data-source data-source)) error-msg)
         (catch Throwable e
           (throw (ex-info error-msg {} e)))))
  (with-open [conn (.getConnection ^javax.sql.DataSource data-source)]
    (let [metadata (.getMetaData conn)
          db-version (db-version metadata)
          db-type (or (when (= "MariaDB" (.getDatabaseProductName metadata)) :mariadb)
                      db-type)]
      (if (supported-app-db-version? db-type db-version)
        (log/infof "Successfully verified %s %s application database connection. %s"
                   (.getDatabaseProductName metadata) (.getDatabaseProductVersion metadata) (u/emoji "✅"))
        (throw (ex-info (str/join \newline [(trs "Metabase {0} DB version not supported (found {1}, required {2}). Please upgrade your database to a supported version and try again."
                                                 (name db-type)
                                                 (format "%s.%s.%s (%s)"
                                                         (:major db-version)
                                                         (:minor db-version)
                                                         (:patch db-version)
                                                         (.getDatabaseProductVersion metadata))
                                                 (let [required-version (get supported-db-versions db-type)]
                                                   (format "%s.%s.%s"
                                                           (:major required-version)
                                                           (:minor required-version)
                                                           (:patch required-version))))
                                            "https://www.metabase.com/docs/latest/installation-and-operation/migrating-from-h2#supported-databases-for-storing-your-metabase-application-data"])
                        {}))))))

(mu/defn- error-if-downgrade-required!
  [data-source :- (ms/InstanceOfClass javax.sql.DataSource)]
  (log/info (u/format-color 'cyan "Checking if a database downgrade is required..."))
  (with-open [conn (.getConnection ^javax.sql.DataSource data-source)]
    (liquibase/with-liquibase [liquibase conn]
      (let [latest-available (liquibase/latest-available-major-version liquibase)
            latest-applied   (liquibase/latest-applied-major-version conn (.getDatabase liquibase))]
        ;; `latest-applied` will be `nil` for fresh installs
        (when (and latest-applied (< latest-available latest-applied))
          (let [later-changesets (liquibase/changesets-from-later-version conn (.getDatabase liquibase) latest-available latest-applied)]
            (log/warn (u/format-color 'red "Database has migrations from v%d but this binary only knows up to v%d:"
                                      latest-applied latest-available))
            (doseq [cs later-changesets]
              (log/warn (u/format-color 'red "  - %s" cs))))
          (throw (ex-info
                  (str (u/format-color 'red (trs "ERROR: Downgrade detected."))
                       "\n\n"
                       (trs "Your metabase instance appears to have been downgraded without a corresponding database downgrade.")
                       "\n\n"
                       (trs "You must run `java --add-opens java.base/java.nio=ALL-UNNAMED -jar metabase.jar migrate down` from version {0}." latest-applied)
                       "\n\n"
                       (trs "Once your database has been downgraded, try running the application again.")
                       "\n\n"
                       (trs "See: https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase#rolling-back-an-upgrade"))
                  {})))))))

(mu/defn- run-schema-migrations!
  "Run through our DB migration process and make sure DB is fully prepared"
  [data-source   :- (ms/InstanceOfClass javax.sql.DataSource)
   auto-migrate? :- :boolean]
  (log/info "Running Database Migrations...")
  (migrate! data-source (if auto-migrate? :up :print))
  (log/info "Database Migrations Current ..." (u/emoji "✅")))

;; TODO -- consider renaming to something like `verify-connection-and-migrate!`
(mu/defn setup-db!
  "Connects to db and runs migrations. Don't use this directly, unless you know what you're doing;
  use [[metabase.app-db.setup-db!]] instead, which can be called more than once without issue and is thread-safe.

  Options:
  - `:auto-migrate?` (default `true`): run pending migrations, otherwise only print them.
  - `:create-sample-content?` (default `false`): create the sample content on a fresh install.
  - `:manage-encryption-state?` (default `true`): verify MB_ENCRYPTION_SECRET_KEY against the database before
    migrations run (see [[mdb.encryption/encryption-state]] and [[mdb.encryption/check-encryption]]) and record the
    state afterwards (see [[mdb.encryption/record-encryption-state!]]). Turned off by the `enable-encryption` command
    and by [[metabase.cmd.copy/copy!]],
    which handle the encryption state themselves."
  ([db-type data-source]
   (setup-db! db-type data-source {}))

  ([db-type     :- :keyword
    data-source :- (ms/InstanceOfClass javax.sql.DataSource)
    {:keys [auto-migrate? create-sample-content? manage-encryption-state?]
     :or   {auto-migrate? true, create-sample-content? false, manage-encryption-state? true}}
    :- [:map
        [:auto-migrate?          {:optional true} :boolean]
        [:create-sample-content? {:optional true} :boolean]
        [:manage-encryption-state?      {:optional true} :boolean]]]
   (u/profile (trs "Database setup")
     (u/with-us-locale
       (binding [mdb.connection/*application-db*           (mdb.connection/application-db db-type data-source :create-pool? false) ; should already be a pool
                 config/*disable-setting-cache*            true
                 custom-migrations/*create-sample-content* create-sample-content?]
         (verify-db-connection db-type data-source)
         (error-if-downgrade-required! data-source)
         (let [db-state (mdb.encryption/encryption-state)]
           (when manage-encryption-state?
             (mdb.encryption/check-encryption db-state))
           (run-schema-migrations! data-source auto-migrate?)
           (when manage-encryption-state?
             (mdb.encryption/record-encryption-state! db-state))))))
   :done))

(defn release-migration-locks!
  "Wait up to `timeout-seconds` for the current process to release all migration locks, otherwise force release them."
  [data-source timeout-seconds]
  (let [sleep-ms   100
        timeout-ms (* 1000 timeout-seconds)]
    (case (liquibase/wait-for-all-locks sleep-ms timeout-ms)
      :none nil
      :done (log/info "Migration lock(s) have been released")
      :timed-out (do (log/warn "Releasing liquibase locks on shutdown")
                     ;; There's an infinitesimal chance that we released the lock and another server took it between
                     ;; the timeout, and the mutations we now make to these lock tables - but we can't detect that.
                     (liquibase/release-concurrent-locks! data-source))))
  :done)

;;;; Toucan Setup.

;;; Done at namespace load time these days.

;;; create a custom HoneySQL quoting style called `::application-db` that uses the appropriate quote function based on
;;; [[*application-db*]]; register this as the default quoting style for Toucan. Then
(defn quote-for-application-db
  "Quote SQL identifier string `s` appropriately for the currently bound application database."
  ([s]
   (quote-for-application-db (mdb.connection/quoting-style (mdb.connection/db-type)) s))
  ([dialect s]
   {:pre [(#{:h2 :ansi :mysql} dialect)]}
   ((:quote (sql/get-dialect dialect)) s)))

(defn- clause-order-fn-for-application-db [clauses]
  (case (mdb.connection/db-type)
    (:postgres :h2) clauses
    :mysql          (let [{f :clause-order-fn} (sql/get-dialect :mysql)]
                      (f clauses))))

;;; register with Honey SQL 2
(sql/register-dialect!
 ::application-db
 (assoc (sql/get-dialect :ansi)
        :quote           quote-for-application-db
        :clause-order-fn clause-order-fn-for-application-db))

(reset! t2.honeysql/global-options
        {:quoted       true
         :dialect      ::application-db
         :quoted-snake false})

(reset! t2.jdbc.options/global-options
        {:read-columns mdb.jdbc-protocols/read-columns
         :label-fn     u/lower-case-en})

(defn- keyword-condition
  "A `:k v` condition with its column, and the operator of a `[op & args]` value, spelled as keywords: Toucan 2 looks
  up column transforms by keyword and only accepts a keyword operator, while app-DB code writes both as symbols."
  [[k v]]
  [(if (symbol? k) (keyword (namespace k) (name k)) k)
   (if (and (vector? v) (symbol? (first v))) (assoc v 0 (keyword (name (first v)))) v)])

(defn- keyword-conditions [conditions]
  (when conditions
    (into {} (map keyword-condition) conditions)))

(methodical/defmethod t2.pipeline/build :around :default
  "Normally, our Honey SQL 2 `:dialect` is set to `::application-db`; however, Toucan 2 does need to know the actual
  dialect to do special query building magic. When building a Honey SQL form, make sure `:dialect` is bound to the
  *actual* dialect for the application database."
  [query-type model parsed-args resolved-query]
  (binding [t2.honeysql/*options* (assoc t2.honeysql/*options*
                                         :dialect (mdb.connection/quoting-style (mdb.connection/db-type)))]
    (next-method query-type
                 model
                 (update parsed-args :kv-args keyword-conditions)
                 ;; the map passed to `update!` is a conditions map rather than a query
                 (if (and (isa? query-type :toucan.query-type/update.*) (map? resolved-query))
                   (keyword-conditions resolved-query)
                   resolved-query))))

(methodical/defmethod t2.pipeline/build :after [#_query-type :toucan.query-type/delete.*
                                                #_model      :default
                                                #_query      clojure.lang.IPersistentMap]
  "If a built DELETE query explicitly specifies `delete`/`from` then remove the automatically-added `delete-from`
  key. Work around https://github.com/camsaul/toucan2/issues/202 until it is fixed upstream."
  [_query-type _model _parsed-args query]
  (cond-> query
    (:delete query) (dissoc query :delete-from)))

(methodical/defmethod t2.pipeline/build :before [#_query-type :toucan.query-type/select.instances
                                                 #_model      :toucan2.tools.before-delete/before-delete
                                                 #_query      clojure.lang.IPersistentMap]
  "If we're doing a SELECT query to implement before-delete behavior make sure we remove `delete-from`/`delete` keys from
  the query if needed. Work around https://github.com/camsaul/toucan2/issues/203 until it is fixed upstream."
  [_query-type _model _parsed-args query]
  (cond-> query
    true
    (dissoc 'delete)

    (contains? query :delete-from)
    (-> (dissoc :delete-from)
        (assoc :from [(:delete-from query)]))))
