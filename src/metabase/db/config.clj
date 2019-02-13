(ns metabase.db.config
  "Logic for getting connection information about the application DB from configuration sources such as env vars."
  (:require [clojure.java.io :as io]
            [clojure.tools.logging :as log]
            [metabase
             [config :as config]
             [util :as u]]
            [metabase.db.spec :as db.spec]
            [metabase.util.i18n :refer [trs]]
            [ring.util.codec :as codec]))

(def db-file
  "Path to our H2 DB file from env var or app config."
  ;; see http://h2database.com/html/features.html for explanation of options
  (delay
   (if (config/config-bool :mb-db-in-memory)
     ;; In-memory (i.e. test) DB
     "mem:metabase;DB_CLOSE_DELAY=-1"
     ;; File-based DB
     (let [db-file-name (config/config-str :mb-db-file)
           ;; we need to enable MVCC for Quartz JDBC backend to work! Quartz depends on row-level locking, which
           ;; means without MVCC we "will experience dead-locks". MVCC is the default for everyone using the
           ;; MVStore engine anyway so this only affects people still with legacy PageStore databases
           ;;
           ;; Tell H2 to defrag when Metabase is shut down -- can reduce DB size by multiple GIGABYTES -- see #6510
           options      ";DB_CLOSE_DELAY=-1;MVCC=TRUE;DEFRAG_ALWAYS=TRUE"]
       ;; H2 wants file path to always be absolute
       (str "file:"
            (.getAbsolutePath (io/file db-file-name))
             options)))))

(def ^:private jdbc-connection-regex
  #"^(jdbc:)?([^:/@]+)://(?:([^:/@]+)(?::([^:@]+))?@)?([^:@]+)(?::(\d+))?/([^/?]+)(?:\?(.*))?$")

(defn- parse-connection-string
  "Parse a DB connection URI like
  `postgres://cam@localhost.com:5432/cams_cool_db?ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory` and
  return a broken-out map."
  [uri]
  (when-let [[_ _ protocol user pass host port db query] (re-matches jdbc-connection-regex uri)]
    (u/prog1 (merge {:type     (case (keyword protocol)
                                 :postgres   :postgres
                                 :postgresql :postgres
                                 :mysql      :mysql)
                     :user     user
                     :password pass
                     :host     host
                     :port     port
                     :dbname   db}
                    (some-> query
                            codec/form-decode
                            walk/keywordize-keys))
      ;; If someone is using Postgres and specifies `ssl=true` they might need to specify `sslmode=require`. Let's let
      ;; them know about that to make their lives a little easier. See https://github.com/metabase/metabase/issues/8908
      ;; for more details.
      (when (and (= (:type <>) :postgres)
                 (= (:ssl <>) "true")
                 (not (:sslmode <>)))
        (log/warn
         (trs "Warning: Postgres connection string with `ssl=true` detected.")
         (trs "You may need to add `?sslmode=require` to your application DB connection string.")
         (trs "If Metabase fails to launch, please add it and try again.")
         (trs "See https://github.com/metabase/metabase/issues/8908 for more details."))))))

(def ^:private connection-string-details
  (delay (when-let [uri (config/config-str :mb-db-connection-uri)]
           (parse-connection-string uri))))

(defn db-type
  "The type of backing DB used to run Metabase. `:h2`, `:mysql`, or `:postgres`."
  ^clojure.lang.Keyword []
  (or (:type @connection-string-details)
      (config/config-kw :mb-db-type)))

(def ^:deprecated db-connection-details
  "Connection details that can be used when pretending the Metabase DB is itself a `Database` (e.g., to use the Generic
  SQL driver functions on the Metabase DB itself).

  DEPRECATED -- We should use `jdbc-details` instead."
  (delay
   (when (= (db-type) :h2)
     (log/warn
      (trs "WARNING: Using Metabase with an H2 application database is not recomended for production deployments.")
      (trs "For production deployments, we highly recommend using Postgres, MySQL, or MariaDB instead.")
      (trs "If you decide to continue to use H2, please be sure to back up the database file regularly.")
      (trs "See https://metabase.com/docs/latest/operations-guide/start.html#migrating-from-using-the-h2-database-to-mysql-or-postgres for more information.")))
   (or @connection-string-details
       (case (db-type)
         :h2       {:type     :h2 ; TODO - we probably don't need to specifc `:type` here since we can just call (db-type)
                    :db       @db-file}
         :mysql    {:type     :mysql
                    :host     (config/config-str :mb-db-host)
                    :port     (config/config-int :mb-db-port)
                    :dbname   (config/config-str :mb-db-dbname)
                    :user     (config/config-str :mb-db-user)
                    :password (config/config-str :mb-db-pass)}
         :postgres {:type     :postgres
                    :host     (config/config-str :mb-db-host)
                    :port     (config/config-int :mb-db-port)
                    :dbname   (config/config-str :mb-db-dbname)
                    :user     (config/config-str :mb-db-user)
                    :password (config/config-str :mb-db-pass)}))))

(defn jdbc-details
  "Takes our own MB details map and formats them properly for connection details for JDBC."
  ([]
   (jdbc-details @db-connection-details))
  ([db-details]
   {:pre [(map? db-details)]}
   ;; TODO: it's probably a good idea to put some more validation here and be really strict about what's in `db-details`
   (case (:type db-details)
     :h2       (db.spec/h2       db-details)
     :mysql    (db.spec/mysql    (assoc db-details :db (:dbname db-details)))
     :postgres (db.spec/postgres (assoc db-details :db (:dbname db-details))))))
