(ns metabase.db.env
  "Logic related to fetching and working with the connection details for the application database. These are provided by
  environment variables -- either as a single JDBC connection URL string (`MB_DB_CONNECTION_URI`) or as broken-out
  enviornment variables e.g. `MB_DB_TYPE`, `MB_DB_HOST`, etc. `MB_DB_CONNECTION_URI` is used preferentially if both
  are specified.

  There are two ways we specify JDBC connection information in Metabase code:

  1. As a 'connection details' map that is meant to be UI-friendly; this is the actual map we save when creating a
     `Database` object and the one you can go edit from the admin page. For application DB code, this representation is
     only used in this namespace.

  2. As a `clojure.java.jdbc` connection spec map. This is used internally by lower-level JDBC stuff. We have to
     convert the connections details maps to JDBC specs at some point; Metabase driver code normally handles this.

  There are functions for fetching both types of connection details below.

  Normally you should use the equivalent functions in `metabase.db.connection` which can be overridden rather than
  using this namespace directly."
  (:require [clojure.java.io :as io]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.db.data-source :as mdb.data-source]
            [metabase.util :as u]))

(defn- get-db-file
  "Takes a filename and converts it to H2-compatible filename."
  [db-file-name]
  ;; we need to enable MVCC for Quartz JDBC backend to work! Quartz depends on row-level locking, which means without
  ;; MVCC we "will experience dead-locks". MVCC is the default for everyone using the MVStore engine anyway so this
  ;; only affects people still with legacy PageStore databases
  ;;
  ;; Tell H2 to defrag when Metabase is shut down -- can reduce DB size by multiple GIGABYTES -- see #6510
  (let [options ";DB_CLOSE_DELAY=-1;MVCC=TRUE;DEFRAG_ALWAYS=TRUE"]
    ;; H2 wants file path to always be absolute
    (str "file:"
         (.getAbsolutePath (io/file db-file-name))
         options)))

(def db-file
  "Path to our H2 DB file from env var or app config."
  ;; see https://h2database.com/html/features.html for explanation of options
  (if (config/config-bool :mb-db-in-memory)
    ;; In-memory (i.e. test) DB
    ;; DB_CLOSE_DELAY=-1 = don't close the Database until the JVM shuts down
    "mem:metabase;DB_CLOSE_DELAY=-1"
    ;; File-based DB
    (let [db-file-name (config/config-str :mb-db-file)]
      (get-db-file db-file-name))))

(def ^:private raw-connection-string
  (config/config-str :mb-db-connection-uri))

(defn- raw-connection-string->type [s]
  (when (seq s)
    (when-let [[_protocol subprotocol] (re-find #"^(?:jdbc:)?([^:]+):" s)]
      (condp = subprotocol
        "postgresql" :postgres
        (keyword subprotocol)))))

(def ^:private raw-connection-string-type
  (raw-connection-string->type raw-connection-string))

;; If someone is using Postgres and specifies `ssl=true` they might need to specify `sslmode=require`. Let's let them
;; know about that to make their lives a little easier. See #8908 for more details.
(when (and (= raw-connection-string-type :postgres)
           (str/includes? raw-connection-string "ssl=true")
           (not (str/includes? raw-connection-string "sslmode=require")))
  ;; Unfortunately this can't be i18n'ed because the application DB hasn't been initialized yet at the time we log this
  ;; and thus the site locale is unavailable.
  (log/warn (str/join " " ["Warning: Postgres connection string with `ssl=true` detected."
                           "You may need to add `?sslmode=require` to your application DB connection string."
                           "If Metabase fails to launch, please add it and try again."
                           "See https://github.com/metabase/metabase/issues/8908 for more details."])))

(def db-type
  "Keyword type name of the application DB details specified by environment variables. Matches corresponding driver
  name e.g. `:h2`, `:mysql`, or `:postgres`."
  (or raw-connection-string-type
      (config/config-kw :mb-db-type)))

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

(def ^:private broken-out-details
  "Connection details that can be used when pretending the Metabase DB is itself a `Database` (e.g., to use the Generic
  SQL driver functions on the Metabase DB itself)."
  (if (= db-type :h2)
    {:db db-file}
    {:host     (config/config-str :mb-db-host)
     :port     (config/config-int :mb-db-port)
     :db       (config/config-str :mb-db-dbname)
     :user     (config/config-str :mb-db-user)
     :password (config/config-str :mb-db-pass)}))

(def ^javax.sql.DataSource data-source
  "A [[javax.sql.DataSource]] ultimately derived from the environment variables."
  (if raw-connection-string
    (mdb.data-source/raw-connection-string->DataSource raw-connection-string)
    (mdb.data-source/broken-out-details->DataSource db-type broken-out-details)))
