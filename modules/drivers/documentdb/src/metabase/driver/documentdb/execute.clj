(ns metabase.driver.documentdb.execute
  "Execution of native DocumentDB aggregation pipelines."
  (:refer-clojure :exclude [mapv not-empty])
  (:require
   [clojure.string :as str]
   [java-time.api :as t]
   [metabase.driver-api.core :as driver-api]
   [metabase.driver.documentdb.connection :as documentdb.connection]
   [metabase.driver.settings :as driver.settings]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.performance :refer [mapv not-empty]])
  (:import
   (com.mongodb.client AggregateIterable MongoCursor MongoDatabase)
   (java.nio ByteBuffer)
   (java.time.temporal Temporal)
   (java.util ArrayList Base64 Collection Date List Map UUID)
   (java.util.concurrent TimeUnit)
   (org.bson BsonArray BsonValue Document)
   (org.bson.types Binary BSONTimestamp Decimal128 ObjectId)))

(set! *warn-on-reflection* true)

(declare to-bson)

(defn- temporal->date
  [value]
  (let [instant (cond
                  (t/instant? value) value
                  (t/local-date? value) (t/instant (t/zoned-date-time value
                                                                      (t/local-time "00:00")
                                                                      (t/zone-id "UTC")))
                  (t/local-date-time? value) (t/instant value (t/zone-id "UTC"))
                  (t/zoned-date-time? value) (t/instant value)
                  (t/offset-date-time? value) (t/instant value)
                  :else (throw (ex-info (tru "Unsupported temporal value {0}." (class value))
                                        {:value value})))]
    (Date/from instant)))

(defn- to-bson
  [value]
  (cond
    (instance? Map value)
    (let [document (Document.)]
      (doseq [[k v] value]
        (.put document (if (keyword? k) (name k) (str k)) (to-bson v)))
      document)

    (instance? Collection value)
    (ArrayList. ^Collection (mapv to-bson value))

    (instance? Temporal value)
    (temporal->date value)

    (ratio? value)
    (double value)

    :else value))

(defn- parse-pipeline
  [query]
  (try
    (let [pipeline (if (string? query)
                     (mapv (fn [^BsonValue value]
                             (-> value .asDocument .toJson Document/parse))
                           (BsonArray/parse query))
                     query)]
      (when-not (sequential? pipeline)
        (throw (ex-info (tru "A DocumentDB native query must be an aggregation pipeline array.")
                        {:query query})))
      (mapv to-bson pipeline))
    (catch Throwable e
      (throw (ex-info (tru "Unable to parse DocumentDB query: {0}" (ex-message e))
                      {:type driver-api/qp.error-type.invalid-query
                       :query query}
                      e)))))

(defn- binary-value
  [^Binary value]
  (if (= (.getType value) (byte 4))
    (let [buffer (ByteBuffer/wrap (.getData value))]
      (UUID. (.getLong buffer) (.getLong buffer)))
    (.encodeToString (Base64/getEncoder) (.getData value))))

(declare from-bson)

(defn- from-bson
  [value]
  (cond
    (instance? Decimal128 value) (.bigDecimalValue ^Decimal128 value)
    (instance? Date value) (.toInstant ^Date value)
    (instance? ObjectId value) (.toHexString ^ObjectId value)
    (instance? BSONTimestamp value) (java.time.Instant/ofEpochSecond (.getTime ^BSONTimestamp value))
    (instance? Binary value) (binary-value value)
    (instance? Map value) (into {} (map (fn [[k v]] [k (from-bson v)])) value)
    (instance? List value) (mapv from-bson value)
    :else value))

(defn- nested-value
  [^Document row column-name]
  (reduce (fn [value path-part]
            (when (instance? Map value)
              (.get ^Map value path-part)))
          row
          (str/split column-name #"\.")))

(defn- row-values
  [column-names ^Document row]
  (mapv #(from-bson (nested-value row %)) column-names))

(defn- reducible-rows
  [^MongoCursor cursor first-row column-names]
  (let [first? (volatile! true)]
    (driver-api/reducible-rows
     (fn []
       (if @first?
         (do
           (vreset! first? false)
           (row-values column-names first-row))
         (when (.hasNext cursor)
           (row-values column-names (.next cursor)))))
     (driver-api/canceled-chan))))

(defn- result-columns
  [projections ^Document first-row]
  (or (seq projections)
      (some-> first-row .keySet vec)
      []))

(defn execute-reducible-query
  "Executes a native aggregation pipeline and streams its rows to `respond`."
  [{{:keys [collection projections query] :as native-query} :native} respond]
  (when-not (and (string? collection) (not-empty collection))
    (throw (ex-info (tru "A collection is required for a DocumentDB native query.")
                    {:type driver-api/qp.error-type.invalid-query})))
  (let [pipeline (parse-pipeline query)]
    (documentdb.connection/do-with-database
     (fn [^MongoDatabase database]
       (let [^AggregateIterable aggregate (doto (.aggregate (.getCollection database collection)
                                                            (ArrayList. ^Collection pipeline))
                                            (.batchSize 100)
                                            (.maxTime driver.settings/*query-timeout-ms* TimeUnit/MILLISECONDS))]
         (with-open [^MongoCursor cursor (try
                                           (.cursor aggregate)
                                           (catch Throwable e
                                             (throw (ex-info (tru "Error executing DocumentDB query: {0}"
                                                                  (ex-message e))
                                                             {:type driver-api/qp.error-type.invalid-query
                                                              :native native-query}
                                                             e))))]
           (let [first-row    (when (.hasNext cursor) (.next cursor))
                 column-names (vec (result-columns projections first-row))
                 metadata     {:cols (mapv (fn [column-name] {:name column-name}) column-names)}]
             (respond metadata
                      (if first-row
                        (reducible-rows cursor first-row column-names)
                        []))))))
     (driver-api/database (driver-api/metadata-provider)))))
