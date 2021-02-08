(ns metabase.db.env
  "Logic related to fetching and working with the connection details for the application database. These are provided by
  environment variables -- either as a single JDBC connection URL string (`MB_DB_CONNECTION_URI`) or as broken-out
  enviornment variables e.g. `MB_DB_TYPE`, `MB_DB_HOST`, etc. `MB_DB_CONNECTION_URI` is used preferentially if both
  are specified.

  The `MB_DB_CONNECTION_URI` is unparsed and passed to the jdbc driver with once exception: if it includes the
  password like `username:password@host:port`. In this case we parse this and log. This functionality will be removed
  at some point so.

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
            [clojure.walk :as walk]
            [metabase.config :as config]
            [metabase.db.spec :as db.spec]
            [metabase.util :as u]
            [metabase.util.i18n :refer [trs]]
            [ring.util.codec :as codec])
  (:import java.net.URI))

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
  (delay
   (if (config/config-bool :mb-db-in-memory)
     ;; In-memory (i.e. test) DB
     ;; DB_CLOSE_DELAY=-1 = don't close the Database until the JVM shuts down
     "mem:metabase;DB_CLOSE_DELAY=-1"
     ;; File-based DB
     (let [db-file-name (config/config-str :mb-db-file)]
       (get-db-file db-file-name)))))

(def ^:private jdbc-connection-regex
  "Regex to be used only when `:mb-db-connection-uri` includes a password like `username:password@host:port`."
  #"^(jdbc:)?([^:/@]+)://(?:([^:/@]+)(?::([^:@]+))?@)?([^:@]+)(?::(\d+))?/([^/?]+)(?:\?(.*))?$")

(declare connection-details->jdbc-spec)

(defn- parse-connection-string
  "Parse a DB connection URI like
  `postgres://cam@localhost.com:5432/cams_cool_db?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory` and
  return a broken-out map. This should not be used unless the connection string uses the old style where the password
  is included in the like `username:password@host:port`."
  [uri]
  (when-let [[_ _ protocol user pass host port db query] (re-matches jdbc-connection-regex uri)]
    (connection-details->jdbc-spec
     (keyword protocol)
     (u/prog1 (merge {:type (case (keyword protocol)
                              :postgres   :postgres
                              :postgresql :postgres
                              :mysql      :mysql
                              :h2         :h2)}

                     (case (keyword protocol)
                       :h2 {:db db}
                       {:user     user
                        :password pass
                        :host     host
                        :port     port
                        :dbname   db})
                     (some-> query
                             codec/form-decode
                             walk/keywordize-keys))
       ;; If someone is using Postgres and specifies `ssl=true` they might need to specify `sslmode=require`. Let's let
       ;; them know about that to make their lives a little easier. See https://github.com/metabase/metabase/issues/8908
       ;; for more details.
       (when (and (= (:type <>) :postgres)
                  (= (:ssl <>) "true")
                  (not (:sslmode <>)))
         (log/warn (trs "Warning: Postgres connection string with `ssl=true` detected.")
                   (trs "You may need to add `?sslmode=require` to your application DB connection string.")
                   (trs "If Metabase fails to launch, please add it and try again.")
                   (trs "See https://github.com/metabase/metabase/issues/8908 for more details.")))))))

(defn- ensure-jdbc-protocol
  "Prepends \"jdbc:\" to the connection-uri string if needed."
  [connection-uri]
  (when connection-uri
    (if (re-find #"^jdbc:" connection-uri)
      connection-uri
      (str "jdbc:" connection-uri))))

(defn old-password-style?
  "Parse a jdbc connection uri to check for older style password passing like:
  mysql://foo:password@172.17.0.2:3306/metabase"
  [connection-uri]
  (when connection-uri
    (let [uri (URI. connection-uri)]
      ;; this is how clojure.java.jdbc does it
      (= 2 (count (str/split (.getUserInfo uri) #":"))))))

(defn- connection-from-jdbc-string
  "If connection string uses the form `username:password@host:port`, use our custom parsing to return a jdbc spec and
  warn about this deprecated behavior. If not, return the jdbc string as is since our parsing does not offer all of
  the options of using a raw jdbc string."
  [conn-string]
  (when conn-string
    (or (when-not (old-password-style? conn-string)
          ;; prefer not parsing as we don't handle all features of connection strings
          (ensure-jdbc-protocol conn-string))
        (do (log/warn (trs "Warning: using password provided inline is deprecated.")
                      (trs "Change to using the password as a query parameter: `?password=your-password`."))
            (parse-connection-string conn-string)))))

(def ^:private connection-string-or-spec
  "Uses `:mb-db-connection-uri` and is either:
  - the jdbc connection string if it does not use an inline password, or
  - a db-spec parsed by this code if it does use an inline password, or
  - nil when this value is not set."
  (delay (when-let [conn-uri (config/config-str :mb-db-connection-uri)]
           (connection-from-jdbc-string conn-uri))))

(defn- connection-string-or-spec->db-type [x]
  (cond
    (map? x) (:type x)

    (string? x)
    (let [[_ subprotocol] (re-find #"^(?:jdbc:)?([^:]+):" x)]
      (try
        (case (keyword subprotocol)
          :postgres   :postgres
          :postgresql :postgres
          :mysql      :mysql
          :h2         :h2)
        (catch java.lang.IllegalArgumentException e
          (throw (ex-info (str (trs "Unsupported application database type: {0} is not currently supported."
                                    (pr-str subprotocol))
                               " "
                               (trs "Check the value of MB_DB_CONNECTION_URI."))
                          {:subprotocol subprotocol})))))))

(def ^:private connection-string-db-type
  (delay (connection-string-or-spec->db-type @connection-string-or-spec)))

(def db-type
  "Keyword type name of the application DB details specified by environment variables. Matches corresponding driver
  name e.g. `:h2`, `:mysql`, or `:postgres`."
  (delay
    (or @connection-string-db-type
        (config/config-kw :mb-db-type))))

(def db-connection-details
  "Connection details that can be used when pretending the Metabase DB is itself a `Database` (e.g., to use the Generic
  SQL driver functions on the Metabase DB itself)."
  (delay
    (when (= @db-type :h2)
      (log/warn
       (u/format-color 'red
           (str
            (trs "WARNING: Using Metabase with an H2 application database is not recommended for production deployments.")
            " "
            (trs "For production deployments, we highly recommend using Postgres, MySQL, or MariaDB instead.")
            " "
            (trs "If you decide to continue to use H2, please be sure to back up the database file regularly.")
            " "
            (trs "For more information, see")
            " https://metabase.com/docs/latest/operations-guide/migrating-from-h2.html"))))
    (case @db-type
      :h2
      {:db @db-file}

      {:host     (config/config-str :mb-db-host)
       :port     (config/config-int :mb-db-port)
       :dbname   (config/config-str :mb-db-dbname)
       :user     (config/config-str :mb-db-user)
       :password (config/config-str :mb-db-pass)})))

(defn- connection-details->jdbc-spec
  "Convert a connection details map to a `clojure.java.jdbc` connection spec map."
  [driver details]
  ;; TODO: it's probably a good idea to put some more validation here and be really strict about what's in
  ;; `db-details`.
  (case driver
    :h2       (db.spec/h2       details)
    :mysql    (db.spec/mysql    (assoc details :db (:dbname details)))
    :postgres (db.spec/postgres (assoc details :db (:dbname details)))))

(def jdbc-spec
  "`clojure.java.jdbc` spec map for the application DB, using the details map derived from environment variables."
  (delay
    (or @connection-string-or-spec
        (connection-details->jdbc-spec @db-type @db-connection-details))))
