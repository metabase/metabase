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
      @mdb.env/db-type))

(def ^:dynamic *jdbc-spec*
  "Bind this to override the default application DB JDBC spec."
  nil)

(defn jdbc-spec
  "`clojure.java.jdbc` spec map for the application DB, using the details map derived from environment variables. This
  is NOT a pooled connection spec! That's created later as part of `setup-db!` -- use `(toucan.db/connection)` to get
  it if you need to use it directly."
  []
  (or *jdbc-spec*
      @mdb.env/jdbc-spec))

(defn quoting-style
  "HoneySQL quoting style to use for application DBs of the given type. Note for H2 application DBs we automatically
  uppercase all identifiers (since this is H2's default behavior) whereas in the SQL QP we stick with the case we got
  when we synced the DB."
  [db-type]
  (case db-type
    :postgres :ansi
    :h2       :h2
    :mysql    :mysql))
