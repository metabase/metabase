(ns metabase.db.setup
  "Code for setting up the application DB -- verifying that we can connect and for running migrations. Unlike code in
  `metabase.db`, code here takes a `clojure.java.jdbc` spec as a parameter; the higher-level code in `metabase.db`
  presents a similar set of functions but passes in the default (i.e., env var) application DB connection details
  automatically.

  Because functions here don't know where the JDBC spec came from, you can use them to perform the usual application
  DB setup steps on arbitrary databases -- useful for functionality like the `load-from-h2` or `dump-to-h2` commands."
  (:require
   [honey.sql :as sql]
   [metabase.config :as config]
   [metabase.db.connection :as mdb.connection]
   [metabase.db.custom-migrations :as custom-migrations]
   [metabase.db.jdbc-protocols :as mdb.jdbc-protocols]
   [metabase.db.liquibase :as liquibase]
   [metabase.plugins.classloader :as classloader]
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
  *  `:down`          - Rollback to the previous major version schema
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
         :down          (apply liquibase/rollback-major-version conn liquibase args)
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

(mu/defn ^:private verify-db-connection
  "Test connection to application database with `data-source` and throw an exception if we have any troubles
  connecting."
  [db-type     :- :keyword
   data-source :- (ms/InstanceOfClass javax.sql.DataSource)]
  (log/info (u/format-color 'cyan "Verifying %s Database Connection ..." (name db-type)))
  (classloader/require 'metabase.driver.sql-jdbc.connection)
  (let [error-msg (trs "Unable to connect to Metabase {0} DB." (name db-type))]
    (try (assert ((requiring-resolve 'metabase.driver.sql-jdbc.connection/can-connect-with-spec?) {:datasource data-source}) error-msg)
         (catch Throwable e
           (throw (ex-info error-msg {} e)))))
  (with-open [conn (.getConnection ^javax.sql.DataSource data-source)]
    (let [metadata (.getMetaData conn)]
      (log/infof "Successfully verified %s %s application database connection. %s"
                 (.getDatabaseProductName metadata) (.getDatabaseProductVersion metadata) (u/emoji "✅")))))

(mu/defn ^:private error-if-downgrade-required!
  [data-source :- (ms/InstanceOfClass javax.sql.DataSource)]
  (log/info (u/format-color 'cyan "Checking if a database downgrade is required..."))
  (with-open [conn (.getConnection ^javax.sql.DataSource data-source)]
    (liquibase/with-liquibase [liquibase conn]
      (let [latest-available (liquibase/latest-available-major-version liquibase)
            latest-applied (liquibase/latest-applied-major-version conn)]
        ;; `latest-applied` will be `nil` for fresh installs
        (when (and latest-applied (< latest-available latest-applied))
          (throw (ex-info
                  (str (u/format-color 'red (trs "ERROR: Downgrade detected."))
                       "\n\n"
                       (trs "Your metabase instance appears to have been downgraded without a corresponding database downgrade.")
                       "\n\n"
                       (trs "You must run `java -jar metabase.jar migrate down` from version {0}." latest-applied)
                       "\n\n"
                       (trs "Once your database has been downgraded, try running the application again.")
                       "\n\n"
                       (trs "See: https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase#rolling-back-an-upgrade"))
                  {})))))))

(mu/defn ^:private run-schema-migrations!
  "Run through our DB migration process and make sure DB is fully prepared"
  [data-source   :- (ms/InstanceOfClass javax.sql.DataSource)
   auto-migrate? :- :boolean]
  (log/info "Running Database Migrations...")
  (migrate! data-source (if auto-migrate? :up :print))
  (log/info "Database Migrations Current ..." (u/emoji "✅")))

;; TODO -- consider renaming to something like `verify-connection-and-migrate!`
(mu/defn setup-db!
  "Connects to db and runs migrations. Don't use this directly, unless you know what you're doing;
  use [[metabase.db/setup-db!]] instead, which can be called more than once without issue and is thread-safe."
  [db-type                :- :keyword
   data-source            :- (ms/InstanceOfClass javax.sql.DataSource)
   auto-migrate?          :- :boolean
   create-sample-content? :- :boolean]
  (u/profile (trs "Database setup")
    (u/with-us-locale
      (binding [mdb.connection/*application-db*           (mdb.connection/application-db db-type data-source :create-pool? false) ; should already be a pool
                config/*disable-setting-cache*            true
                custom-migrations/*create-sample-content* create-sample-content?]
         (verify-db-connection db-type data-source)
         (error-if-downgrade-required! data-source)
         (run-schema-migrations! data-source auto-migrate?))))
  :done)

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

;;; register with Honey SQL 2
(sql/register-dialect!
 ::application-db
 (assoc (sql/get-dialect :ansi)
        :quote quote-for-application-db))

(reset! t2.honeysql/global-options
        {:quoted       true
         :dialect      ::application-db
         :quoted-snake false})

(reset! t2.jdbc.options/global-options
        {:read-columns mdb.jdbc-protocols/read-columns
         :label-fn     u/lower-case-en})

(methodical/defmethod t2.pipeline/build :around :default
  "Normally, our Honey SQL 2 `:dialect` is set to `::application-db`; however, Toucan 2 does need to know the actual
  dialect to do special query building magic. When building a Honey SQL form, make sure `:dialect` is bound to the
  *actual* dialect for the application database."
  [query-type model parsed-args resolved-query]
  (binding [t2.honeysql/*options* (assoc t2.honeysql/*options*
                                         :dialect (mdb.connection/quoting-style (mdb.connection/db-type)))]
    (next-method query-type model parsed-args resolved-query)))
