(ns metabase.driver.mongo
  "MongoDB Driver."
  (:require
   [cheshire.core :as json]
   [cheshire.generate :as json.generate]
   [clojure.string :as str]
   [flatland.ordered.map :as ordered-map]
   [java-time :as t]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.common :as driver.common]
   [metabase.driver.mongo.execute :as mongo.execute]
   [metabase.driver.mongo.parameters :as mongo.params]
   [metabase.driver.mongo.query-processor :as mongo.qp]
   [metabase.driver.mongo.util :refer [with-mongo-connection]]
   [metabase.driver.util :as driver.u]
   [metabase.models :refer [Field]]
   [metabase.query-processor.store :as qp.store]
   [metabase.query-processor.timezone :as qp.timezone]
   [metabase.util :as u]
   [metabase.util.log :as log]
   [monger.command :as cmd]
   [monger.conversion :as m.conversion]
   [monger.core :as mg]
   [monger.db :as mdb]
   [monger.json]
   [taoensso.nippy :as nippy]
   [toucan2.core :as t2])
  (:import
   (com.mongodb DB DBObject)
   (java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime)
   (org.bson.types ObjectId)))

(set! *warn-on-reflection* true)

;; See http://clojuremongodb.info/articles/integration.html Loading this namespace will load appropriate Monger
;; integrations with Cheshire.
(comment monger.json/keep-me)

;; JSON Encoding (etc.)

;; Encode BSON undefined like `nil`
(json.generate/add-encoder org.bson.BsonUndefined json.generate/encode-nil)

(nippy/extend-freeze ObjectId :mongodb/ObjectId
                     [^ObjectId oid data-output]
                     (.writeUTF data-output (.toHexString oid)))

(nippy/extend-thaw :mongodb/ObjectId
  [data-input]
  (ObjectId. (.readUTF data-input)))

(driver/register! :mongo)

(defmethod driver/can-connect? :mongo
  [_ details]
  (with-mongo-connection [^DB conn, details]
    (= (float (-> (cmd/db-stats conn)
                  (m.conversion/from-db-object :keywordize)
                  :ok))
       1.0)))

(defmethod driver/humanize-connection-error-message
  :mongo
  [_ message]
  (condp re-matches message
    #"^Timed out after \d+ ms while waiting for a server .*$"
    :cannot-connect-check-host-and-port

    #"^host and port should be specified in host:port format$"
    :invalid-hostname

    #"^Password can not be null when the authentication mechanism is unspecified$"
    :password-required

    #"^org.apache.sshd.common.SshException: No more authentication methods available$"
    :ssh-tunnel-auth-fail

    #"^java.net.ConnectException: Connection refused$"
    :ssh-tunnel-connection-fail

    #".*javax.net.ssl.SSLHandshakeException: PKIX path building failed.*"
    :certificate-not-trusted

    #".*MongoSocketReadException: Prematurely reached end of stream.*"
    :requires-ssl

    #".* KeyFactory not available"
    :unsupported-ssl-key-type

    #"java.security.InvalidKeyException: invalid key format"
    :invalid-key-format

    message))


;;; ### Syncing

(declare update-field-attrs)

(defmethod driver/sync-in-context :mongo
  [_ database do-sync-fn]
  (with-mongo-connection [_ database]
    (do-sync-fn)))

(defn- val->semantic-type [field-value]
  (cond
    ;; 1. url?
    (and (string? field-value)
         (u/url? field-value))
    :type/URL

    ;; 2. json?
    (and (string? field-value)
         (or (str/starts-with? "{" field-value)
             (str/starts-with? "[" field-value)))
    (when-let [j (u/ignore-exceptions (json/parse-string field-value))]
      (when (or (map? j)
                (sequential? j))
        :type/SerializedJSON))))

(defn- find-nested-fields [field-value nested-fields]
  (loop [[k & more-keys] (keys field-value)
         fields nested-fields]
    (if-not k
      fields
      (recur more-keys (update fields k (partial update-field-attrs (k field-value)))))))

