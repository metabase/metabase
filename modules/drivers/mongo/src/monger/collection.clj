;; This source code is dual-licensed under the Apache License, version
;; 2.0, and the Eclipse Public License, version 1.0.
;;
;; The APL v2.0:
;;
;; ----------------------------------------------------------------------------------
;; Copyright (c) 2011-2018 Michael S. Klishin, Alex Petrov, and the ClojureWerkz Team
;; Copyright (c) 2012 Toby Hede
;; Copyright (c) 2012 Baishampayan Ghose
;;
;; Licensed under the Apache License, Version 2.0 (the "License");
;; you may not use this file except in compliance with the License.
;; You may obtain a copy of the License at
;;
;;     http://www.apache.org/licenses/LICENSE-2.0
;;
;; Unless required by applicable law or agreed to in writing, software
;; distributed under the License is distributed on an "AS IS" BASIS,
;; WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
;; See the License for the specific language governing permissions and
;; limitations under the License.
;; ----------------------------------------------------------------------------------
;;
;; The EPL v1.0:
;;
;; ----------------------------------------------------------------------------------
;; Copyright (c) 2011-2018 Michael S. Klishin, Alex Petrov, and the ClojureWerkz Team.
;; Copyright (c) 2012 Toby Hede
;; Copyright (c) 2012 Baishampayan Ghose
;;
;; All rights reserved.
;;
;; This program and the accompanying materials are made available under the terms of
;; the Eclipse Public License Version 1.0,
;; which accompanies this distribution and is available at
;; http://www.eclipse.org/legal/epl-v10.html.
;; ----------------------------------------------------------------------------------

(ns monger.collection
  "Provides key functionality for interaction with MongoDB: inserting, querying, updating and deleting documents, performing Aggregation Framework
   queries, creating and dropping indexes, creating collections and more.

   For more advanced read queries, see monger.query.

   Related documentation guides:

   * http://clojuremongodb.info/articles/getting_started.html
   * http://clojuremongodb.info/articles/inserting.html
   * http://clojuremongodb.info/articles/querying.html
   * http://clojuremongodb.info/articles/updating.html
   * http://clojuremongodb.info/articles/deleting.html
   * http://clojuremongodb.info/articles/aggregation.html"
  (:refer-clojure :exclude [find remove count drop distinct empty? any? update])
  (:import [com.mongodb Mongo DB DBCollection WriteResult DBObject WriteConcern
            DBCursor MapReduceCommand MapReduceCommand$OutputType AggregationOutput
            AggregationOptions AggregationOptions$OutputMode]
           [java.util List Map]
           [java.util.concurrent TimeUnit]
           [clojure.lang IPersistentMap ISeq]
           org.bson.types.ObjectId)
  (:require [monger.core :as mc]
            [monger.result :as mres]
            [monger.conversion :refer :all]
            [monger.constraints :refer :all]
            [monger.util :refer [into-array-list]]))


;;
;; API
;;

;;
;; monger.collection/insert
;;

