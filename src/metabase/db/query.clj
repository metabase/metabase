(ns metabase.db.query
  "Honey SQL 2 replacements for [[toucan.db/query]] and [[toucan.db/reducible-query]]. These are here to ease our
  transition to Honey SQL 2 and Toucan 2. Once we switch over to the latter we can hopefully remove this namespace.

  PRO TIPS:

  1. You can enable debug logging for the compiled SQL locally by setting the log level for this namespace to
     `:trace`:

     ```
     (metabase.test/set-ns-log-level! 'metabase.db.query :trace)
     ```

  2. If using CIDER, set

     ```
     (setq cider-stacktrace-fill-column nil)
     ```

     So the nicely-formatted SQL in error messages doesn't get wrapped into a big blob in the `*cider-error*` buffer."
  (:refer-clojure :exclude [compile])
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.tools.logging :as log]
   [honey.sql :as sql]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.honeysql-extensions :as hx]
   [toucan.db :as db])
  (:import
   (com.github.vertical_blank.sqlformatter SqlFormatter)))

(set! *warn-on-reflection* true)

(defmulti compile
  {:arglists '([query])}
  type)

(defmethod compile String
  [sql]
  (compile [sql]))

(defmethod compile clojure.lang.IPersistentVector
  [sql-args]
  sql-args)

(defmethod compile clojure.lang.IPersistentMap
  [honey-sql]
  ;; make sure metabase.db.setup is loaded so the `:metabase.db.setup/application-db` gets defined
  (classloader/require 'metabase.db.setup)
  (let [sql-args (try
                   (binding [hx/*honey-sql-version* 2]
                     (sql/format honey-sql {:quoted true, :dialect :metabase.db.setup/application-db, :pretty true}))
                   (catch Throwable e
                     ;; this is not i18n'ed because it (hopefully) shouldn't be user-facing -- we shouldn't be running
                     ;; in to unexpected Honey SQL compilation errors at run time -- if we are it means we're not being
                     ;; careful enough with the Honey SQL forms we create which is a bug in the Metabase code we should
                     ;; have caught in tests.
                     (throw (ex-info (str "Error compiling Honey SQL: " (ex-message e))
                                     {:honey-sql honey-sql}
                                     e))))]
    (log/tracef "Compiled SQL:\n%s\nparameters: %s"
                (SqlFormatter/format (first sql-args))
                (pr-str (rest sql-args)))
    sql-args))

;; TODO -- not clear if we should be merging this in (as Toucan 1 does) or not
(defn- default-jbc-options []
  @@#'toucan.db/default-jdbc-options)

(defn query
  "Replacement for [[toucan.db/query]] -- uses Honey SQL 2 instead of Honey SQL 1, to ease the transition to the
  former (and to Toucan 2).

  Query the application database and return all results at once.

  See namespace documentation for [[metabase.db.query]] for pro debugging tips."
  [sql-args-or-honey-sql-map & {:as jdbc-options}]
  (let [sql-args (compile sql-args-or-honey-sql-map)]
    ;; catch errors running the query and rethrow with the failing generated SQL and the failing Honey SQL form -- this
    ;; will help with debugging stuff. This should mostly be dev-facing because we should hopefully not be committing
    ;; any busted code into the repo
    (try
      (jdbc/query (db/connection) sql-args (merge (default-jbc-options) jdbc-options))
      (catch Throwable e
        (let [formatted-sql (SqlFormatter/format (first sql-args))]
          (throw (ex-info (str "Error executing SQL query: " (ex-message e)
                               \newline
                               \newline
                               formatted-sql)
                          {:sql        (str/split-lines (str/trim formatted-sql))
                           :args       (rest sql-args)
                           :uncompiled sql-args-or-honey-sql-map}
                          e)))))))

(defn reducible-query
  "Replacement for [[toucan.db/reducible-query]] -- uses Honey SQL 2 instead of Honey SQL 1, to ease the transition to
  the former (and to Toucan 2).

  Query the application database and return an `IReduceInit`.

  See namespace documentation for [[metabase.db.query]] for pro debugging tips."
  [sql-args-or-honey-sql-map & {:as jdbc-options}]
  (let [sql-args (compile sql-args-or-honey-sql-map)]
    ;; It doesn't really make sense to put a try-catch around this since it will return immediately and not execute
    ;; until we actually reduce it
    (jdbc/reducible-query (db/connection) sql-args (merge (default-jbc-options) jdbc-options))))
