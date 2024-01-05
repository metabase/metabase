(ns metabase.driver.mongo.execute.session
  "This namespace is a result and should be temporary. until bla is solved on mongo side."
  (:require
   [clojure.core.async :as a]
   [metabase.driver.mongo.execute.common :as mongo.execute.common]
   [metabase.driver.mongo.query-processor :as mongo.qp]
   [metabase.driver.mongo.util :as mongo.util]
   [metabase.query-processor.context :as qp.context]
   [metabase.query-processor.error-type :as qp.error-type]
   [metabase.util.i18n :refer [tru]]
   [metabase.util.log :as log]
   [monger.conversion :as m.conversion]
   [monger.util :as m.util])
  (:import
   (com.mongodb BasicDBObject DB MongoClientException)
   (com.mongodb.client AggregateIterable ClientSession MongoDatabase MongoCursor)
   (java.util.concurrent TimeUnit)))

(set! *warn-on-reflection* true)

;;; +----------------------------------------------------------------------------------------------------------------+
;;; |                                                      Run                                                       |
;;; +----------------------------------------------------------------------------------------------------------------+

;; See https://mongodb.github.io/mongo-java-driver/3.12/javadoc/com/mongodb/client/AggregateIterable.html
(defn- init-aggregate!
  [^AggregateIterable aggregate
   ^java.lang.Long timeout-ms]
  (doto aggregate
    (.allowDiskUse mongo.execute.common/allow-disk-use)
    (.batchSize mongo.execute.common/batch-size)
    (.maxTime timeout-ms TimeUnit/MILLISECONDS)))

(defn- ^:dynamic *aggregate*
  [^MongoDatabase db
   ^String coll
   ^ClientSession session
   stages timeout-ms]
  (let [coll      (.getCollection db coll)
        pipe      (m.util/into-array-list (m.conversion/to-db-object stages))
        aggregate (.aggregate coll session pipe BasicDBObject)]
    (init-aggregate! aggregate timeout-ms)))

(defn- reduce-results [native-query query context ^MongoCursor cursor respond]
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
                 (mongo.execute.common/reducible-rows context cursor first-row post-processed))))))

(defn- connection->database
  ^MongoDatabase
  [^DB connection]
  (let [db-name (.getName connection)]
    (.. connection getMongoClient (getDatabase db-name))))

(defn- start-session!
  ^ClientSession
  [^DB connection]
  (.. connection getMongoClient startSession))

(defn- kill-session!
  [^MongoDatabase db
   ^ClientSession session]
  (let [session-id (.. session getServerSession getIdentifier)
        kill-cmd (BasicDBObject. "killSessions" [session-id])]
    (.runCommand db kill-cmd)))

(defn execute-reducible-query
  "Executes a mongo query. Implementation is using sessions and can cancel in-flight query."
  [{{query :query collection-name :collection :as native-query} :native} context respond]
  {:pre [(string? collection-name) (fn? respond)]}
  (let [query  (cond-> query
                 (string? query) mongo.qp/parse-query-string)
        client-database (connection->database mongo.util/*mongo-connection*)]
    (with-open [session ^ClientSession (start-session! mongo.util/*mongo-connection*)]
      (a/go
        (when (a/<! (qp.context/canceled-chan context))
          (kill-session! client-database session)))
      (let [aggregate ^AggregateIterable (*aggregate* client-database
                                                      collection-name
                                                      session
                                                      query
                                                      (qp.context/timeout context))]
        (with-open [^MongoCursor cursor (try (.cursor aggregate)
                                             (catch Throwable e
                                               (throw (ex-info (tru "Error executing query: {0}" (ex-message e))
                                                               {:driver :mongo
                                                                :native native-query
                                                                :type   qp.error-type/invalid-query}
                                                               e))))]
          (reduce-results native-query query context cursor respond))))))

(defn session-not-supported-ex?
  "Check whether exception signals missing support for `sessions` in mongo deployment."
  [e]
  (and (instance? MongoClientException e)
       ;; Original message throw was of a form:
       ;;   Sessions are not supported by the MongoDB cluster to which this client is connected
       (boolean (re-find #"Sessions.*not.*supported" (ex-message e)))))