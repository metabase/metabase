(ns metabase.db.data-source
  "A namespace to define a record holding a connection to the application database. The [[DataSource]] type
  implements [[javax.sql.DataSource]] so you can call [[getConnection]] on it."
  (:require
   [clojure.set :as set]
   [clojure.string :as str]
   [metabase.auth-provider :as auth-provider]
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

(defn ^:dynamic *current-millis*
  "Returns the current time millis, but can be overridden for testing."
  []
  (System/currentTimeMillis))

(defn- renew-azure-managed-identity-password
  [client-id]
  (let [{:keys [access_token expires_in]}
        (auth-provider/fetch-auth :azure-managed-identity nil {:azure-managed-identity-client-id client-id})]
    {:password access_token
     :expiry (+ (*current-millis*) (* (- (parse-long expires_in)
                                         auth-provider/azure-auth-token-renew-slack-seconds)
                                      1000))}))

(defn- ensure-azure-managed-identity-password
  "Make sure there is a \"password\" property in `properties` and returns a [[Properties]]
  object without the azure managed identity properties.
  Assumes that the \"azure-managed-identity-client-id\" property is only set if it
  should be used to manage the password generation."
  [^Properties properties]
  (if-let [client-id (.getProperty properties "azure-managed-identity-client-id")]
    (let [expiry (.get properties "password-expiry-timestamp")]
      ;; check if we need to acquire the lock
      (when (or (nil? (.getProperty properties "password"))
                (nil? expiry)           ; should not happen, as expiry should be set when the password is set
                (<= expiry (*current-millis*)))
        (locking properties
          ;; check if a new password has to be generated
          (let [expiry (.get properties "password-expiry-timestamp")]
            (when (or (nil? (.getProperty properties "password"))
                      (nil? expiry)
                      (<= expiry (*current-millis*)))
              (let [{:keys [password expiry]} (renew-azure-managed-identity-password client-id)]
                (doto properties
                  (.setProperty "password" password)
                  (.put "password-expiry-timestamp" expiry)))))))
      (doto (Properties.)
        (.putAll properties)
        (.remove "azure-managed-identity-client-id")
        (.remove "password-expiry-timestamp")))
    properties))

;; NOTE: Never instantiate a DataSource directly
;; Use one of our helper functions below to ensure [[update-h2/update-if-needed!]] is called
;; You can use [[raw-connection-string->DataSource]] or [[broken-out-details->DataSource]]
(p/deftype+ ^:private DataSource [^String url ^Properties properties]
  pretty/PrettyPrintable
  (pretty [_]
    ;; in dev we can actually print out the details, it's useful in debugging. Everywhere else we should obscure them
    ;; because they're potentially sensitive.
    (if config/is-dev?
      (list `->DataSource url properties)
      (list `->DataSource (symbol "#_REDACTED") (symbol "#_REDACTED"))))

  javax.sql.DataSource
  (getConnection [_]
    (doto (if properties
            (DriverManager/getConnection url (ensure-azure-managed-identity-password properties))
            (DriverManager/getConnection url))
      ;; MySQL/MariaDB default to REPEATABLE_READ which ends up making everything SLOW because it locks all the time.
      ;; Postgres defaults to READ_COMMITTED. Explicitly set transaction isolation for new connections so we can make
      ;; sure we're using READ_COMMITTED. See https://metaboat.slack.com/archives/C04DN5VRQM6/p1718912820432359 for more
      ;; info.
      (.setTransactionIsolation java.sql.Connection/TRANSACTION_READ_COMMITTED)))

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
   (raw-connection-string->DataSource s nil nil nil))

  (^javax.sql.DataSource [s username password azure-managed-identity-client-id]
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
         _     (when (and (seq password) (seq azure-managed-identity-client-id))
                 (log/error "Both password and MB_DB_AZURE_MANAGED_IDENTITY_CLIENT_ID are specified. The password will be used."))
         m     (cond-> m
                 (seq username)                               (assoc :user username)
                 (seq password)                               (assoc :password password)
                 (and (empty? password)
                      (seq azure-managed-identity-client-id)) (assoc :azure-managed-identity-client-id
                                                                     azure-managed-identity-client-id))]
     (update-h2/update-if-needed! s)
     (->DataSource s (some-> (not-empty m) connection-pool/map->properties)))))

(defn- remove-shadowed-azure-managed-identity-client-id
  "A normal password takes precedence over Azure managed identity and we don't want
  an empty string to be taken for a valid client ID."
  [spec]
  (cond-> spec
    (or (empty? (:azure-managed-identity-client-id spec))
        (seq (:password spec)))
    (dissoc :azure-managed-identity-client-id)))

(defn broken-out-details->DataSource
  "Return a [[javax.sql.DataSource]] given a broken-out Metabase connection details."
  ^javax.sql.DataSource [db-type details]
  {:pre [(keyword? db-type) (map? details)]}
  (let [{:keys [subprotocol subname], :as spec} (mdb.spec/spec db-type (set/rename-keys details {:dbname :db}))
        _                                       (assert subprotocol)
        _                                       (assert subname)
        url                                     (format "jdbc:%s:%s" subprotocol subname)
        properties                              (some-> (not-empty (dissoc spec :classname :subprotocol :subname))
                                                        remove-shadowed-azure-managed-identity-client-id
                                                        connection-pool/map->properties)]

    (update-h2/update-if-needed! url)
    (->DataSource url properties)))
