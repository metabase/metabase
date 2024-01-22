(ns metabase.driver.mongo.java-driver-wrapper
  "This namespace is a wrapper of `mongo-java-driver`, borrowing a lot from monger library."
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
   [metabase.util.ssh :as ssh]))

(set! *warn-on-reflection* true)

;;;; Conversions
;;   Borrows heavily from monger.

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

  ;; TODO: remove following!
  com.mongodb.BasicDBList
  (from-document [^com.mongodb.BasicDBList input keywordize]
    (vec (map #(from-document % keywordize) input)))

  com.mongodb.DBRef
  (from-document [^com.mongodb.DBRef input keywordize]
    input)

  ;; TODO: remove following!
  com.mongodb.DBObject
  (from-document [^com.mongodb.DBObject input keywordize]
    ;; DBObject provides .toMap, but the implementation in
    ;; subclass GridFSFile unhelpfully throws
    ;; UnsupportedOperationException.
    (reduce (if keywordize
              (fn [m ^String k]
                (assoc m (keyword k) (from-document (.get input k) true)))
              (fn [m ^String k]
                (assoc m k (from-document (.get input k) false))))
            {} (.keySet input))))

(extend-protocol ConvertFromDocument
  java.util.Date
  (from-document [t _]
    (t/instant t)))

(extend-protocol ConvertFromDocument
  org.bson.Document
  (from-document [input keywordize]
    (def kwkws keywordize)
    (reduce (if keywordize
              (fn [m ^String k]
                (assoc m (keyword k) (from-document (.get input k) true)))
              (fn [m ^String k]
                (assoc m k (from-document (.get input k) false))))
            ;; following ignores ordering
            (ordered-map/ordered-map) @(def ksks (.keySet input))
            #_#_{} @(def ksks (.keySet input)))))

(defprotocol ConvertToDocument
  (^org.bson.Document to-document [input] "Converts given piece of Clojure data to BasicDBObject MongoDB Java driver uses"))

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

  ;; other just returns
  Object
  (to-document [input]
    input))


;; It seems to be the case that the only thing BSON supports is DateTime which is basically the equivalent of Instant;
;; for the rest of the types, we'll have to fake it
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

;;;; Wrapped java driver api.

(defn mongo-client
  ^com.mongodb.client.MongoClient
  [^com.mongodb.MongoClientSettings settings]
  (com.mongodb.client.MongoClients/create settings))

(defn close [^com.mongodb.client.MongoClient client]
  (.close client))

;; TODO: instead of this, with-mongo-db should be designed differently? -- no client can operate multiple databases?
;;       but not in Metabase.
(defn db-name
  ^String [{:keys [conn-uri] :as db-details}]
  (if (string? conn-uri)
    (-> (com.mongodb.ConnectionString. conn-uri) .getDatabase)
    (:dbname db-details)))

(defn database
  ^com.mongodb.client.MongoDatabase
  [^com.mongodb.client.MongoClient client db-name]
  (.getDatabase client db-name))

;; TODO: check correctness! keywordize
(defn run-command
  ([^com.mongodb.client.MongoDatabase db cmd-map & {:keys [keywordize] :or {keywordize true}}]
   (let [from-document* #(from-document % keywordize)]
     (->> cmd-map to-document (.runCommand db) from-document*))))

(defn list-database-names [^com.mongodb.client.MongoClient client]
  (->> client .listDatabaseNames (into [])))

(defn list-collection-names [^com.mongodb.client.MongoDatabase db]
  (->> db .listCollectionNames (into [])))

(defn collection [^com.mongodb.client.MongoDatabase db coll-name]
  (.getCollection db coll-name))

;; TODO: remove into []
(defn list-indexes
  ([^com.mongodb.client.MongoDatabase db coll-name]
   (list-indexes (collection db coll-name)))
  ([^com.mongodb.client.MongoCollection coll]
   (into [] (.listIndexes coll))))

;; TODO: return cursor!
;; TODO: should shadow find
;; TODO: should be modified to avoid into
(defn do-find [^com.mongodb.client.MongoCollection coll
               & {:keys [limit skip batch-size sort-criteria] :as _opts}]
  (->> (cond-> ^com.mongodb.client.FindIterable (.find coll)
         ;; following is "funny"
        limit (.limit limit)
        skip (.skip skip)
        batch-size (.batchSize (int batch-size))
        sort-criteria (.sort (to-document sort-criteria)))
      (mapv #(from-document % true))))

;; indexes

(defn create-index [^com.mongodb.client.MongoCollection coll cmd-map]
  (let [cmd (to-document cmd-map)]
    (.createIndex coll cmd)))

;; CREATE

(defn insert-one [^com.mongodb.client.MongoCollection coll document-ordred-map]
  (.insertOne coll (to-document document-ordred-map)))

;;;; UTIL

(def ^:dynamic *mongo-client* nil)

(defn- fqdn?
  "A very simple way to check if a hostname is fully-qualified:
   Check if there are two or more periods in the name."
  [host]
  (<= 2 (-> host frequencies (get \. 0))))

;; TODO: ssl nil?
(defn- normalize-details [details]
  (let [{:keys [dbname host port user pass authdb additional-options use-srv conn-uri ssl ssl-cert ssl-use-client-auth client-ssl-cert]
         :or   {port 27017, ssl false, ssl-use-client-auth false, use-srv false, ssl-cert "", authdb "admin"}} details
        ;; ignore empty :user and :pass strings
        user (not-empty user)
        pass (not-empty pass)]
    (when (and use-srv (not (fqdn? host)))
      (throw (ex-info (tru "Using DNS SRV requires a FQDN for host")
                      {:host host})))
    {:host                    host
     :port                    port
     :user                    user
     :authdb                  authdb
     :pass                    pass
     :dbname                  dbname
     :ssl                     ssl
     :additional-options      additional-options
     :conn-uri                conn-uri
     :srv?                    use-srv
     :ssl-cert                ssl-cert
     :ssl-use-client-auth     ssl-use-client-auth
     :client-ssl-cert         client-ssl-cert
     :client-ssl-key          (secret/get-secret-string details "client-ssl-key")}))

(defn- database->details
  "Make sure `database` is in a standard db details format. This is done so we can accept several different types of
  values for `database`, such as plain strings or the usual MB details map."
  [database]
  (cond
    (integer? database)             (qp.store/with-metadata-provider database
                                      (:details (lib.metadata.protocols/database (qp.store/metadata-provider))))
    (string? database)              {:dbname database}
    (:dbname (:details database))   (:details database) ; entire Database obj
    (:dbname database)              database            ; connection details map only
    (:conn-uri database)            database            ; connection URI has all the parameters
    (:conn-uri (:details database)) (:details database)
    :else                           (throw (Exception. (str "with-mongo-connection failed: bad connection details:"
                                                            (:details database))))))

;; the code below is done to support "additional connection options" the way some of the JDBC drivers do.
;; For example, some people might want to specify a`readPreference` of `nearest`. The normal Java way of
;; doing this would be to do
;;
;;     (.readPreference builder (ReadPreference/nearest))
;;
;; But the user will enter something like `readPreference=nearest`. Luckily, the Mongo Java lib can parse
;; these options for us and return a `MongoClientOptions` like we'd prefer. Code below:
(defn db-details->connection-string
  "Additional connection options as eg. readPreference are set using `additional-options`."
  [{:keys [conn-uri host port user authdb pass dbname additional-options srv? ssl] :as _db-details}]
  (if (string? conn-uri)
    conn-uri
    (str
     ;; prefix
     (if srv? "mongodb+srv" "mongodb")
     "://"
     ;; credentials
     (when (string? user) (str user (when (string? pass) (str ":" pass)) "@"))
     ;; host
     host
     (when (int? port) (str ":" port))
     "/"
     dbname
     ;; TODO: Here I believe it is a right thing to do to overwrite ours url params by user provided. Verify that's true.
     "?authSource=" authdb
     "&appName=" config/mb-app-id-string
     "&connectTimeoutMS=" (driver.u/db-connection-timeout-ms)
     "&serverSelectionTimeoutMS=" (driver.u/db-connection-timeout-ms)
     ;; here other options, and overwrite with `additional-options`
     (when (boolean? ssl) (str "&ssl=" ssl))
     (when (some? additional-options) (str "&" additional-options)))))

;; TODO: Missing connection URI only
(defn db-details->mongo-client-settings
  "Generate `MongoClientSettings` from `db-details`. `ConnectionString` is generated and applied to
   `MongoClientSettings$Builder` first. Then ssl context is udated in the `builder`. Afterwards, `MongoClientSettings`
   are built using `.build`."
  ^com.mongodb.MongoClientSettings
  [{:keys [conn-uri ssl ssl-cert ssl-use-client-auth client-ssl-cert client-ssl-key] :as db-details}]
  (let [connection-string (-> db-details
                              db-details->connection-string
                              com.mongodb.ConnectionString.)
        builder (com.mongodb.MongoClientSettings/builder)]
    (.applyConnectionString builder connection-string)
    ;; TODO: not conn-uri condition is just temporary to match old logic..
    (when (and ssl (not conn-uri))
      (let [server-cert? (not (str/blank? ssl-cert))
            client-cert? (and ssl-use-client-auth
                              (not-any? str/blank? [client-ssl-cert client-ssl-key]))
            ssl-params (cond-> {}
                         server-cert? (assoc :trust-cert ssl-cert)
                         client-cert? (assoc :private-key client-ssl-key
                                             :own-cert client-ssl-cert))
            ssl-context (driver.u/ssl-context ssl-params)]
        (.applyToSslSettings builder (reify com.mongodb.Block
                                       (apply [_this builder]
                                         (.context ^com.mongodb.connection.SslSettings$Builder builder ssl-context))))))
    (.build builder)))

(defn do-with-mongo-client [thunk database]
  (let [db-details (-> database database->details)]
    (ssh/with-ssh-tunnel [details-with-tunnel db-details]
      (let [client (mongo-client (db-details->mongo-client-settings (normalize-details details-with-tunnel)))]
        (try
          (log/debug (u/format-color 'cyan (trs "Opened new MongoClient.")))
          (binding [*mongo-client* client]
            (thunk client))
          (finally
            (.close client)
            (log/debug (u/format-color 'cyan (trs "Closed MongoClient.")))))))))

(defmacro with-mongo-client
  [[client-sym database] & body]
  `(let [f# (fn [~client-sym] ~@body)]
     (if (nil? *mongo-client*)
       (do-with-mongo-client f# ~database)
       (f# *mongo-client*))))

;; TODO: shadowing of database? better arg name
;; TODO: database details can have connection string only
(defn do-with-mongo-database [thunk database*]
  (let [db-name (-> database* database->details db-name)]
    (with-mongo-client [c database*]
      (thunk (database c db-name)))))

(defmacro with-mongo-database
  [[db-sym database] & body]
  `(let [f# (fn [~db-sym] ~@body)]
     (do-with-mongo-database f# ~database)))