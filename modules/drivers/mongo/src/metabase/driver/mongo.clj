(ns metabase.driver.mongo
  "MongoDB Driver."
  (:require [cheshire
             [core :as json]
             [generate :as json.generate]]
            [clojure.string :as str]
            [clojure.tools.logging :as log]
            [java-time :as t]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver.common :as driver.common]
            [metabase.driver.mongo
             [execute :as execute]
             [parameters :as parameters]
             [query-processor :as qp]
             [util :refer [with-mongo-connection]]]
            [metabase.plugins.classloader :as classloader]
            [metabase.query-processor
             [store :as qp.store]
             [timezone :as qp.timezone]]
            [monger
             [collection :as mc]
             [command :as cmd]
             [conversion :as m.conversion]
             [db :as mdb]]
            [schema.core :as s]
            [taoensso.nippy :as nippy])
  (:import com.mongodb.DB
           [java.time Instant LocalDate LocalDateTime LocalTime OffsetDateTime OffsetTime ZonedDateTime]
           org.bson.BsonUndefined
           org.bson.types.ObjectId))

;; See http://clojuremongodb.info/articles/integration.html Loading this namespace will load appropriate Monger
;; integrations with Cheshire.
(classloader/require 'monger.json)

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

(defmethod driver/humanize-connection-error-message :mongo
  [_ message]
  (condp re-matches message
    #"^Timed out after \d+ ms while waiting for a server .*$"
    (driver.common/connection-error-messages :cannot-connect-check-host-and-port)

    #"^host and port should be specified in host:port format$"
    (driver.common/connection-error-messages :invalid-hostname)

    #"^Password can not be null when the authentication mechanism is unspecified$"
    (driver.common/connection-error-messages :password-required)

    #"^org.apache.sshd.common.SshException: No more authentication methods available$"
    (driver.common/connection-error-messages :ssh-tunnel-auth-fail)

    #"^java.net.ConnectException: Connection refused$"
    (driver.common/connection-error-messages :ssh-tunnel-connection-fail)

    #".*javax.net.ssl.SSLHandshakeException: PKIX path building failed.*"
    (driver.common/connection-error-messages :certificate-not-trusted)

    #".*MongoSocketReadException: Prematurely reached end of stream.*"
    (driver.common/connection-error-messages :requires-ssl)

    #".*"                               ; default
    message))


;;; ### Syncing

(declare update-field-attrs)

(defmethod driver/sync-in-context :mongo
  [_ database do-sync-fn]
  (with-mongo-connection [_ database]
    (do-sync-fn)))

(defn- val->special-type [field-value]
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
      (update :special-types (fn [special-types]
                               (if-let [st (val->special-type field-value)]
                                 (update special-types st u/safe-inc)
                                 special-types)))
      (update :nested-fields (fn [nested-fields]
                               (if (map? field-value)
                                 (find-nested-fields field-value nested-fields)
                                 nested-fields)))))

;; TODO - use `driver.common/class->base-type` to implement this functionality
(s/defn ^:private ^Class most-common-object-type :- (s/maybe Class)
  "Given a sequence of tuples like [Class <number-of-occurances>] return the Class with the highest number of
  occurances. The basic idea here is to take a sample of values for a Field and then determine the most common type
  for its values, and use that as the Metabase base type. For example if we have a Field called `zip_code` and it's a
  number 90% of the time and a string the other 10%, we'll just call it a `:type/Number`."
  [field-types :- [(s/pair (s/maybe Class) "Class", s/Int "Int")]]
  (->> field-types
       (sort-by second)
       last
       first))

(defn- class->base-type [^Class klass]
  (if (isa? klass org.bson.types.ObjectId)
    :type/MongoBSONID
    (driver.common/class->base-type klass)))

(defn- describe-table-field [field-kw field-info idx]
  (let [most-common-object-type  (most-common-object-type (vec (:types field-info)))
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
       (:special-types field-info) (assoc :special-type (->> (:special-types field-info)
                                                             (filterv #(some? (first %)))
                                                             (sort-by second)
                                                             last
                                                             first))
       (:nested-fields field-info) (assoc :nested-fields nested-fields)) idx-next]))

(defmethod driver/describe-database :mongo
  [_ database]
  (with-mongo-connection [^com.mongodb.DB conn database]
    {:tables (set (for [collection (disj (mdb/get-collection-names conn) "system.indexes")]
                    {:schema nil, :name collection}))}))

(defn- table-sample-column-info
  "Sample the rows (i.e., documents) in `table` and return a map of information about the column keys we found in that
   sample. The results will look something like:

      {:_id      {:count 200, :len nil, :types {java.lang.Long 200}, :special-types nil, :nested-fields nil},
       :severity {:count 200, :len nil, :types {java.lang.Long 200}, :special-types nil, :nested-fields nil}}"
  [^com.mongodb.DB conn, table]
  (try
    (->> (mc/find-maps conn (:name table))
         (take metadata-queries/max-sample-rows)
         (reduce
          (fn [field-defs row]
            (loop [[k & more-keys] (keys row), fields field-defs]
              (if-not k
                fields
                (recur more-keys (update fields k (partial update-field-attrs (k row)))))))
          {}))
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

(doseq [feature [:basic-aggregations
                 :nested-fields
                 :native-parameters]]
  (defmethod driver/supports? [:mongo feature] [_ _] true))

(defmethod driver/mbql->native :mongo
  [_ query]
  (qp/mbql->native query))

(defmethod driver/execute-reducible-query :mongo
  [_ query context respond]
  (with-mongo-connection [_ (qp.store/database)]
    (execute/execute-reducible-query query context respond)))

(defmethod driver/substitute-native-parameters :mongo
  [driver inner-query]
  (parameters/substitute-native-parameters driver inner-query))

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
