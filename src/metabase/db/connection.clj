(ns metabase.db.connection
  "Functions for getting the application database connection type and JDBC spec, or temporarily overriding them."
  (:require [metabase.db.env :as mdb.env]
            [toucan.db :as db]))

(def ^:dynamic ^:private *db-type*
  nil)

(defn db-type
  "Keyword type name of the application DB. Matches corresponding db-type name e.g. `:h2`, `:mysql`, or `:postgres`."
  []
  (or *db-type*
      @mdb.env/db-type))

(def ^:dynamic ^:private *jdbc-spec* nil)

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

(defn do-with-application-db
  "Impl for `with-application-db`."
  [db-type jdbc-spec f]
  (binding [*db-type*          db-type
            *jdbc-spec*        jdbc-spec
            db/*db-connection* jdbc-spec
            db/*quoting-style* (quoting-style db-type)]
    (f)))

(defmacro with-application-db {:style/indent 2}
  [db-type jdbc-spec & body]
  `(do-with-application-db ~db-type ~jdbc-spec (fn ~'with-application-db* [] ~@body)))
