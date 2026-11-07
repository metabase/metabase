(ns metabase.driver.documentdb.connection
  "Connection management for open-source DocumentDB."
  (:refer-clojure :exclude [every? not-empty])
  (:require
   [clojure.string :as str]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.connection :as driver.conn]
   [metabase.driver.settings :as driver.settings]
   [metabase.driver.sql-jdbc.connection.ssh-tunnel :as ssh]
   [metabase.driver.util :as driver.u]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [every? not-empty]])
  (:import
   (com.mongodb ConnectionString MongoClientSettings MongoClientSettings$Builder MongoCredential)
   (com.mongodb.client MongoClient MongoClients)
   (com.mongodb.connection SslSettings$Builder)
   (com.mongodb.spi.dns InetAddressResolver)
   (java.net InetAddress)))

(set! *warn-on-reflection* true)

(def ^:dynamic *client*
  "The DocumentDB client for the current operation, if one has already been opened."
  nil)

(defn details->connection-string
  "Returns the MongoDB-wire connection string represented by `details`."
  [{:keys [use-conn-uri conn-uri host port ssl additional-options]}]
  (if use-conn-uri
    (if (str/blank? conn-uri)
      (throw (ex-info "No DocumentDB connection string was specified." {}))
      conn-uri)
    (str "mongodb://" (or host "localhost") ":" (or port 10260) "/"
         "?connectTimeoutMS=" (driver.settings/db-connection-timeout-ms)
         "&serverSelectionTimeoutMS=" (driver.settings/db-connection-timeout-ms)
         "&tls=" (if (false? ssl) "false" "true")
         (when (seq additional-options) (str "&" additional-options)))))

(defn- address-resolver
  [tunnel-enabled]
  (reify InetAddressResolver
    (lookupByName [_ host]
      (let [addresses (vec (InetAddress/getAllByName ^String host))]
        (when-not (and tunnel-enabled
                       (every? #(.isLoopbackAddress ^InetAddress %) addresses))
          (driver.u/validate-resolved-addresses! addresses))
        addresses))))

(defn- apply-ssl-settings!
  [^MongoClientSettings$Builder builder {:keys [ssl-cert tls-allow-invalid-hostnames]}]
  (when (or tls-allow-invalid-hostnames (not (str/blank? ssl-cert)))
    (.applyToSslSettings
     builder
     (reify com.mongodb.Block
       (apply [_ ssl-builder]
         (when-not (str/blank? ssl-cert)
           (.context ^SslSettings$Builder ssl-builder (driver.u/ssl-context {:trust-cert ssl-cert})))
         (.invalidHostNameAllowed ^SslSettings$Builder ssl-builder (boolean tls-allow-invalid-hostnames))))))
  builder)

(defn details->client-settings
  "Returns Mongo Java driver settings for DocumentDB `details`."
  ^MongoClientSettings
  [{:keys [use-conn-uri user pass authdb ssl tunnel-enabled] :as details}]
  (let [builder (MongoClientSettings/builder)]
    (.applicationName builder driver-api/mb-app-id-string)
    (.applyConnectionString builder (ConnectionString. (details->connection-string details)))
    (.inetAddressResolver builder (address-resolver tunnel-enabled))
    (when (and (not use-conn-uri) (seq user))
      (when (nil? pass)
        (throw (ex-info "A password is required when a DocumentDB username is specified." {})))
      (.credential builder
                   (MongoCredential/createScramSha256Credential
                    user (or (not-empty authdb) "admin") (char-array pass))))
    (when-not (false? ssl)
      (apply-ssl-settings! builder details))
    (.build builder)))

(defn- normalized-details
  [database]
  (let [details (cond
                  (integer? database)
                  (driver-api/with-metadata-provider database
                    (driver.conn/effective-details (driver-api/database (driver-api/metadata-provider))))

                  (:details database)
                  (driver.conn/effective-details database)

                  (map? database)
                  database

                  :else
                  (throw (ex-info "Unable to get DocumentDB database details." {:database database})))
        cleaned-details (driver-api/clean-secret-properties-from-details details :documentdb)]
    cleaned-details))

(defn database-name
  "Returns the database name from a database value or connection details."
  ^String [database]
  (let [{:keys [dbname conn-uri] :as details} (normalized-details database)
        db-name (or (not-empty dbname)
                    (some-> conn-uri ConnectionString. .getDatabase))]
    (when (str/blank? db-name)
      (throw (ex-info "No database name was specified for DocumentDB." {:details (dissoc details :pass :conn-uri)})))
    db-name))

(defn do-with-client
  "Calls `f` with a DocumentDB client for `database`, reusing the current client when possible."
  [f database]
  (if *client*
    (f *client*)
    (let [details (normalized-details database)]
      (ssh/with-ssh-tunnel [tunneled-details details]
        (with-open [^MongoClient client (MongoClients/create (details->client-settings tunneled-details))]
          (driver.conn/track-connection-acquisition! details)
          (log/debug "Opened DocumentDB client.")
          (binding [*client* client]
            (f client)))))))

(defmacro with-client
  "Evaluates `body` with `client-symbol` bound to a DocumentDB client."
  {:clj-kondo/ignore  [:unresolved-symbol :type-mismatch]
   :clj-kondo/lint-as 'clojure.core/let}
  [[client-symbol database] & body]
  `(do-with-client (fn [~client-symbol] ~@body) ~database))

(defmacro with-database
  "Evaluates `body` with `database-symbol` bound to the selected DocumentDB database."
  {:clj-kondo/ignore  [:unresolved-symbol :type-mismatch]
   :clj-kondo/lint-as 'clojure.core/let}
  [[database-symbol database] & body]
  `(with-client [client# ~database]
     (let [~database-symbol (.getDatabase ^MongoClient client# (database-name ~database))]
       ~@body)))

(defn do-with-database
  "Calls `f` with the selected DocumentDB database."
  [f database]
  (do-with-client (fn [^MongoClient client]
                    (f (.getDatabase client (database-name database))))
                  database))
