(ns metabase.driver.mongo.connection
  "This namespace contains code responsible for connecting to mongo deployment."
  (:require
   [clojure.string :as str]
   [metabase.config :as config]
   [metabase.driver.mongo.database :as mongo.db]
   [metabase.driver.mongo.util :as mongo.util]
   [metabase.driver.util :as driver.u]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [metabase.util.ssh :as ssh])
  (:import
   (com.mongodb ConnectionString MongoClientSettings MongoClientSettings$Builder MongoCredential)
   (com.mongodb.connection SslSettings$Builder)))

(set! *warn-on-reflection* true)

(def ^:dynamic *mongo-client*
  "Stores an instance of `MongoClient` bound by [[with-mongo-client]]."
  nil)

(defn db-details->connection-string
  "Generate connection string from database details."
  [{:keys [use-conn-uri conn-uri host port additional-options use-srv ssl] :as _db-details}]
  ;; Connection string docs:
  ;; http://mongodb.github.io/mongo-java-driver/4.11/apidocs/mongodb-driver-core/com/mongodb/ConnectionString.html
  (if use-conn-uri
    conn-uri
    (str
     (if use-srv "mongodb+srv" "mongodb")
     "://"
     ;; credentials are added into MongoClientSettings in [[db-details->mongo-client-settings]]
     host
     (when (and (not use-srv) (some? port)) (str ":" port))
     "/"
     "?connectTimeoutMS=" (driver.u/db-connection-timeout-ms)
     "&serverSelectionTimeoutMS=" (driver.u/db-connection-timeout-ms)
     (when ssl "&ssl=true")
     (when (seq additional-options) (str "&" additional-options)))))

(defn- maybe-add-ssl-context-to-builder!
  "Add SSL context to `builder` using `_db-details`. Mutates and returns `builder`."
  [^MongoClientSettings$Builder builder
   {:keys [ssl-cert ssl-use-client-auth client-ssl-cert client-ssl-key] :as _db-details}]
  (let [server-cert? (not (str/blank? ssl-cert))
        client-cert? (and ssl-use-client-auth
                          (not-any? str/blank? [client-ssl-cert client-ssl-key]))]
    (if (or client-cert? server-cert?)
      (let [ssl-params (cond-> {}
                         server-cert? (assoc :trust-cert ssl-cert)
                         client-cert? (assoc :private-key client-ssl-key
                                             :own-cert client-ssl-cert))
            ssl-context (driver.u/ssl-context ssl-params)]
        (.applyToSslSettings builder
                             (reify com.mongodb.Block
                               (apply [_this builder]
                                 (.context ^SslSettings$Builder builder ssl-context)))))
      builder)))

(defn db-details->mongo-client-settings
  "Generate `MongoClientSettings` from `db-details`. `ConnectionString` is generated and applied to
   `MongoClientSettings$Builder` first. Then credentials are set and ssl context is updated in the `builder` object.
   Afterwards, `MongoClientSettings` are built using `.build`."
  ^MongoClientSettings
  [{:keys [authdb user pass use-conn-uri ssl] :as db-details}]
  (let [connection-string (-> db-details
                              db-details->connection-string
                              ConnectionString.)
        builder (com.mongodb.MongoClientSettings/builder)]
    (.applicationName builder config/mb-app-id-string)
    (.applyConnectionString builder connection-string)
    (when-not use-conn-uri
      ;; NOTE: authSource connection parameter is the second argument of `createCredential`. We currently set it only
      ;;       when some credentials are used (ie. user is not empty), previously we did that in all cases. I've
      ;;       manually verified that's not necessary.
      (when (seq user)
        (.credential builder
                     (MongoCredential/createCredential user
                                                       (or (not-empty authdb) "admin")
                                                       (char-array pass))))
      (when ssl
        (maybe-add-ssl-context-to-builder! builder db-details)))
    (.build builder)))

(defn do-with-mongo-client
  "Implementation of [[with-mongo-client]]."
  [thunk database]
  (let [db-details (mongo.db/details-normalized database)]
    (ssh/with-ssh-tunnel [details-with-tunnel db-details]
      (let [client (mongo.util/mongo-client (db-details->mongo-client-settings details-with-tunnel))]
        (log/debug (u/format-color 'cyan "Opened new MongoClient."))
        (try
          (binding [*mongo-client* client]
            (thunk client))
          (finally
            (mongo.util/close client)
            (log/debug (u/format-color 'cyan "Closed MongoClient."))))))))

(defmacro with-mongo-client
  "Create instance of `MongoClient` for `database` and bind it to [[*mongo-client*]]. `database` can be anything
   digestable by [[mongo.db/details-normalized]]. Call of this macro in its body will reuse existing
   [[*mongo-client*]]."
  {:clj-kondo/lint-as 'clojure.core/let
   :clj-kondo/ignore [:unresolved-symbol :type-mismatch]}
  [[client-sym database] & body]
  `(let [f# (fn [~client-sym] ~@body)]
     (if (nil? *mongo-client*)
       (do-with-mongo-client f# ~database)
       (f# *mongo-client*))))

(defn do-with-mongo-database
  "Implementation of [[with-mongo-database]]."
  [thunk database]
  (let [db-name (-> database mongo.db/details-normalized mongo.db/details->db-name)]
    (with-mongo-client [c database]
      (thunk (mongo.util/database c db-name)))))

(defmacro with-mongo-database
  "Utility for accessing database directly instead of a client. For more info see [[with-mongo-client]]."
  {:clj-kondo/lint-as 'clojure.core/let
   :clj-kondo/ignore [:unresolved-symbol :type-mismatch]}
  [[db-sym database] & body]
  `(let [f# (fn [~db-sym] ~@body)]
     (do-with-mongo-database f# ~database)))
