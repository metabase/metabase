(ns metabase.db.setup
  "Code for setting up the application DB -- verifying that we can connect and for running migrations. Unlike code in
  `metabase.db`, code here takes a `clojure.java.jdbc` spec as a parameter; the higher-level code in `metabase.db`
  presents a similar set of functions but passes in the default (i.e., env var) application DB connection details
  automatically.

  Because functions here don't know where the JDBC spec came from, you can use them to perform the usual application
  DB setup steps on arbitrary databases -- useful for functionality like the `load-from-h2` or `dump-to-h2` commands."
  (:require
   [honey.sql :as sql]
   [metabase.db.connection :as mdb.connection]
   metabase.db.custom-migrations ;; load our custom migrations
   [metabase.db.jdbc-protocols :as mdb.jdbc-protocols]
   [metabase.db.liquibase :as liquibase]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.models.setting :as setting]
   [metabase.plugins.classloader :as classloader]
   [metabase.util :as u]
   [metabase.util.honey-sql-2]
   [metabase.util.i18n :refer [trs]]
   [metabase.util.log :as log]
   [methodical.core :as methodical]
   [schema.core :as s]
   [toucan2.jdbc :as t2.jdbc]
   [toucan2.map-backend.honeysql2 :as t2.honeysql]
   [toucan2.pipeline :as t2.pipeline])
  (:import
   (liquibase.exception LockException)))

(set! *warn-on-reflection* true)

;;; needed so the `:h2` dialect gets registered with Honey SQL
(comment metabase.util.honey-sql-2/keep-me)

(defn- print-migrations-and-quit-if-needed!
  "If we are not doing auto migrations then print out migration SQL for user to run manually. Then throw an exception to
  short circuit the setup process and make it clear we can't proceed."
  [liquibase]
  (when (liquibase/has-unrun-migrations? liquibase)
    (log/info (str (trs "Database Upgrade Required")
                   "\n\n"
                   (trs "NOTICE: Your database requires updates to work with this version of Metabase.")
                   "\n"
                   (trs "Please execute the following sql commands on your database before proceeding.")
                   "\n\n"
                   (liquibase/migrations-sql liquibase)
                   "\n\n"
                   (trs "Once your database is updated try running the application again.")
                   "\n"))
    (throw (Exception. (trs "Database requires manual upgrade.")))))

(s/defn migrate!
  "Migrate the application database specified by `data-source`.

  *  `:up`            - Migrate up
  *  `:force`         - Force migrate up, ignoring locks and any DDL statements that fail.
  *  `:down`          - Rollback to the previous major version schema
  *  `:print`         - Just print the SQL for running the migrations, don't actually run them.
  *  `:release-locks` - Manually release migration locks left by an earlier failed migration.
                        (This shouldn't be necessary now that we run migrations inside a transaction, but is
                        available just in case).

  Note that this only performs *schema migrations*, not data migrations. Data migrations are handled separately by
  [[metabase.db.data-migrations/run-all!]]. ([[setup-db!]], below, calls both this function and [[run-all!]])."
  [db-type     :- s/Keyword
   data-source :- javax.sql.DataSource
   direction   :- s/Keyword
   & args      :- [s/Any]]
  (with-open [conn (.getConnection data-source)]
    (.setAutoCommit conn false)
    ;; Set up liquibase and let it do its thing
    (log/info (trs "Setting up Liquibase..."))
    (liquibase/with-liquibase [liquibase conn]
      (try
        (liquibase/consolidate-liquibase-changesets! db-type conn)
        (log/info (trs "Liquibase is ready."))
        (case direction
          :up            (liquibase/migrate-up-if-needed! liquibase)
          :force         (liquibase/force-migrate-up-if-needed! conn liquibase)
          :down          (apply liquibase/rollback-major-version db-type conn liquibase args)
          :print         (print-migrations-and-quit-if-needed! liquibase)
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

(s/defn ^:private verify-db-connection
  "Test connection to application database with `data-source` and throw an exception if we have any troubles
  connecting."
  [db-type     :- s/Keyword
   data-source :- javax.sql.DataSource]
  (log/info (u/format-color 'cyan (trs "Verifying {0} Database Connection ..." (name db-type))))
  (classloader/require 'metabase.driver.util)
  (let [error-msg (trs "Unable to connect to Metabase {0} DB." (name db-type))]
    (try (assert (sql-jdbc.conn/can-connect-with-spec? {:datasource data-source}) error-msg)
         (catch Throwable e
           (throw (ex-info error-msg {} e)))))
  (with-open [conn (.getConnection data-source)]
    (let [metadata (.getMetaData conn)]
      (log/info (trs "Successfully verified {0} {1} application database connection."
                     (.getDatabaseProductName metadata) (.getDatabaseProductVersion metadata))
                (u/emoji "✅")))))

(def ^:dynamic ^Boolean *disable-data-migrations*
  "Should we skip running data migrations when setting up the DB? (Default is `false`).
  There are certain places where we don't want to do this; for example, none of the migrations should be ran when
  Metabase is launched via `load-from-h2`.  That's because they will end up doing things like creating duplicate
  entries for the \"magic\" groups and permissions entries. "
  false)

(s/defn ^:private run-schema-migrations!
  "Run through our DB migration process and make sure DB is fully prepared"
  [db-type       :- s/Keyword
   data-source   :- javax.sql.DataSource
   auto-migrate? :- (s/maybe s/Bool)]
  (log/info (trs "Running Database Migrations..."))
  (migrate! db-type data-source (if auto-migrate? :up :print))
  (log/info (trs "Database Migrations Current ... ") (u/emoji "✅")))

(s/defn ^:private run-data-migrations!
  "Do any custom code-based migrations now that the db structure is up to date."
  []
  ;; TODO -- check whether we can remove the circular ref busting here.
  (when-not *disable-data-migrations*
    (classloader/require 'metabase.db.data-migrations)
    ((resolve 'metabase.db.data-migrations/run-all!))))

;; TODO -- consider renaming to something like `verify-connection-and-migrate!`
;;
;; TODO -- consider whether this should be done automatically the first time someone calls `getConnection`
(s/defn setup-db!
  "Connects to db and runs migrations. Don't use this directly, unless you know what you're doing;
  use [[metabase.db/setup-db!]] instead, which can be called more than once without issue and is thread-safe."
  [db-type       :- s/Keyword
   data-source   :- javax.sql.DataSource
   auto-migrate? :- (s/maybe s/Bool)]
  (u/profile (trs "Database setup")
    (u/with-us-locale
       (binding [mdb.connection/*application-db* (mdb.connection/application-db db-type data-source :create-pool? false) ; should already be a pool
                 setting/*disable-cache*         true]
         (verify-db-connection   db-type data-source)
         (run-schema-migrations! db-type data-source auto-migrate?)
         (run-data-migrations!))))
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

(reset! t2.jdbc/global-options
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
