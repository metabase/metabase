(ns metabase.driver.mongo.java-driver-wrapper
  "This namespace is a wrapper of `mongo-java-driver`, adjusted for Metabase purposes, borrowing a lot from
   the Monger library."
  (:require
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [java-time.api :as t]
   [metabase.config :as config]
   [metabase.driver.util :as driver.u]
   [metabase.lib.metadata.protocols :as lib.metadata.protocols]
   [metabase.models.secret :as secret]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util :as u]
   [metabase.util.i18n :refer [trs tru]]
   [metabase.util.log :as log]
   [metabase.util.ssh :as ssh])
  (:import
   (com.mongodb MongoClientSettings MongoClientSettings$Builder)
   (com.mongodb.client FindIterable MongoClient MongoClients MongoCollection MongoDatabase)
   (com.mongodb.connection SslSettings$Builder)))

(set! *warn-on-reflection* true)

(def ^:dynamic *mongo-client*
  "Stores an instance of MongoClient bound by [[with-mongo-client]]."
  nil)

;;;; Conversions

(defprotocol ConvertFromDocument
  (from-document [input keywordize] "Converts given DBObject instance to a piece of Clojure data"))

(extend-protocol ConvertFromDocument
  nil
  (from-document [input keywordize] input)

  Object
  (from-document [input keywordize] input)

  org.bson.types.Decimal128
  (from-document [^org.bson.types.Decimal128 input keywordize]
    (.bigDecimalValue input))

  java.util.List
  (from-document [^java.util.List input keywordize]
    (vec (map #(from-document % keywordize) input)))
  
  java.util.Date
  (from-document [t _]
                 (t/instant t))
  
  org.bson.Document
  (from-document [input keywordize]
                 (reduce (if keywordize
                           (fn [m ^String k]
                             (assoc m (keyword k) (from-document (.get input k) true)))
                           (fn [m ^String k]
                             (assoc m k (from-document (.get input k) false))))
                         (ordered-map/ordered-map)
                         (.keySet input))))

(defprotocol ConvertToDocument
  (^org.bson.Document to-document [input] 
    "Converts given piece of Clojure data to org.bson.Document usable by java driver."))

(extend-protocol ConvertToDocument
  nil
  (to-document [input]
    nil)

  String
  (to-document [^String input]
    input)

  Boolean
  (to-document [^Boolean input]
    input)

  java.util.Date
  (to-document [^java.util.Date input]
    input)

  clojure.lang.Ratio
  (to-document [^clojure.lang.Ratio input]
    (double input))

  clojure.lang.Keyword
  (to-document [^clojure.lang.Keyword input] (.getName input))

  clojure.lang.Named
  (to-document [^clojure.lang.Named input] (.getName input))

  clojure.lang.IPersistentMap
  (to-document [^cloure.lang.IPersistentMap input]
    (let [o (org.bson.Document.)]
      (doseq [[k v] input]
        (.put o (to-document k) (to-document v)))
      o))

  java.util.List
  (to-document [^java.util.List input] (map to-document input))

  java.util.Set
  (to-document [^java.util.Set input] (map to-document input))

  com.mongodb.DBObject
  (to-document [^com.mongodb.DBObject input] input)

  com.mongodb.DBRef
  (to-document [^com.mongodb.DBRef dbref]
    dbref)

  Object
  (to-document [input]
    input))

;; Cam: It seems to be the case that the only thing BSON supports is DateTime which is basically the equivalent
;; of Instant; for the rest of the types, we'll have to fake it.
(extend-protocol ConvertToDocument
  java.time.Instant
  (to-document [t]
    (org.bson.BsonDateTime. (t/to-millis-from-epoch t)))

  java.time.LocalDate
  (to-document [t]
    (to-document (t/local-date-time t (t/local-time 0))))

  java.time.LocalDateTime
  (to-document [t]
    ;; QP store won't be bound when loading test data for example.
    (to-document (t/instant t (t/zone-id (try
                                           (qp.timezone/results-timezone-id)
                                           (catch Throwable _
                                             "UTC"))))))

  java.time.LocalTime
  (to-document [t]
    (to-document (t/local-date-time (t/local-date "1970-01-01") t)))

  java.time.OffsetDateTime
  (to-document [t]
    (to-document (t/instant t)))

  java.time.OffsetTime
  (to-document [t]
    (to-document (t/offset-date-time (t/local-date "1970-01-01") t (t/zone-offset t))))

  java.time.ZonedDateTime
  (to-document [t]
    (to-document (t/instant t))))

;;;; Wrapped java driver.

(defn mongo-client
  ^MongoClient [^MongoClientSettings settings]
  (MongoClients/create settings))

(defn close
  [^MongoClient client]
  (.close client))

(defn database
  ^MongoDatabase
  [^MongoClient client db-name]
  (.getDatabase client db-name))

(defn run-command
  ([^MongoDatabase db cmd-map & {:keys [keywordize] :or {keywordize true}}]
   (let [from-document* #(from-document % keywordize)]
     (->> cmd-map to-document (.runCommand db) from-document*))))

(defn list-database-names [^MongoClient client]
  (->> client .listDatabaseNames (into [])))

(defn list-collection-names [^MongoDatabase db]
  (->> db .listCollectionNames (into [])))

(defn collection [^MongoDatabase db coll-name]
  (.getCollection db coll-name))

(defn list-indexes
  ([^MongoDatabase db coll-name]
   (list-indexes (collection db coll-name)))
  ([^MongoCollection coll]
   (into [] (.listIndexes coll))))

;; TODO: return cursor!
;; TODO: should shadow find
;; TODO: should be modified to avoid into
(defn do-find [^MongoCollection coll
               & {:keys [limit skip batch-size sort-criteria] :as _opts}]
  (->> (cond-> ^FindIterable (.find coll)
         limit (.limit limit)
         skip (.skip skip)
         batch-size (.batchSize (int batch-size))
         sort-criteria (.sort (to-document sort-criteria)))
      (mapv #(from-document % true))))

(defn create-index
  "Create index."
  [^MongoCollection coll cmd-map]
  (.createIndex coll (to-document cmd-map)))

(defn insert-one
  "Insert document into mongo collection."
  [^MongoCollection coll document-map]
  (.insertOne coll (to-document document-map)))

;;;; Util

(defn- fqdn?
  "A very simple way to check if a hostname is fully-qualified:
   Check if there are two or more periods in the name."
  [host]
  (<= 2 (-> host frequencies (get \. 0))))

(defn- validate-db-details! [{:keys [use-srv host] :as _db-details}]
  (when (and use-srv (not (fqdn? host)))
    (throw (ex-info (tru "Using DNS SRV requires a FQDN for host")
                    {:host host}))))

(defn update-ssl-db-details
  [db-details]
  (-> db-details
      (assoc :client-ssl-key (secret/get-secret-string db-details "client-ssl-key"))
      (dissoc :client-ssl-key-creator-id
              :client-ssl-key-created-at
              :client-ssl-key-id
              :client-ssl-key-source)))

(defn- details-normalized
  "Return _normalized_ database `:details` for `x`, where `x` could be a database id, database name, database object
   (as returned eg. by call to `(toucan2.core/select-one :model/Database)`)"
  [database]
  (let [db-details
        (cond
          (integer? database)             (qp.store/with-metadata-provider database
                                            (:details (lib.metadata.protocols/database (qp.store/metadata-provider))))
          (string? database)              {:dbname database}
          (:dbname (:details database))   (:details database) ; entire Database obj
          (:dbname database)              database            ; connection details map only
          (:conn-uri database)            database            ; connection URI has all the parameters
          (:conn-uri (:details database)) (:details database)
          :else
          (throw (Exception. (str "with-mongo-connection failed: bad connection details:"
                                  (:details database)))))]
    (validate-db-details! db-details)
    (update-ssl-db-details db-details)))

;; TODO: ADD explanation from notion doc.
(defn db-details->connection-string
  "Generate connection string from database details."
  [{:keys [use-conn-uri conn-uri host port user authdb pass dbname additional-options use-srv ssl] :as _db-details}]
  ;; Connection string docs:
  ;; http://mongodb.github.io/mongo-java-driver/4.11/apidocs/mongodb-driver-core/com/mongodb/ConnectionString.html
  (if use-conn-uri
    conn-uri
    (str
     (if use-srv "mongodb+srv" "mongodb")
     "://"
     (when (seq user) (str user (when (seq pass) (str ":" pass)) "@"))
     host
     (when (and (not use-srv) (some? port)) (str ":" port))
     "/"
     dbname
     "?authSource=" (if (empty? authdb) "admin" authdb)
     "&appName=" config/mb-app-id-string
     "&connectTimeoutMS=" (driver.u/db-connection-timeout-ms)
     "&serverSelectionTimeoutMS=" (driver.u/db-connection-timeout-ms)
     (when ssl "&ssl=true")
     (when (seq additional-options) (str "&" additional-options)))))

(defn- maybe-add-ssl-context-to-builder!
  "TODO: When certs are empty we add context with empty certs! Is that desired?"
  [^MongoClientSettings$Builder builder
   {:keys [ssl-cert ssl-use-client-auth client-ssl-cert client-ssl-key]}]
  (let [server-cert? (not (str/blank? ssl-cert))
        client-cert? (and ssl-use-client-auth
                          (not-any? str/blank? [client-ssl-cert client-ssl-key]))]
    (when (or client-cert? server-cert?)
      (let [ssl-params (cond-> {}
                         server-cert? (assoc :trust-cert ssl-cert)
                         client-cert? (assoc :private-key client-ssl-key
                                             :own-cert client-ssl-cert))
            ssl-context (driver.u/ssl-context ssl-params)]
        (.applyToSslSettings builder
                             (reify com.mongodb.Block
                               (apply [_this builder]
                                 (.context ^SslSettings$Builder builder ssl-context))))))))

(defn db-details->mongo-client-settings
  "Generate `MongoClientSettings` from `db-details`. `ConnectionString` is generated and applied to
   `MongoClientSettings$Builder` first. Then ssl context is udated in the `builder`. Afterwards, `MongoClientSettings`
   are built using `.build`."
  ^MongoClientSettings
  [{:keys [use-conn-uri ssl] :as db-details}]
  (let [connection-string (-> db-details
                              db-details->connection-string
                              com.mongodb.ConnectionString.)
        builder (com.mongodb.MongoClientSettings/builder)]
    (.applyConnectionString builder connection-string)
    (when (and ssl (not use-conn-uri))
      (maybe-add-ssl-context-to-builder! builder db-details))
    (.build builder)))

(defn do-with-mongo-client [thunk database]
  (let [db-details (details-normalized database)]
    (ssh/with-ssh-tunnel [details-with-tunnel db-details]
      (let [client (mongo-client (db-details->mongo-client-settings details-with-tunnel))]
        (log/debug (u/format-color 'cyan (trs "Opened new MongoClient.")))
        (try
          (binding [*mongo-client* client]
            (thunk client))
          (finally
            (close client)
            (log/debug (u/format-color 'cyan (trs "Closed MongoClient.")))))))))

(defmacro with-mongo-client
  [[client-sym database] & body]
  `(let [f# (fn [~client-sym] ~@body)]
     (if (nil? *mongo-client*)
       (do-with-mongo-client f# ~database)
       (f# *mongo-client*))))

(defn details->db-name
  "Get database name from database `:details`."
  ^String [{:keys [dbname conn-uri] :as _db-details}]
  (or (not-empty dbname) (-> (com.mongodb.ConnectionString. conn-uri) .getDatabase)))

(defn do-with-mongo-database [thunk database*]
  (let [db-name (-> database* details-normalized details->db-name)]
    (with-mongo-client [c database*]
      (thunk (database c db-name)))))

(defmacro with-mongo-database
  [[db-sym database] & body]
  `(let [f# (fn [~db-sym] ~@body)]
     (do-with-mongo-database f# ~database)))