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
   [clojure.string :as str]
   [honey.sql :as sql]
   [metabase.db.connection :as mdb.connection]
   [metabase.driver :as driver]
   [metabase.plugins.classloader :as classloader]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.jdbc :as t2.jdbc]))

(set! *warn-on-reflection* true)

(defn format-sql
  "Return a nicely-formatted version of a `query` string with the current application db driver formatting."
  [sql]
  (driver/prettify-native-form (mdb.connection/db-type) sql))

(defmulti compile
  "Compile a `query` (e.g. a Honey SQL map) to `[sql & args]`."
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
                   (sql/format honey-sql {:quoted true, :dialect :metabase.db.setup/application-db, :quoted-snake false})
                   (catch Throwable e
                     ;; this is not i18n'ed because it (hopefully) shouldn't be user-facing -- we shouldn't be running
                     ;; in to unexpected Honey SQL compilation errors at run time -- if we are it means we're not being
                     ;; careful enough with the Honey SQL forms we create which is a bug in the Metabase code we should
                     ;; have caught in tests.
                     (throw (ex-info (str "Error compiling Honey SQL: " (ex-message e))
                                     {:honey-sql honey-sql}
                                     e))))]
    (log/tracef "Compiled SQL:\n%s\nparameters: %s"
                (format-sql (first sql-args))
                (pr-str (rest sql-args)))
    sql-args))

(defn query
  "Replacement for [[toucan.db/query]] -- uses Honey SQL 2 instead of Honey SQL 1, to ease the transition to the
  former (and to Toucan 2).

  Query the application database and return all results at once.

  See namespace documentation for [[metabase.db.query]] for pro debugging tips."
  [sql-args-or-honey-sql-map & {:as jdbc-options}]
  ;; make sure [[metabase.db.setup]] gets loaded so default Honey SQL options and the like are loaded.
  (classloader/require 'metabase.db.setup)
  (let [sql-args (compile sql-args-or-honey-sql-map)]
    ;; catch errors running the query and rethrow with the failing generated SQL and the failing Honey SQL form -- this
    ;; will help with debugging stuff. This should mostly be dev-facing because we should hopefully not be committing
    ;; any busted code into the repo
    (try
      (binding [t2.jdbc/*options* (merge t2.jdbc/*options* jdbc-options)]
        (t2/query sql-args))
      (catch Throwable e
        (let [formatted-sql (format-sql (first sql-args))]
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
  ;; make sure [[metabase.db.setup]] gets loaded so default Honey SQL options and the like are loaded.
  (classloader/require 'metabase.db.setup)
  (let [sql-args (compile sql-args-or-honey-sql-map)]
    ;; It doesn't really make sense to put a try-catch around this since it will return immediately and not execute
    ;; until we actually reduce it
    (reify clojure.lang.IReduceInit
      (reduce [_this rf init]
        (binding [t2.jdbc/*options* (merge t2.jdbc/*options* jdbc-options)]
          (reduce rf init (t2/reducible-query sql-args)))))))
