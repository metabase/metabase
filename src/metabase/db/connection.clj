(ns metabase.db.connection
  "Functions for getting the application database connection type and JDBC spec, or temporarily overriding them.
   TODO - consider renaming this namespace `metabase.db.config`."
  (:require [metabase.db.env :as mdb.env]))

(def ^:dynamic *db-type*
  "Bind this to override the default application DB type."
  nil)

(defn db-type
  "Keyword type name of the application DB. Matches corresponding db-type name e.g. `:h2`, `:mysql`, or `:postgres`."
  []
  (or *db-type*
      mdb.env/db-type))

(def ^:dynamic ^javax.sql.DataSource *data-source*
  "Bind this to override the default application DB data source. Use functions in [[metabase.db.data-source]] if you
  need help creating one."
  nil)

(defn data-source
  "Get a data source for the application DB, derived from environment variables. This is NOT a pooled data source!
  That's created later as part of [[metabase.db/setup-db!]] -- use [[toucan.db/connection]] if you want to get
  a [[clojure.java.jdbc]] spec for the connection pool."
  ^javax.sql.DataSource []
  (or *data-source*
      mdb.env/data-source))

(defn quoting-style
  "HoneySQL quoting style to use for application DBs of the given type. Note for H2 application DBs we automatically
  uppercase all identifiers (since this is H2's default behavior) whereas in the SQL QP we stick with the case we got
  when we synced the DB."
  [db-type]
  (case db-type
    :postgres :ansi
    :h2       :h2
    :mysql    :mysql))