(defn ^WriteResult insert
  "Saves document to collection and returns a write result monger.result/acknowledged?
   and related functions operate on. You can optionally specify a WriteConcern.

   In case you need the exact inserted document returned, with the :_id key generated,
   use monger.collection/insert-and-return instead."
  ([^DB db ^String coll document]
     (.insert (.getCollection db (name coll))
              (to-db-object document)
              ^WriteConcern mc/*mongodb-write-concern*))
  ([^DB db ^String coll document ^WriteConcern concern]
     (.insert (.getCollection db (name coll))
              (to-db-object document)
              concern)))


(defn ^clojure.lang.IPersistentMap insert-and-return
  "Like monger.collection/insert but returns the inserted document as a persistent Clojure map.

  If the :_id key wasn't set on the document, it will be generated and merged into the returned
  map."
  ([^DB db ^String coll document]
     (insert-and-return db coll document ^WriteConcern mc/*mongodb-write-concern*))
  ([^DB db ^String coll document ^WriteConcern concern]
     ;; MongoDB Java driver will generate the _id and set it but it
     ;; tries to mutate the inserted DBObject and it does not work
     ;; very well in our case, because that DBObject is short lived
     ;; and produced from the Clojure map we are passing in. Plus,
     ;; this approach is very awkward with immutable data structures
     ;; being the default. MK.
     (let [doc (merge {:_id (ObjectId.)} document)]
       (insert db coll doc concern)
       doc)))


(defn ^WriteResult insert-batch
  "Saves documents to collection. You can optionally specify WriteConcern as a third argument."
  ([^DB db ^String coll ^List documents]
     (.insert (.getCollection db (name coll))
              ^List (to-db-object documents)
              ^WriteConcern mc/*mongodb-write-concern*))
  ([^DB db ^String coll ^List documents ^WriteConcern concern]
     (.insert (.getCollection db (name coll))
              ^List (to-db-object documents)
              concern)))

;;
;; monger.collection/find
;;

(defn ^DBCursor find
  "Queries for objects in this collection.
   This function returns DBCursor, which allows you to iterate over DBObjects.
   If you want to manipulate clojure sequences maps, use find-maps."
  ([^DB db ^String coll]
     (.find (.getCollection db (name coll))))
  ([^DB db ^String coll ^Map ref]
     (.find (.getCollection db (name coll))
            (to-db-object ref)))
  ([^DB db ^String coll ^Map ref fields]
     (.find (.getCollection db (name coll))
            (to-db-object ref)
            (as-field-selector fields))))

(defn find-maps
  "Queries for objects in this collection.
   This function returns clojure Seq of Maps.
   If you want to work directly with DBObject, use find."
  ([^DB db ^String coll]
     (with-open [dbc (find db coll)]
       (map (fn [x] (from-db-object x true)) dbc)))
  ([^DB db ^String coll ^Map ref]
     (with-open [dbc (find db coll ref)]
       (map (fn [x] (from-db-object x true)) dbc)))
  ([^DB db ^String coll ^Map ref fields]
     (find-maps db coll ref fields true))
  ([^DB db ^String coll ^Map ref fields keywordize]
     (with-open [dbc (find db coll ref fields)]
       (map (fn [x] (from-db-object x keywordize)) dbc))))

(defn find-seq
  "Queries for objects in this collection, returns ISeq of DBObjects."
  ([^DB db ^String coll]
     (with-open [dbc (find db coll)]
       (seq dbc)))
  ([^DB db ^String coll ^Map ref]
     (with-open [dbc (find db coll ref)]
       (seq dbc)))
  ([^DB db ^String coll ^Map ref fields]
     (with-open [dbc (find db coll ref fields)]
       (seq dbc))))

;;
;; monger.collection/find-one
;;

(defn ^DBObject find-one
  "Returns a single DBObject from this collection matching the query."
  ([^DB db ^String coll ^Map ref]
     (.findOne (.getCollection db (name coll))
               (to-db-object ref)))
  ([^DB db ^String coll ^Map ref fields]
     (.findOne (.getCollection db (name coll))
               (to-db-object ref)
               ^DBObject (as-field-selector fields))))

(defn ^IPersistentMap find-one-as-map
  "Returns a single object converted to Map from this collection matching the query."
  ([^DB db ^String coll ^Map ref]
     (from-db-object ^DBObject (find-one db coll ref) true))
  ([^DB db ^String coll ^Map ref fields]
     (from-db-object ^DBObject (find-one db coll ref fields) true))
  ([^DB db ^String coll ^Map ref fields keywordize]
     (from-db-object ^DBObject (find-one db coll ref fields) keywordize)))


;;
;; monger.collection/find-and-modify
;;

(defn ^IPersistentMap find-and-modify
  "Atomically modify a document (at most one) and return it."
  ([^DB db ^String coll ^Map conditions ^Map document {:keys [fields sort remove return-new upsert keywordize] :or
                                                       {fields nil
                                                        sort nil
                                                        remove false
                                                        return-new false
                                                        upsert false
                                                        keywordize true}}]
     (let [coll (.getCollection db (name coll))
           maybe-fields (when fields (as-field-selector fields))
           maybe-sort (when sort (to-db-object sort))]
       (from-db-object
        ^DBObject (.findAndModify ^DBCollection coll (to-db-object conditions) maybe-fields maybe-sort remove
                                  (to-db-object document) return-new upsert) keywordize))))

;;
;; monger.collection/find-by-id
;;

(defn ^DBObject find-by-id
  "Returns a single object with matching _id field."
  ([^DB db ^String coll id]
     (check-not-nil! id "id must not be nil")
     (find-one db coll {:_id id}))
  ([^DB db ^String coll id fields]
     (check-not-nil! id "id must not be nil")
     (find-one db coll {:_id id} fields)))

(defn ^IPersistentMap find-map-by-id
  "Returns a single object, converted to map with matching _id field."
  ([^DB db ^String coll id]
     (check-not-nil! id "id must not be nil")
     (find-one-as-map db coll {:_id id}))
  ([^DB db ^String coll id fields]
     (check-not-nil! id "id must not be nil")
     (find-one-as-map db coll {:_id id} fields))
  ([^DB db ^String coll id fields keywordize]
     (check-not-nil! id "id must not be nil")
     (find-one-as-map db coll {:_id id} fields keywordize)))

;;
;; monger.collection/count
;;

(defn count
  "Returns the number of documents in this collection.

  Takes optional conditions as an argument."
  (^long [^DB db ^String coll]
         (.count (.getCollection db (name coll))))
  (^long [^DB db ^String coll ^Map conditions]
         (.count (.getCollection db (name coll)) (to-db-object conditions))))

(defn any?
  "Whether the collection has any items at all, or items matching query."
  ([^DB db ^String coll]
     (> (count db coll) 0))
  ([^DB db ^String coll ^Map conditions]
     (> (count db coll conditions) 0)))


(defn empty?
  "Whether the collection is empty."
  [^DB db ^String coll]
  (= (count db coll {}) 0))

;; monger.collection/update

(defn ^WriteResult update
  "Performs an update operation.

  Please note that update is potentially destructive operation. It updates document with the given set
  emptying the fields not mentioned in the new document. In order to only change certain fields, use
  \"$set\".

  You can use all the MongoDB modifier operations ($inc, $set, $unset, $push, $pushAll, $addToSet, $pop, $pull
  $pullAll, $rename, $bit) here as well.

  It also takes options, such as :upsert and :multi.
  By default :upsert and :multi are false."
  ([^DB db ^String coll ^Map conditions ^Map document]
     (update db coll conditions document {}))
  ([^DB db ^String coll ^Map conditions ^Map document {:keys [upsert multi write-concern]
                                                       :or {upsert false
                                                            multi false
                                                            write-concern mc/*mongodb-write-concern*}}]
     (.update (.getCollection db (name coll))
              (to-db-object conditions)
              (to-db-object document)
              upsert
              multi
              write-concern)))

(defn ^WriteResult upsert
  "Performs an upsert.

   This is a convenience function that delegates to monger.collection/update and
   sets :upsert to true.

   See monger.collection/update documentation"
  ([^DB db ^String coll ^Map conditions ^Map document]
     (upsert db coll conditions document {}))
  ([^DB db ^String coll ^Map conditions ^Map document {:keys [multi write-concern]
                                                       :or {multi false
                                                            write-concern mc/*mongodb-write-concern*}}]
     (update db coll conditions document {:multi multi :write-concern write-concern :upsert true})))

(defn ^WriteResult update-by-id
  "Update a document with given id"
  ([^DB db ^String coll id ^Map document]
     (update-by-id db coll id document {}))
  ([^DB db ^String coll id ^Map document {:keys [upsert write-concern]
                                          :or {upsert false
                                               write-concern mc/*mongodb-write-concern*}}]
     (check-not-nil! id "id must not be nil")
     (.update (.getCollection db (name coll))
              (to-db-object {:_id id})
              (to-db-object document)
              upsert
              false
              write-concern)))

(defn ^WriteResult update-by-ids
  "Update documents by given ids"
  ([^DB db ^String coll ids ^Map document]
     (update-by-ids db coll ids document {}))
  ([^DB db ^String coll ids ^Map document {:keys [upsert write-concern]
                                           :or {upsert false
                                                write-concern mc/*mongodb-write-concern*}}]
     (check-not-nil! (seq ids) "ids must not be nil or empty")
     (.update (.getCollection db (name coll))
              (to-db-object {:_id {"$in" ids}})
              (to-db-object document)
              upsert
              true
              write-concern)))


;; monger.collection/save

(defn ^WriteResult save
  "Saves an object to the given collection (does insert or update based on the object _id).

   If the object is not present in the database, insert operation will be performed.
   If the object is already in the database, it will be updated.

   This function returns write result. If you want to get the exact persisted document back,
   use `save-and-return`."
  ([^DB db ^String coll ^Map document]
     (.save (.getCollection db (name coll))
            (to-db-object document)
            mc/*mongodb-write-concern*))
  ([^DB db ^String coll ^Map document ^WriteConcern write-concern]
     (.save (.getCollection db (name coll))
            (to-db-object document)
            write-concern)))

(defn ^clojure.lang.IPersistentMap save-and-return
  "Saves an object to the given collection (does insert or update based on the object _id).

   If the object is not present in the database, insert operation will be performed.
   If the object is already in the database, it will be updated.

   This function returns the exact persisted document back, including the `:_id` key in
   case of an insert.

   If you want to get write result back, use `save`."
  ([^DB db ^String coll ^Map document]
     (save-and-return db coll document ^WriteConcern mc/*mongodb-write-concern*))
  ([^DB db ^String coll ^Map document ^WriteConcern write-concern]
     ;; see the comment in insert-and-return. Here we additionally need to make sure to not scrap the :_id key if
     ;; it is already present. MK.
     (let [doc (merge {:_id (ObjectId.)} document)]
       (save db coll doc write-concern)
       doc)))


;; monger.collection/remove

(defn ^WriteResult remove
  "Removes objects from the database."
  ([^DB db ^String coll]
     (.remove (.getCollection db (name coll)) (to-db-object {})))
  ([^DB db ^String coll ^Map conditions]
     (.remove (.getCollection db (name coll)) (to-db-object conditions))))


(defn ^WriteResult remove-by-id
  "Removes a single document with given id"
  [^DB db ^String coll id]
  (check-not-nil! id "id must not be nil")
  (let [coll (.getCollection db (name coll))]
    (.remove coll (to-db-object {:_id id}))))

(defn purge-many
  "Purges (removes all documents from) multiple collections. Intended
   to be used in test environments."
  [^DB db xs]
  (doseq [coll xs]
    (remove db coll)))

;;
;; monger.collection/create-index
;;

(defn create-index
  "Forces creation of index on a set of fields, if one does not already exists."
  ([^DB db ^String coll ^Map keys]
     (.createIndex (.getCollection db (name coll)) (as-field-selector keys)))
  ([^DB db ^String coll ^Map keys ^Map options]
     (.createIndex (.getCollection db (name coll))
                   (as-field-selector keys)
                   (to-db-object options))))


;;
;; monger.collection/ensure-index
;;

(defn ensure-index
  "Creates an index on a set of fields, if one does not already exist.
   This operation is inexpensive in the case when an index already exists.

   Options are:

   :unique (boolean) to create a unique index
   :name (string) to specify a custom index name and not rely on the generated one"
  ([^DB db ^String coll ^Map keys]
     (.createIndex (.getCollection db (name coll)) (as-field-selector keys)))
  ([^DB db ^String coll ^Map keys ^Map options]
     (.createIndex (.getCollection db (name coll))
                   (as-field-selector keys)
                   (to-db-object options)))
  ([^DB db ^String coll ^Map keys ^String index-name unique?]
     (.createIndex (.getCollection db (name coll))
                   (as-field-selector keys)
                   index-name
                   unique?)))


;;
;; monger.collection/indexes-on
;;

(defn indexes-on
  "Return a list of the indexes for this collection."
  [^DB db ^String coll]
  (from-db-object (.getIndexInfo (.getCollection db (name coll))) true))


;;
;; monger.collection/drop-index
;;

(defn drop-index
  "Drops an index from this collection."
  [^DB db ^String coll idx]
  (if (string? idx)
    (.dropIndex (.getCollection db (name coll)) ^String idx)
    (.dropIndex (.getCollection db (name coll)) (to-db-object idx))))

(defn drop-indexes
  "Drops all indixes from this collection."
  [^DB db ^String coll]
  (.dropIndexes (.getCollection db (name coll))))


;;
;; monger.collection/exists?, /create, /drop, /rename
;;


(defn exists?
  "Checks whether collection with certain name exists."
  ([^DB db ^String coll]
     (.collectionExists db coll)))

(defn create
  "Creates a collection with a given name and options.

   Options are:

   :capped (pass true to create a capped collection)
   :max (number of documents)
   :size (max allowed size of the collection, in bytes)"
  [^DB db ^String coll ^Map options]
  (.createCollection db coll (to-db-object options)))

(defn drop
  "Deletes collection from database."
  [^DB db ^String coll]
  (.drop (.getCollection db (name coll))))

(defn rename
  "Renames collection."
  ([^DB db ^String from, ^String to]
     (.rename (.getCollection db (name from)) (name to)))
  ([^DB db ^String from ^String to drop-target?]
     (.rename (.getCollection db (name from)) (name to) drop-target?)))

;;
;; Map/Reduce
;;

(defn map-reduce
  "Performs a map reduce operation"
  ([^DB db ^String coll ^String js-mapper ^String js-reducer ^String output ^Map query]
     (let [coll (.getCollection db (name coll))]
       (.mapReduce coll js-mapper js-reducer output (to-db-object query))))
  ([^DB db ^String coll ^String js-mapper ^String js-reducer ^String output ^MapReduceCommand$OutputType output-type ^Map query]
     (let [coll (.getCollection db (name coll))]
       (.mapReduce coll js-mapper js-reducer output output-type (to-db-object query)))))


;;
;; monger.collection/distinct
;;

(defn distinct
  "Finds distinct values for a key"
  ([^DB db ^String coll ^String key]
     (.distinct (.getCollection db (name coll)) ^String (to-db-object key)))
  ([^DB db ^String coll ^String key ^Map query]
     (.distinct (.getCollection db (name coll)) ^String (to-db-object key) (to-db-object query))))


;;
;; Aggregation
;;

(defn- build-aggregation-options
  ^AggregationOptions
  [{:keys [^Boolean allow-disk-use cursor ^Long max-time]}]
  (cond-> (AggregationOptions/builder)
     allow-disk-use       (.allowDiskUse allow-disk-use)
     cursor               (.outputMode AggregationOptions$OutputMode/CURSOR)
     max-time             (.maxTime max-time TimeUnit/MILLISECONDS)
     (:batch-size cursor) (.batchSize (int (:batch-size cursor)))
     true                 .build))

(defn aggregate
  "Executes an aggregation query. MongoDB 2.2+ only.
   Accepts the options :allow-disk-use and :cursor (a map with the :batch-size
   key), as described in the MongoDB manual. Additionally, the :max-time option
  is supported, for specifying a limit on the execution time of the query in
  milliseconds.

  :keywordize option that control if resulting map keys will be turned into keywords, default is true.

  See http://docs.mongodb.org/manual/applications/aggregation/ to learn more."
  [^DB db ^String coll stages & opts]
  (let [coll (.getCollection db (name coll))
        agg-opts (build-aggregation-options opts)
        pipe (into-array-list (to-db-object stages))
        res (.aggregate coll pipe agg-opts)
        {:keys [^Boolean keywordize]
         :or            {keywordize true}} opts]
    (map #(from-db-object % keywordize) (iterator-seq res))))

(defn explain-aggregate
  "Returns the explain plan for an aggregation query. MongoDB 2.2+ only.

  See http://docs.mongodb.org/manual/applications/aggregation/ to learn more."
  [^DB db ^String coll stages & opts]
  (let [coll (.getCollection db (name coll))
        agg-opts (build-aggregation-options opts)
        pipe (into-array-list (to-db-object stages))
        res (.explainAggregate coll pipe agg-opts)]
    (from-db-object res true)))
;;
;; Misc
;;

(def ^{:const true}
  system-collection-pattern #"^(system|fs)")

(defn system-collection?
  "Evaluates to true if the given collection name refers to a system collection. System collections
   are prefixed with system. or fs. (default GridFS collection prefix)"
  [^String coll]
  (re-find system-collection-pattern coll))
