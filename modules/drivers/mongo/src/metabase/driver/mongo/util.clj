(ns metabase.driver.mongo.util
  "Mongo specific utility functions -- mongo methods that we are using at various places wrapped into clojure
   functions. Aim of this namespace is not to wrap all of the method calls, but those that are used repeatedly.
   
   TODO !!!!! Proper docstring"
  (:require
   [metabase.driver.mongo.conversion :as mongo.conversion])
  (:import
   (com.mongodb MongoClientSettings)
   (com.mongodb.client FindIterable MongoClient MongoClients MongoCollection MongoDatabase)))

(set! *warn-on-reflection* true)

(defn mongo-client
  "Create client out of client settings."
  ^MongoClient [^MongoClientSettings settings]
  (MongoClients/create settings))

(defn close
  "Close client."
  [^MongoClient client]
  (.close client))

(defn database
  "Get database by its name from client."
  ^MongoDatabase
  [^MongoClient client db-name]
  (.getDatabase client db-name))

;; https://mongodb.github.io/mongo-java-driver/4.11/apidocs/mongodb-driver-sync/com/mongodb/client/MongoDatabase.html#runCommand(org.bson.conversions.Bson)
;; Returns Document
;; this should be consistent with the rest -- Ordered map!
;; TODO: keywordize!
(defn run-command
  "Run command. Return results"
  ;; TODO: default
  ([^MongoDatabase db cmd & opts]
   ;; Initializing opts bc just passing forward -- this is probably silly!
   (let [opts (merge {:keywordize true}
                     opts)
         cmd-doc (mongo.conversion/to-document cmd)]
     (-> (.runCommand db cmd-doc)
         (mongo.conversion/from-document opts)))))

(comment
  
  (defn x2 [opts]
    (:keywordize opts))

  (defn x1 [& {:or {keywordize true} :as opts}]
    (x2 opts))
  
  (x1)

  )

;; https://mongodb.github.io/mongo-java-driver/4.11/apidocs/mongodb-driver-sync/com/mongodb/client/MongoClient.html#listDatabaseNames()
;; returns MongoIterable<String>
(defn list-database-names
  "Return vector of names of databases for `client`."
  [^MongoClient client]
  (vec (.listDatabaseNames client)))

;; https://mongodb.github.io/mongo-java-driver/4.11/apidocs/mongodb-driver-sync/com/mongodb/client/MongoDatabase.html#listCollectionNames()
(defn list-collection-names [^MongoDatabase db]
  (vec (.listCollectionNames db)))

(defn collection
  ^MongoCollection
  [^MongoDatabase db coll-name]
  (.getCollection db coll-name))

;; https://mongodb.github.io/mongo-java-driver/4.11/apidocs/mongodb-driver-sync/com/mongodb/client/MongoCollection.html#listIndexes()
;; !!! TODO returns documents
(defn list-indexes
  "Return vector of Documets describing indexes."
  ([^MongoDatabase db coll-name]
   (list-indexes (collection db coll-name)))
  ([^MongoCollection coll]
   (vec (.listIndexes coll))))

;; TODO: mapv!
;; https://mongodb.github.io/mongo-java-driver/4.11/apidocs/mongodb-driver-sync/com/mongodb/client/MongoCollection.html#find()
(defn do-find [^MongoCollection coll
               & {:keys [limit skip batch-size sort-criteria] :as _opts}]
  (->> (cond-> ^FindIterable (.find coll)
         limit (.limit limit)
         skip (.skip skip)
         batch-size (.batchSize (int batch-size))
         sort-criteria (.sort (mongo.conversion/to-document sort-criteria)))
       (mapv #(mongo.conversion/from-document % true))))

(defn create-index
  "Create index. Returns nil"
  [^MongoCollection coll cmd-map]
  (.createIndex coll (mongo.conversion/to-document cmd-map)))

;; TODO to-document
(defn insert-one
  "Insert document into mongo collection."
  [^MongoCollection coll document-map]
  (.insertOne coll (mongo.conversion/to-document document-map)))