(defn- update-field-attrs [field-value field-def]
  (-> field-def
      (update :count u/safe-inc)
      (update :len #(if (string? field-value)
                      (+ (or % 0) (count field-value))
                      %))
      (update :types (fn [types]
                       (update types (type field-value) u/safe-inc)))
      (update :semantic-types (fn [semantic-types]
                               (if-let [st (val->semantic-type field-value)]
                                 (update semantic-types st u/safe-inc)
                                 semantic-types)))
      (update :nested-fields (fn [nested-fields]
                               (if (map? field-value)
                                 (find-nested-fields field-value nested-fields)
                                 nested-fields)))))

(defn- most-common-object-type
  "Given a sequence of tuples like [Class <number-of-occurances>] return the Class with the highest number of
  occurances. The basic idea here is to take a sample of values for a Field and then determine the most common type
  for its values, and use that as the Metabase base type. For example if we have a Field called `zip_code` and it's a
  number 90% of the time and a string the other 10%, we'll just call it a `:type/Number`."
  ^Class [field-types]
  (when (seq field-types)
    (first (apply max-key second field-types))))

(defn- class->base-type [^Class klass]
  (if (isa? klass org.bson.types.ObjectId)
    :type/MongoBSONID
    (driver.common/class->base-type klass)))

(defn- describe-table-field [field-kw field-info idx]
  (let [most-common-object-type  (most-common-object-type (:types field-info))
        [nested-fields idx-next]
        (reduce
         (fn [[nested-fields idx] nested-field]
           (let [[nested-field idx-next] (describe-table-field nested-field
                                                               (nested-field (:nested-fields field-info))
                                                               idx)]
             [(conj nested-fields nested-field) idx-next]))
         [#{} (inc idx)]
         (keys (:nested-fields field-info)))]
    [(cond-> {:name              (name field-kw)
              :database-type     (some-> most-common-object-type .getName)
              :base-type         (class->base-type most-common-object-type)
              :database-position idx}
       (= :_id field-kw)           (assoc :pk? true)
       (:semantic-types field-info) (assoc :semantic-type (->> (:semantic-types field-info)
                                                             (filterv #(some? (first %)))
                                                             (sort-by second)
                                                             last
                                                             first))
       (:nested-fields field-info) (assoc :nested-fields nested-fields)) idx-next]))

(defmethod driver/dbms-version :mongo
  [_ database]
  (with-mongo-connection [^com.mongodb.DB conn database]
    (let [build-info (mg/command conn {:buildInfo 1})]
      {:version (get build-info "version")
       :semantic-version (get build-info "versionArray")})))

(defmethod driver/describe-database :mongo
  [_ database]
  (with-mongo-connection [^com.mongodb.DB conn database]
    {:tables (set (for [collection (disj (mdb/get-collection-names conn) "system.indexes")]
                    {:schema nil, :name collection}))}))

(defn- from-db-object
  "This is mostly a copy of the monger library's own function of the same name with the
  only difference that it uses an ordered map to represent the document. This ensures that
  the order of the top level fields of the table is preserved. For anything that's not a
  DBObject, it falls back to the original function."
  [input]
  (if (instance? DBObject input)
    (let [^DBObject dbobj input]
      (reduce (fn [m ^String k]
                (assoc m (keyword k) (m.conversion/from-db-object (.get dbobj k) true)))
              (ordered-map/ordered-map)
              (.keySet dbobj)))
    (m.conversion/from-db-object input true)))

(defn- sample-documents [^com.mongodb.DB conn table sort-direction]
  (let [collection (.getCollection conn (:name table))]
    (with-open [cursor (doto (.find collection
                                    (m.conversion/to-db-object {})
                                    (m.conversion/as-field-selector []))
                         (.limit metadata-queries/nested-field-sample-limit)
                         (.skip 0)
                         (.sort (m.conversion/to-db-object {:_id sort-direction}))
                         (.batchSize 256))]
      (map from-db-object cursor))))

(defn- table-sample-column-info
  "Sample the rows (i.e., documents) in `table` and return a map of information about the column keys we found in that
   sample. The results will look something like:

      {:_id      {:count 200, :len nil, :types {java.lang.Long 200}, :semantic-types nil, :nested-fields nil},
       :severity {:count 200, :len nil, :types {java.lang.Long 200}, :semantic-types nil, :nested-fields nil}}"
  [^com.mongodb.DB conn, table]
  (try
    (reduce
     (fn [field-defs row]
       (loop [[k & more-keys] (keys row), fields field-defs]
         (if-not k
           fields
           (recur more-keys (update fields k (partial update-field-attrs (k row)))))))
     (ordered-map/ordered-map)
     (concat (sample-documents conn table 1) (sample-documents conn table -1)))
    (catch Throwable t
      (log/error (format "Error introspecting collection: %s" (:name table)) t))))

(defmethod driver/describe-table :mongo
  [_ database table]
  (with-mongo-connection [^com.mongodb.DB conn database]
    (let [column-info (table-sample-column-info conn table)]
      {:schema nil
       :name   (:name table)
       :fields (first
                (reduce (fn [[fields idx] [field info]]
                          (let [[described-field new-idx] (describe-table-field field info idx)]
                            [(conj fields described-field) new-idx]))
                        [#{} 0]
                        column-info))})))

(doseq [[feature supported?] {:basic-aggregations              true
                              :expression-aggregations         true
                              :inner-join                      true
                              :left-join                       true
                              :nested-fields                   true
                              :nested-queries                  true
                              :native-parameters               true
                              :set-timezone                    true
                              :standard-deviation-aggregations true
                              :test/jvm-timezone-setting       false}]
  (defmethod driver/database-supports? [:mongo feature] [_driver _feature _db] supported?))

;; We say Mongo supports foreign keys so that the front end can use implicit
;; joins. In reality, Mongo doesn't support foreign keys.
;; Only define an implementation for `:foreign-keys` if none exists already.
;; In test extensions we define an alternate implementation, and we don't want
;; to stomp over that if it was loaded already.
(when-not (get (methods driver/supports?) [:mongo :foreign-keys])
  (defmethod driver/supports? [:mongo :foreign-keys] [_ _] true))

(defmethod driver/database-supports? [:mysql :schemas] [_driver _feat _db] false)

(defmethod driver/database-supports? [:mongo :expressions]
  [_driver _feature db]
  (-> (:dbms_version db)
      :semantic-version
      (driver.u/semantic-version-gte [4 2])))

(defmethod driver/database-supports? [:mongo :date-arithmetics]
  [_driver _feature db]
  (-> (:dbms_version db)
      :semantic-version
      (driver.u/semantic-version-gte [5])))

(defmethod driver/database-supports? [:mongo :datetime-diff]
  [_driver _feature db]
  (-> (:dbms_version db)
      :semantic-version
      (driver.u/semantic-version-gte [5])))

(defmethod driver/database-supports? [:mongo :now]
  ;; The $$NOW aggregation expression was introduced in version 4.2.
  [_driver _feature db]
  (-> (:dbms_version db)
      :semantic-version
      (driver.u/semantic-version-gte [4 2])))

(defmethod driver/mbql->native :mongo
  [_ query]
  (mongo.qp/mbql->native query))

(defmethod driver/execute-reducible-query :mongo
  [_ query context respond]
  (with-mongo-connection [_ (qp.store/database)]
    (mongo.execute/execute-reducible-query query context respond)))

(defmethod driver/substitute-native-parameters :mongo
  [driver inner-query]
  (mongo.params/substitute-native-parameters driver inner-query))

;; It seems to be the case that the only thing BSON supports is DateTime which is basically the equivalent of Instant;
;; for the rest of the types, we'll have to fake it
(extend-protocol m.conversion/ConvertToDBObject
  Instant
  (to-db-object [t]
    (org.bson.BsonDateTime. (t/to-millis-from-epoch t)))

  LocalDate
  (to-db-object [t]
    (m.conversion/to-db-object (t/local-date-time t (t/local-time 0))))

  LocalDateTime
  (to-db-object [t]
    ;; QP store won't be bound when loading test data for example.
    (m.conversion/to-db-object (t/instant t (t/zone-id (try
                                                         (qp.timezone/results-timezone-id)
                                                         (catch Throwable _
                                                           "UTC"))))))

  LocalTime
  (to-db-object [t]
    (m.conversion/to-db-object (t/local-date-time (t/local-date "1970-01-01") t)))

  OffsetDateTime
  (to-db-object [t]
    (m.conversion/to-db-object (t/instant t)))

  OffsetTime
  (to-db-object [t]
    (m.conversion/to-db-object (t/offset-date-time (t/local-date "1970-01-01") t (t/zone-offset t))))

  ZonedDateTime
  (to-db-object [t]
    (m.conversion/to-db-object (t/instant t))))

(extend-protocol m.conversion/ConvertFromDBObject
  java.util.Date
  (from-db-object [t _]
    (t/instant t)))

(defmethod driver/db-start-of-week :mongo
  [_]
  :sunday)

(defn- get-id-field-id [table]
  (t2/select-one-pk Field :name "_id" :table_id (u/the-id table)))

(defmethod driver/table-rows-sample :mongo
  [_driver table fields rff opts]
  (let [mongo-opts {:limit metadata-queries/nested-field-sample-limit
                    :order-by [[:desc [:field (get-id-field-id table) nil]]]}]
    (metadata-queries/table-rows-sample table fields rff (merge mongo-opts opts))))

(comment
  (require '[clojure.java.io :as io]
           '[monger.credentials :as mcred])
  (import javax.net.ssl.SSLSocketFactory)

  ;; The following forms help experimenting with the behaviour of Mongo
  ;; servers with different configurations. They can be used to check if
  ;; the environment has been set up correctly (or at least according to
  ;; the expectations), as well as the exceptions thrown in various
  ;; constellations.

  ;; Test connection to Mongo with client and server SSL authentication.
  (let [ssl-socket-factory
        (driver.u/ssl-socket-factory
         :private-key (-> "ssl/mongo/metabase.key" io/resource slurp)
         :password "passw"
         :own-cert (-> "ssl/mongo/metabase.crt" io/resource slurp)
         :trust-cert (-> "ssl/mongo/metaca.crt" io/resource slurp))
        connection-options
        (mg/mongo-options {:ssl-enabled true
                           :ssl-invalid-host-name-allowed false
                           :socket-factory ssl-socket-factory})
        credentials
        (mcred/create "metabase" "admin" "metasample123")]
    (with-open [connection (mg/connect (mg/server-address "127.0.0.1")
                                       connection-options
                                       credentials)]
      (mg/get-db-names connection)))

  ;; Test what happens if the client only support server authentication.
  (let [server-auth-ssl-socket-factory
        (driver.u/ssl-socket-factory
         :trust-cert (-> "ssl/mongo/metaca.crt" io/resource slurp))
        server-auth-connection-options
        (mg/mongo-options {:ssl-enabled true
                           :ssl-invalid-host-name-allowed false
                           :socket-factory server-auth-ssl-socket-factory
                           :server-selection-timeout 200})
        credentials
        (mcred/create "metabase" "admin" "metasample123")]
    (with-open [server-auth-connection
                (mg/connect (mg/server-address "127.0.0.1")
                            server-auth-connection-options
                            credentials)]
      (mg/get-db-names server-auth-connection)))

  ;; Test what happens if the client support only server authentication
  ;; with well known (default) CAs.
  (let [unauthenticated-connection-options
        (mg/mongo-options {:ssl-enabled true
                           :ssl-invalid-host-name-allowed false
                           :socket-factory (SSLSocketFactory/getDefault)
                           :server-selection-timeout 200})
        credentials
        (mcred/create "metabase" "admin" "metasample123")]
    (with-open [unauthenticated-connection
                (mg/connect (mg/server-address "127.0.0.1")
                            unauthenticated-connection-options
                            credentials)]
      (mg/get-db-names unauthenticated-connection)))
  :.)
