(ns metabase.db.env
  "Logic related to fetching and working with the connection details for the application database. These are provided by
  environment variables -- either as a single JDBC connection URL string (`MB_DB_CONNECTION_URI`) or as broken-out
  environment variables e.g. `MB_DB_TYPE`, `MB_DB_HOST`, etc. `MB_DB_CONNECTION_URI` is used preferentially if both
  are specified.

  There are three ways you can specify application JDBC connection information for Metabase:

  1. As broken-out connection details -- see [[env]] for a list of env vars. This is basically the same
    format the actual `:details` map we save when creating a [[metabase.models.Database]] object. We convert this to
    a [[clojure.java.jdbc]] spec map using [[metabase.db.spec/spec]] and then to create a [[javax.sql.DataSource]] from
    it. See [[mdb.data-source/broken-out-details->DataSource]].

  2. As a JDBC connection string specified by `MB_DB_CONNECTION_URI`. This is used to create
     a [[javax.sql.DataSource]]. See [[mdb.data-source/raw-connection-string->DataSource]].

  3. As a JDBC connection string (`MB_DB_CONNECTION_URI`) with username (`MB_DB_USER`) and/or password (`MB_DB_PASS`)
     passed separately. Support for this was added in Metabase 0.43.0 -- see #20122.

  This namespace exposes the vars [[db-type]] and [[data-source]] based on the aforementioned environment variables.
  Normally you should use the equivalent functions in [[metabase.db.connection]] which can be overridden rather than
  using this namespace directly."
  (:require
   [clojure.java.io :as io]
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.db.data-source :as mdb.data-source]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.malli :as mu]))

(set! *warn-on-reflection* true)

;;;; [[env->db-type]]

