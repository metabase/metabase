(ns metabase.driver.documentdb
  "Driver for the open-source DocumentDB MongoDB-wire endpoint."
  (:refer-clojure :exclude [empty? mapv])
  (:require
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.documentdb.connection :as documentdb.connection]
   [metabase.driver.documentdb.execute :as documentdb.execute]
   [metabase.driver.documentdb.query-processor :as documentdb.qp]
   [metabase.driver.settings :as driver.settings]
   [metabase.util.json :as json]
   [metabase.util.log :as log]
   [metabase.util.performance :refer [empty? mapv]])
  (:import
   (com.mongodb ConnectionString MongoCommandException MongoSecurityException)
   (com.mongodb.client FindIterable MongoDatabase)
   (java.util Date List Map UUID)
   (org.bson Document)
   (org.bson.types Binary BSONTimestamp Decimal128 ObjectId)))

(set! *warn-on-reflection* true)

(driver/register! :documentdb)

(defmethod driver/routes-connection-through-ssh-tunnel? :documentdb [_driver] true)

(defmethod driver/connection-hosts :documentdb
  [_driver {:keys [use-conn-uri host] :as details}]
  (if use-conn-uri
    (driver/hosts-from-details
     {:host (str/join "," (.getHosts (ConnectionString. (documentdb.connection/details->connection-string details))))}
     [:host])
    (driver/hosts-from-details {:host (or host "localhost")} [:host])))

(defmethod driver/can-connect? :documentdb
  [_driver details]
  (try
    (documentdb.connection/do-with-database
     (fn [^MongoDatabase database]
       (= 1.0 (double (.get ^Document (.runCommand database (Document. "ping" 1)) "ok"))))
     details)
    (catch MongoSecurityException e
      (if (instance? MongoCommandException (ex-cause e))
        (throw (ex-cause e))
        (throw e)))))

