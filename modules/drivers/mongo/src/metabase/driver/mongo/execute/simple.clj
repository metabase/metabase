(ns metabase.driver.mongo.execute.simple
  (:require
   [metabase.driver.mongo.execute.common :as mongo.execute.common]
   [metabase.driver.mongo.query-processor :as mongo.qp]
   [metabase.driver.mongo.util :as mongo.util :refer [*mongo-connection*]]
   [metabase.query-processor.context :as qp.context]
   [metabase.util.log :as log]
   [monger.conversion :as m.conversion]
   [monger.util :as m.util])
  (:import
   (com.mongodb AggregationOptions AggregationOptions$OutputMode Cursor DB)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

(defn- aggregation-options ^AggregationOptions [timeout-ms]
  ;; see https://mongodb.github.io/mongo-java-driver/3.7/javadoc/com/mongodb/AggregationOptions.Builder.html
  (.build (doto (AggregationOptions/builder)
            (.allowDiskUse mongo.execute.common/allow-disk-use)
            (.outputMode AggregationOptions$OutputMode/CURSOR)
            (.batchSize mongo.execute.common/batch-size)
            (.maxTime (int timeout-ms) TimeUnit/MILLISECONDS))))

(defn- ^:dynamic *aggregate*
  "Execute a MongoDB aggregation query."
  ^Cursor [^DB db ^String coll stages timeout-ms]
  (let [coll     (.getCollection db coll)
        agg-opts (aggregation-options timeout-ms)
        pipe     (m.util/into-array-list (m.conversion/to-db-object stages))]
    (.aggregate coll pipe agg-opts)))

(defn- reduce-results [native-query query context ^Cursor cursor respond]
  (try
    (let [first-row (when (.hasNext cursor)
                      (.next cursor))
          {row-col-names :row
           unescaped-col-names :unescaped}
          (mongo.execute.common/result-col-names native-query query (mongo.execute.common/row-keys first-row))]
      (log/tracef "Renaming columns in results %s -> %s" (pr-str row-col-names) (pr-str unescaped-col-names))
      (respond (mongo.execute.common/result-metadata unescaped-col-names)
               (if-not first-row
                 []
                 (let [post-processed (mongo.execute.common/post-process-row row-col-names)]
                   (mongo.execute.common/reducible-rows context cursor first-row post-processed)))))
    (finally
      (.close cursor))))

(defn execute-reducible-query
  "Executes a mongo query. Implementation is NOT using sessions and can NOT cancel an in-flight query."
  [{{:keys [collection query], :as native-query} :native} context respond]
  {:pre [(string? collection) (fn? respond)]}
  (let [query  (cond-> query
                 (string? query) mongo.qp/parse-query-string)
        cursor (*aggregate* *mongo-connection* collection query (qp.context/timeout context))]
    (reduce-results native-query query context cursor respond)))