(defn- raw-connection-string->type [s]
  (when (seq s)
    (when-let [[_protocol subprotocol] (re-find #"^(?:jdbc:)?([^:]+):" s)]
      (condp = subprotocol
        "postgresql" :postgres
        (keyword subprotocol)))))

(mu/defn ^:private env->db-type :- [:enum :postgres :mysql :h2]
  [{:keys [mb-db-connection-uri mb-db-type]}]
  (or (some-> mb-db-connection-uri raw-connection-string->type)
      mb-db-type))

;;;; [[env->DataSource]]

(defn- get-db-file
  "Takes a filename and converts it to H2-compatible filename."
  [db-file-name]
  ;; H2 wants file path to always be absolute
  (str "file:" (.getAbsolutePath (io/file db-file-name))))

(defn- env->db-file
  [{:keys [mb-db-in-memory mb-db-file]}]
  (if mb-db-in-memory
    ;; In-memory (i.e. test) DB
    "mem:metabase"
    ;; File-based DB
    (get-db-file mb-db-file)))

(def ^:private h2-connection-properties
  ;; see https://h2database.com/html/features.html for explanation of options
  {;; DB_CLOSE_DELAY=-1 = don't close the Database until the JVM shuts down
   :DB_CLOSE_DELAY -1
   ;; we need to enable MVCC for Quartz JDBC backend to work! Quartz depends on row-level locking, which means without
   ;; MVCC we "will experience dead-locks". MVCC is the default for everyone using the MVStore engine anyway so this
   ;; only affects people still with legacy PageStore databases
   :MVCC           true
   ;; Tell H2 to defrag when Metabase is shut down -- can reduce DB size by multiple GIGABYTES -- see #6510
   :DEFRAG_ALWAYS  true
   ;; LOCK_TIMEOUT=60000 = wait up to one minute to acquire table lock instead of default of 1 second
   :LOCK_TIMEOUT   60000})

(defn- broken-out-details
  "Connection details that can be used when pretending the Metabase DB is itself a `Database` (e.g., to use the Generic
  SQL driver functions on the Metabase DB itself)."
  [db-type {:keys [mb-db-dbname mb-db-host mb-db-pass mb-db-port mb-db-user mb-db-azure-managed-identity-client-id]
            :as   env-vars}]
  (if (= db-type :h2)
    (assoc h2-connection-properties
           :db (env->db-file env-vars))
    {:host                             mb-db-host
     :port                             mb-db-port
     :db                               mb-db-dbname
     :user                             mb-db-user
     :password                         mb-db-pass
     :azure-managed-identity-client-id mb-db-azure-managed-identity-client-id}))

(defn- env->DataSource
  [db-type {:keys [mb-db-connection-uri mb-db-user mb-db-pass mb-db-azure-managed-identity-client-id], :as env-vars}]
  (if mb-db-connection-uri
    (mdb.data-source/raw-connection-string->DataSource
     mb-db-connection-uri mb-db-user mb-db-pass mb-db-azure-managed-identity-client-id)
    (mdb.data-source/broken-out-details->DataSource db-type (broken-out-details db-type env-vars))))


;;;; exports: [[db-type]], [[db-file]], and [[data-source]] created using environment variables.

(defmulti ^:private env-defaults
  {:arglists '([db-type])}
  keyword)

(defmethod env-defaults :h2
  [_db-type]
  nil)

(defmethod env-defaults :mysql
  [_db-type]
  {:mb-db-host "localhost"
   :mb-db-port 3306})

(defmethod env-defaults :postgres
  [_db-type]
  {:mb-db-host "localhost"
   :mb-db-port 5432})

(defn- env* [db-type]
  (merge-with
    (fn [env-value default-value]
      (if (nil? env-value)
        default-value
        env-value))
    {:mb-db-type                             db-type
     :mb-db-in-memory                        (config/config-bool :mb-db-in-memory)
     :mb-db-file                             (config/config-str :mb-db-file)
     :mb-db-connection-uri                   (config/config-str :mb-db-connection-uri)
     :mb-db-host                             (config/config-str :mb-db-host)
     :mb-db-port                             (config/config-int :mb-db-port)
     :mb-db-dbname                           (config/config-str :mb-db-dbname)
     :mb-db-user                             (config/config-str :mb-db-user)
     :mb-db-pass                             (config/config-str :mb-db-pass)
     :mb-db-azure-managed-identity-client-id (config/config-str :mb-db-azure-managed-identity-client-id)}
    (env-defaults db-type)))

(def env
  "Metabase Datatbase environment. Used to setup *application-db* and audit-db for enterprise users."
  (env* (config/config-kw :mb-db-type)))

(def db-type
  "Keyword type name of the application DB details specified by environment variables. Matches corresponding driver
  name e.g. `:h2`, `:mysql`, or `:postgres`."
  (env->db-type env))

(when (= db-type :h2)
  (log/warn
   (u/format-color
    :red
    ;; Unfortunately this can't be i18n'ed because the application DB hasn't been initialized yet at the time we log
    ;; this and thus the site locale is unavailable.
    (str/join
     " "
     ["WARNING: Using Metabase with an H2 application database is not recommended for production deployments."
      "For production deployments, we highly recommend using Postgres, MySQL, or MariaDB instead."
      "If you decide to continue to use H2, please be sure to back up the database file regularly."
      "For more information, see https://metabase.com/docs/latest/operations-guide/migrating-from-h2.html"]))))

(defn db-file
  "Path to our H2 DB file from env var or app config."
  []
  (env->db-file env))

;; If someone is using Postgres and specifies `ssl=true` they might need to specify `sslmode=require`. Let's let them
;; know about that to make their lives a little easier. See #8908 for more details.
(when-let [raw-connection-string (not-empty (:mb-db-connection-uri env))]
  (when (and (= db-type :postgres)
             (str/includes? raw-connection-string "ssl=true")
             (not (str/includes? raw-connection-string "sslmode=require")))
    ;; Unfortunately this can't be i18n'ed because the application DB hasn't been initialized yet at the time we log
    ;; this and thus the site locale is unavailable.
    (log/warn (str/join " " ["Warning: Postgres connection string with `ssl=true` detected."
                             "You may need to add `?sslmode=require` to your application DB connection string."
                             "If Metabase fails to launch, please add it and try again."
                             "See https://github.com/metabase/metabase/issues/8908 for more details."]))))

(def ^javax.sql.DataSource data-source
  "A [[javax.sql.DataSource]] ultimately derived from the environment variables."
  (env->DataSource db-type env))