(defmethod driver/humanize-connection-error-message :documentdb
  [_driver messages]
  (let [message (first messages)]
    (cond
      (re-matches #"^Timed out after \d+ ms while waiting for a server .*$" message)
      :cannot-connect-check-host-and-port

      (re-find #"PKIX path building failed" message)
      :certificate-not-trusted

      (re-find #"SSLHandshakeException" message)
      :requires-ssl

      :else
      message)))

(defmethod driver/sync-in-context :documentdb
  [_driver database sync-fn]
  (documentdb.connection/do-with-client (fn [_client] (sync-fn)) database))

(defmethod driver/dbms-version :documentdb
  [_driver database]
  (documentdb.connection/do-with-database
   (fn [^MongoDatabase db]
     (let [build-info (.runCommand db (Document. "buildInfo" 1))
           version    (.getString build-info "version")]
       {:version version
        :semantic-version (some->> version
                                   (re-find #"^\d+(?:\.\d+)*")
                                   (re-seq #"\d+")
                                   (mapv parse-long))}))
   database))

(defmethod driver/describe-database* :documentdb
  [_driver database]
  (documentdb.connection/do-with-database
   (fn [^MongoDatabase db]
     {:tables (into #{}
                    (comp (remove #(.startsWith ^String % "system."))
                          (map (fn [collection-name]
                                 {:schema nil :name collection-name})))
                    (.listCollectionNames db))})
   database))

(defn- bson-database-type
  [value]
  (cond
    (string? value)              "string"
    (instance? Boolean value)    "bool"
    (instance? Integer value)    "int"
    (instance? Long value)       "long"
    (instance? Float value)      "double"
    (instance? Double value)     "double"
    (instance? Decimal128 value) "decimal"
    (instance? ObjectId value)   "objectId"
    (instance? Date value)          "date"
    (instance? BSONTimestamp value) "timestamp"
    (and (instance? Binary value)
         (= (.getType ^Binary value) (byte 4))) "uuid"
    (instance? Binary value)     "binData"
    (instance? UUID value)       "uuid"
    (instance? Map value)        "object"
    (or (sequential? value)
        (instance? List value))  "array"
    :else                        "unknown"))

(defn- base-type
  [types]
  (if (= 1 (count types))
    (get {"array"     :type/Array
          "binData"   :type/MongoBinData
          "bool"      :type/Boolean
          "date"      :type/Instant
          "decimal"   :type/Decimal
          "double"    :type/Float
          "int"       :type/Integer
          "long"      :type/Integer
          "object"    :type/Dictionary
          "objectId"  :type/MongoBSONID
          "string"    :type/Text
          "timestamp" :type/Instant
          "uuid"      :type/UUID}
         (first types)
         :type/*)
    :type/*))

(declare inferred-fields)

(defn- inferred-field
  [field-name values position ancestor-path depth remaining-fields]
  (let [present-values (remove nil? values)
        types          (set (map bson-database-type present-values))
        maps           (filter #(instance? Map %) present-values)
        nested-fields  (when (and (< depth 7) (seq maps) (pos? @remaining-fields))
                         (inferred-fields maps (conj ancestor-path field-name) (inc depth) remaining-fields))]
    (cond-> {:name field-name
             :database-position position
             :database-type (cond
                              (empty? types) "null"
                              (= 1 (count types)) (first types)
                              :else "mixed")
             :base-type (base-type types)}
      (seq ancestor-path) (assoc :nfc-path (conj ancestor-path field-name))
      (and (empty? ancestor-path) (= field-name "_id")) (assoc :pk? true)
      (seq nested-fields) (assoc :nested-fields nested-fields :visibility-type :details-only))))

(defn- inferred-fields
  ([documents ancestor-path]
   (inferred-fields documents ancestor-path 0 (atom (driver.settings/sync-max-fields-per-table))))
  ([documents ancestor-path depth remaining-fields]
   (let [field-names (->> documents
                          (mapcat #(.keySet ^Map %))
                          distinct
                          (take @remaining-fields))]
     (into #{}
           (map-indexed
            (fn [position field-name]
              (swap! remaining-fields dec)
              (inferred-field field-name
                              (map #(.get ^Map % field-name) documents)
                              position
                              ancestor-path
                              depth
                              remaining-fields)))
           field-names))))

(defn- sample-documents
  [^MongoDatabase database collection-name]
  (let [^FindIterable results (-> (.getCollection database collection-name)
                                  .find
                                  (.limit 1000))]
    (into [] results)))

(defmethod driver/describe-table :documentdb
  [_driver database table]
  (documentdb.connection/do-with-database
   (fn [^MongoDatabase db]
     {:schema nil
      :name (:name table)
      :fields (inferred-fields (sample-documents db (:name table)) [])})
   database))

(doseq [[feature supported?] {:basic-aggregations                   true
                              :database-routing                     true
                              :expressions                          false
                              :identifiers-with-spaces              true
                              :index-info                           false
                              :metadata/key-constraints             false
                              :native-parameter-card-reference      false
                              :native-parameters                    false
                              :native-requires-specified-collection true
                              :nested-fields                        true
                              :schemas                              false
                              :set-timezone                         false
                              :standard-deviation-aggregations      false}]
  (defmethod driver/database-supports? [:documentdb feature] [_driver _feature _database] supported?))

(defmethod driver/mbql->native :documentdb
  [_driver query]
  (documentdb.qp/mbql->native query))

(defmethod driver/execute-reducible-query :documentdb
  [_driver query _context respond]
  (documentdb.execute/execute-reducible-query query respond))

(defmethod driver/db-start-of-week :documentdb [_driver] :sunday)

(defmethod driver/prettify-native-form :documentdb
  [_driver native-form]
  (try
    (json/encode (if (string? native-form) (json/decode native-form) native-form) {:pretty true})
    (catch Throwable e
      (log/debug e "Could not format DocumentDB native query.")
      native-form)))
