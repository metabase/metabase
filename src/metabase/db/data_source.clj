(ns metabase.db.data-source
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.connection-pool :as connection-pool]
   [metabase.db.spec :as mdb.spec]
   [metabase.db.update-h2 :as update-h2]
   [metabase.util.log :as log]
   [potemkin :as p]
   [pretty.core :as pretty])
  (:import
   (java.sql DriverManager)
   (java.util Properties)))

(set! *warn-on-reflection* true)

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
    (update-h2/update-if-needed url)
    (if properties
      (DriverManager/getConnection url properties)
      (DriverManager/getConnection url)))

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
