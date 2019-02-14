(ns metabase.db.config
  "Logic for getting connection information about the application DB from configuration sources such as env vars."
  (:require [clojure.java
             [io :as io]
             [jdbc :as jdbc]]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.db.spec :as db.spec]
            [metabase.util.i18n :refer [trs]]
            [schema.core :as s])
  (:import java.net.URI))

(def DBType
  "Schema for a valid application type for Metabase (the value of `MB_DB_TYPE`, `h2` by default)."
  (s/enum :h2 :postgres :mysql))

(def JDBCSpec
  "Schema for a `clojure.java.jdbc` DB connection spec as used by `metabase.db.*` namespaces. (This schema is a subset
  of what is actually accepted -- see `jdbc/get-connection` -- but represents the types we use for the application DB.)"
  (s/constrained
   {s/Keyword s/Any}
   #(some
     #{:connection :subprotocol :datasource}
     (keys %))))

(defn- config-method
  "Determine how configuration options for the application DB are being specified. If `MB_DB_CONNECTION_URI` is set,
  we're using `:connection-string`; otherwise we're using [broken out] `:env-vars`."
  []
  (if (config/config-str :mb-db-connection-uri)
    :connection-string
    :env-vars))

(defmulti ^:private db-type*
  "Fetch the application DB type for the `config-method` we're using."
  {:arglists '([] [config-method])}
  (fn
    ([] (config-method))
    ([config-method] config-method)))

(defmulti ^:private jdbc-spec*
  "Fetch an application DB `clojure.java.jdbc` connection spec for the `config-method` we're using."
  {:arglists '([] [config-method] [config-method db-type])}
  (fn
    ([] (config-method))
    ([config-method] config-method)
    ([config-method _] config-method)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                              Config for connection string (MB_DB_CONNECTION_URI)                               |
;;; +----------------------------------------------------------------------------------------------------------------+

(s/defn ^:private connection-string->db-type :- DBType
  [connection-string :- s/Str]
  (case (.getScheme (URI. (#'jdbc/strip-jdbc connection-string)))
    "postgresql" :postgres
    "postgres"   :postgres
    "mysql"      :mysql
    "h2"         :h2))

(defmethod db-type* :connection-string [& _]
  (connection-string->db-type (config/config-str :mb-db-connection-uri)))


(s/defn ^:private connection-string->spec :- JDBCSpec
  [connection-string :- s/Str]
  (#'jdbc/parse-properties-uri (URI. (#'jdbc/strip-jdbc connection-string))))

(defmethod jdbc-spec* :connection-string [& _]
  (connection-string->spec (config/config-str :mb-db-connection-uri)))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                         Config for broken-out env vars (MB_DB_TYPE, MB_DB_HOST, etc.)                          |
;;; +----------------------------------------------------------------------------------------------------------------+

(defmethod db-type* :env-vars [& _]
  (config/config-kw :mb-db-type))

(defmulti ^:private jdbc-spec-from-env-vars
  {:arglists '([] [db-type])}
  (fn
    ([] (db-type*))
    ([db-type] db-type)))

(defmethod jdbc-spec* :env-vars
  ([]
   (jdbc-spec-from-env-vars))
  ([_]
   (jdbc-spec-from-env-vars))
  ([_ db-type]
   (jdbc-spec-from-env-vars db-type)))

(defn ^:private h2-db-filename
  "Name"
  []
  (if (config/config-bool :mb-db-in-memory)
    ;; In-memory (i.e. test) DB
    "mem:metabase"
    ;; File-based DB
    (str "file:" (.getAbsolutePath (io/file (config/config-str :mb-db-file))))))

(defmethod jdbc-spec-from-env-vars :h2 [& _]
  (db.spec/h2
   {:db (h2-db-filename)}))

(defmethod jdbc-spec-from-env-vars :postgres [& _]
  (db.spec/postgres
   {:host     (config/config-str :mb-db-host)
    :port     (config/config-int :mb-db-port)
    :db       (config/config-str :mb-db-dbname)
    :user     (config/config-str :mb-db-user)
    :password (config/config-str :mb-db-pass)}))

(defmethod jdbc-spec-from-env-vars :mysql [& _]
  (db.spec/mysql
   {:host     (config/config-str :mb-db-host)
    :port     (config/config-int :mb-db-port)
    :db       (config/config-str :mb-db-dbname)
    :user     (config/config-str :mb-db-user)
    :password (config/config-str :mb-db-pass)}))


;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                db-type & jdbc-spec -- regardless of config type                                |
;;; +----------------------------------------------------------------------------------------------------------------+

(def ^:private warn-about-using-h2
  (delay
   (log/warn
    (trs "WARNING: Using Metabase with an H2 application database is not recomended for production deployments.")
    (trs "For production deployments, we highly recommend using Postgres, MySQL, or MariaDB instead.")
    (trs "If you decide to continue to use H2, please be sure to back up the database file regularly.")
    (trs "See https://metabase.com/docs/latest/operations-guide/start.html#migrating-from-using-the-h2-database-to-mysql-or-postgres for more information."))))

(s/defn db-type :- DBType
  "Type of the application database -- `:h2`, `:postgres`, or `:mysql`."
  []
  (u/prog1 (db-type*)
    (when (= <> :h2)
      @warn-about-using-h2)))


(defmulti ^:private application-db-connection-properties
  "Modify the connection `properties` as needed for the application DB when it is of a given `db-type`. Add additional
  properties, warn about potential hazards, etc."
  {:arglists '([db-type properties])}
  (fn [db-type _]
    (keyword db-type)))

(defmethod application-db-connection-properties :default [_ props] props)

(defmethod application-db-connection-properties :h2 [_ props]
  (merge
   props
   {:DB_CLOSE_DELAY -1
    ;; we need to enable MVCC for Quartz JDBC backend to work! Quartz depends on row-level locking, which
    ;; means without MVCC we "will experience dead-locks". MVCC is the default for everyone using the
    ;; MVStore engine anyway so this only affects people still with legacy PageStore databases
    :MVCC           true
    ;; Tell H2 to defrag when Metabase is shut down -- can reduce DB size by multiple GIGABYTES -- see #6510
    :DEFRAG_ALWAYS  true}))

(def ^:private warn-about-postgres-ssl-without-sslmode
  (delay
   (log/warn
    (trs "Warning: Postgres connection string with `ssl=true` detected.")
    (trs "You may need to add `?sslmode=require` to your application DB connection string.")
    (trs "If Metabase fails to launch, please add it and try again.")
    (trs "See https://github.com/metabase/metabase/issues/8908 for more details."))))

(defmethod application-db-connection-properties :postgres [_ props]
  (when (and (some-> (:ssl props) Boolean/parseBoolean)
             (not (:sslmode props)))
    @warn-about-postgres-ssl-without-sslmode)
  (merge
   props
   ;; setting this prevents conflict between Postgres & Redshift drivers
   {:OpenSourceSubProtocolOverride true}))


(s/defn jdbc-spec :- JDBCSpec
  "Fetch a `clojure.java.jdbc` connection spec for using the application database."
  ([]
   (jdbc-spec (db-type)))
  ([db-type]
   (jdbc-spec (config-method) db-type))
  ([config-method db-type]
   (application-db-connection-properties
    db-type
    (jdbc-spec* config-method db-type))))
