(ns metabase.db.data-source
  (:require [clojure.java.io :as io]
            [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [metabase.config :as config]
            [metabase.connection-pool :as connection-pool]
            [metabase.db.spec :as mdb.spec]
            [potemkin :as p]
            [pretty.core :as pretty])
  (:import java.sql.DriverManager
           java.util.Properties))

(defn- h2? [url]
  (.startsWith url "jdbc:h2:"))

(defn- h2-path [url]
  (let [[_ path] (re-matches #"jdbc:h2:file:(.*)$" url)]
    path))

(defn- h2-migration-paths [url]
  (let [base (h2-path url)]
    {:v1db   (str base ".mv.db")
     :v2db   (str base ".v2.mv.db")
     :script (str base ".v2migration.sql")}))

(defn- h2-v1-db [url]
  (let [src (.newInstance (Class/forName "org.h2_v1_4_197.jdbcx.JdbcDataSource"))]
    (.setURL src url)
    (.getConnection src)))

(defn- h2-v2-db [url]
  (let [src (.newInstance (Class/forName "org.h2.jdbcx.JdbcDataSource"))]
    (.setURL src (str url ".v2"))
    (.getConnection src)))

(defn- h2-migrate! [url]
  (let [{:keys [v2db script]} (h2-migration-paths url)]
    (try
      (log/warn "H2 migration: beginning migration")
      (jdbc/query {:connection (h2-v1-db url)} ["SCRIPT TO ?" script])
      (log/warn "H2 migration: v1 export complete, starting v2 import")
      (let [conn-v2          (h2-v2-db url)]
        (jdbc/execute! {:connection conn-v2} ["RUNSCRIPT FROM ? FROM_1X" script])
        (log/warn "H2 migration: complete")
        conn-v2)
      (catch Exception e
        (log/error "H2 migration failed: " e)
        (.delete (io/file v2db))))))

(def ^:private h2-lock (Object.))

(defn- get-h2-connection
  "H2 connections are a special case, because we transparently handle migration from H2 v1.4.x to H2 2.x.
  v2 databases have the suffix .v2.mv.db while v1 databases are just .mv.db. That suffix is added by [[h2-v2-db]].
  The lock is necessary to prevent Metabase from trying to open the blank v2 database before migration is complete."
  [url]
  (locking h2-lock
    (log/warn "Inside H2 lock")
    (let [{:keys [v1db v2db]} (h2-migration-paths url)]
      (cond
        ;; Case 1: v2 database exists - just load it.
        (.exists (io/file v2db))   (h2-v2-db url)
        ;; Case 2: v1 exists and not v2, so do the migration.
        (.exists (io/file v1db))   (h2-migrate! url)
        ;; Case 3: Nothing at all - just open a new v2 database.
        :else                      (h2-v2-db url)))))

(p/deftype+ DataSource [^String url ^Properties properties]
  pretty/PrettyPrintable
  (pretty [_]
    ;; in dev we can actually print out the details, it's useful in debugging. Everywhere else we should obscure them
    ;; because they're potentially sensitive.
    (if config/is-dev?
      (list `->DataSource url properties)
      (list `->DataSource (symbol "#_REDACTED") (symbol "#_REDACTED"))))

  javax.sql.DataSource
  (getConnection [_]
    (if (h2? url)
      ;; H2 databases are special.
      (get-h2-connection url)
      ;; Regular lookup for everything else.
      (if properties
        (DriverManager/getConnection url properties)
        (DriverManager/getConnection url))))

  ;; we don't use (.getConnection this url user password) so we don't need to implement it.
  (getConnection [_ _user _password]
    (throw (UnsupportedOperationException. "Use (.getConnection this) instead.")))

  Object
  (equals [_ another]
    (and (instance? DataSource another)
         (= (.url ^DataSource another) url)
         (= (.properties ^DataSource another) properties)))

  (toString [this]
    (pr-str (pretty/pretty this))))

(alter-meta! #'->DataSource assoc :private true)

(defn raw-connection-string->DataSource
  "Return a [[javax.sql.DataSource]] given a raw JDBC connection string."
  (^javax.sql.DataSource [s]
   (raw-connection-string->DataSource s nil nil))

  (^javax.sql.DataSource [s username password]
   {:pre [(string? s)]}
   ;; normalize the protocol in case someone is trying to trip us up. Heroku is known for this and passes stuff in
   ;; like `postgres:...` to screw with us.
   (let [s     (cond-> s
                 (str/starts-with? s "postgres:")   (str/replace-first #"^postgres:" "postgresql:")
                 (not (str/starts-with? s "jdbc:")) (str/replace-first #"^" "jdbc:"))
         ;; Even tho they're invalid we need to handle strings like `postgres://user:password@host:port` for legacy
         ;; reasons. (I think this is also how some places like Heroku ship them in order to make our lives hard) So
         ;; strip those out with the absolute minimum of parsing we can get away with and then pass them in separately
         ;; -- see #14678 and #20121
         ;;
         ;; NOTE: if password is URL-encoded this isn't going to work, since we're not URL-decoding it. I don't think
         ;; that's a problem we really have to worry about, and at any rate we have never supported it. We did
         ;; URL-decode things at one point, but that was only because [[clojure.java.jdbc]] tries to parse connection
         ;; strings itself if you let it -- see #14836. We never let it see connection strings anymore, so that
         ;; shouldn't be a problem. At any rate #20122 would probably solve most people's problems if their password
         ;; contains special characters.
         [s m] (if-let [[_ subprotocol user password more] (re-find #"^jdbc:((?:postgresql)|(?:mysql))://([^:@]+)(?::([^@:]+))?@(.+$)" s)]
                 [(str "jdbc:" subprotocol "://" more)
                  (merge {:user user}
                         (when (seq password)
                           {:password password}))]
                 [s nil])
         ;; these can't be i18n'ed because the app DB isn't set up yet
         _     (when (and (:user m) (seq username))
                 (log/error "Connection string contains a username, but MB_DB_USER is specified. MB_DB_USER will be used."))
         _     (when (and (:password m) (seq password))
                 (log/error "Connection string contains a password, but MB_DB_PASS is specified. MB_DB_PASS will be used."))
         m     (cond-> m
                 (seq username) (assoc :user username)
                 (seq password) (assoc :password password))]
     (->DataSource s (some-> (not-empty m) connection-pool/map->properties)))))

(defn broken-out-details->DataSource
  "Return a [[javax.sql.DataSource]] given a broken-out Metabase connection details."
  ^javax.sql.DataSource [db-type details]
  {:pre [(keyword? db-type) (map? details)]}
  (let [{:keys [subprotocol subname], :as spec} (mdb.spec/spec db-type (set/rename-keys details {:dbname :db}))
        _                                       (assert subprotocol)
        _                                       (assert subname)
        url                                     (format "jdbc:%s:%s" subprotocol subname)
        properties                              (some-> (not-empty (dissoc spec :classname :subprotocol :subname))
                                                        connection-pool/map->properties)]
    (->DataSource url properties)))
