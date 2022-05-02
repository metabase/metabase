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

(def sample-url "jdbc:h2:file:/Users/braden/mb/metabase/metabase.db")

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

(comment
  (h2? sample-url)
  (h2-path sample-url)
  (h2-migration-paths sample-url)
  (.exists (io/file (:v1db (h2-migration-paths sample-url))))
  )

(defn- h2-v1-db [url]
  {:dbtype "h2"
   :dbname (h2-path url)
   :classname "org.h2_v1_4_197.Driver"})

(defn- h2-v2-db [url]
  {:dbtype "h2"
   :dbname (str (h2-path url) ".v2")
   :classname "org.h2.Driver"})

(def data-source-loading (atom false))

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
    (if @data-source-loading
      (do (log/warn "DSL true")
          (if properties
            (DriverManager/getConnection url properties)
            (DriverManager/getConnection url)))
      (do (reset! data-source-loading true)
          (let [conn (delay (if properties
                              (DriverManager/getConnection url properties)
                              (DriverManager/getConnection url)))]
            (if (h2? url)
              (let [{:keys [v1db v2db script]} (h2-migration-paths url)]
                (cond
                  ;; Case 1: v2 database exists - just load it.
                  (.exists (io/file v2db))   (do
                                               (log/warn "H2 v2 database exists - using it")
                                               @conn)
                  ;; Case 2: Migration script exists - open the database with v2 and import the script.
                  (.exists (io/file script)) (let [db (h2-v2-db url)]
                                               (log/warn "H2 v2 database not found, but migration script exists - importing")
                                               (jdbc/execute! db "RUNSCRIPT FROM ? FROM_1X" script)
                                               @conn)
                  ;; Case 3: No upgrade artifacts exist, so load v1 and run the export, then die.
                  (.exists (io/file v1db))   (let [db (h2-v1-db url)]
                                               (log/warn "H2 v1 database only - exporting")
                                               (jdbc/execute! db "SCRIPT TO ?" script)
                                               (log/fatal "H2 migration in progress! Restart Metabase to complete the import into H2 v2"))

                  ;; Case 4: Nothing at all! Just open a new v2 database.
                  :else                      (do
                                               (log/warn "No existing H2 database, just creating a new v2")
                                               @conn)))
              @conn)))))

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
