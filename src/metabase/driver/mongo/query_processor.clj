(ns metabase.driver.mongo.query-processor
  (:refer-clojure :exclude [find sort])
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]
            [colorize.core :as color]
            (monger [collection :as mc]
                    [core :as mg]
                    [db :as mdb]
                    [operators :refer :all]
                    [query :refer :all])
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            [metabase.driver.query-processor :as qp :refer [*query*]]
            [metabase.driver.mongo.util :refer [with-mongo-connection *mongo-connection* values->base-type]]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]]))
  (:import (com.mongodb CommandResult
                        DBApiLayer)
           (clojure.lang PersistentArrayMap)))

(declare apply-clause
         annotate-native-results
         annotate-results
         eval-raw-command
         field-id->kw
         process-structured
         process-and-run-structured)

;; # DRIVER QP INTERFACE

(defn process-and-run [{query-type :type database-id :database :as query}]
  (with-mongo-connection [_ (sel :one :fields [Database :details] :id database-id)]
    (case (keyword query-type)
      :query (let [generated-query (process-structured (:query query))]
               (when-not qp/*disable-qp-logging*
                 (log/debug (color/magenta "\n******************** Generated Monger Query: ********************\n"
                                           (with-out-str (clojure.pprint/pprint generated-query))
                                           "*****************************************************************\n")))
               (->> (eval generated-query)
                    (annotate-results (:query query))))
      :native (->> (eval-raw-command (:query (:native query)))
                   annotate-native-results))))


;; # NATIVE QUERY PROCESSOR

(defn eval-raw-command
  "Evaluate raw MongoDB javascript code. This must be ran insided the body of a `with-mongo-connection`.
    (with-mongo-connection [_ \"mongodb://localhost/test\"]
      (eval-raw-command \"db.zips.findOne()\"))
      -> {\"_id\" \"01001\", \"city\" \"AGAWAM\", ...}"
  [^String command]
  (assert *mongo-connection* "eval-raw-command must be ran inside the body of with-mongo-connection.")
  (let [^CommandResult result (.doEval ^DBApiLayer *mongo-connection* command nil)]
      (when-not (.ok result)
        (throw (.getException result)))
      (let [{result "retval"} (PersistentArrayMap/create (.toMap result))]
        result)))

(defn annotate-native-results
  "Package up the results in the way the frontend expects."
  [results]
  (if-not (sequential? results) (annotate-native-results [results])
          {:status :completed
           :row_count (count results)
           :data {:rows results
                  :columns (keys (first results))}}))


;; # STRUCTURED QUERY PROCESSOR

;; ## AGGREGATION IMPLEMENTATIONS

(def ^:private aggregations (atom '()))

(def ^:dynamic *collection-name* nil)
(def ^:dynamic *constraints* nil)

(defmacro defaggregation [match-binding & body]
  `(swap! aggregations concat
          (quote [~match-binding (try
                                   ~@body
                                   (catch Throwable e#
                                     (println (color/red ~(format "Failed to apply aggregation %s: " match-binding)
                                                         e#))))])))

(defn aggregate [& forms]
  `(mc/aggregate *mongo-connection* ~*collection-name* [~@(when *constraints*
                                                         [{$match *constraints*}])
                                                     ~@forms]))

(defn field-id->$string [field-id]
  (format "$%s" (name (field-id->kw field-id))))


(defaggregation ["rows"]
  `(doall (with-collection *mongo-connection* ~*collection-name*
            ~@(when *constraints* [`(find ~*constraints*)])
            ~@(mapcat apply-clause *query*))))

(defaggregation ["count"]
  `[{:count (mc/count *mongo-connection* ~*collection-name*
                      ~*constraints*)}])

(defaggregation ["avg" field-id]
  (aggregate {$group {"_id" nil
                      "avg" {$avg (field-id->$string field-id)}}}))

(defaggregation ["count" field-id]
  (aggregate {$match {(field-id->kw field-id) {$exists true}}}
             {$group {"_id" nil
                      "count" {$sum 1}}}
             {$project {"_id" false, "count" true}}))

(defaggregation ["distinct" field-id]
  (aggregate {$group {"_id" (field-id->$string field-id)}}
             {$group {"_id" nil
                      "count" {$sum 1}}}
             {$project {"_id" false, "count" true}}))

(defaggregation ["stddev" field-id]
  nil) ; TODO

(defaggregation ["sum" field-id]
  (aggregate {$group {"_id" nil ; TODO - I don't think this works for _id
                      "sum" {$sum (field-id->$string field-id)}}}
             {$project {"_id" false, "sum" true}}))

;; (def db
;;   (delay (sel :one Database :engine "mongo" :name "Mongo Test")))

;; (def users-table
;;   (delay (sel :one Table :name "users" :db_id (:id @db))))

;; (def users-id-field
;;   (delay (sel :one Field :name "_id" :table_id (:id @users-table))))


;; (defn x []
;;   (driver/process-query
;;    {:type     :query
;;     :database (:id @db)
;;     :query    {:limit nil,
;;                :source_table (:id @users-table)
;;                :filter [nil nil],
;;                :breakout [nil],
;;                :aggregation ["cum_sum" (:id @users-id-field)]}}))

(defmacro match-aggregation [aggregation]
  `(match ~aggregation
     ~@@aggregations
     ~'_ nil))

(defn process-structured [{:keys [source_table aggregation] :as query}]
  (binding [*collection-name* (sel :one :field [Table :name] :id source_table)
            *constraints* (when-let [filter-clause (:filter query)]
                            (apply-clause [:filter filter-clause]))
            *query* (dissoc query :filter)]
    (match-aggregation aggregation)))


;; ## ANNOTATION

(defn annotate-results [{:keys [source_table] :as query} results]
  {:pre [(integer? source_table)]}
  (let [field-name->field (sel :many :field->obj [Field :name] :table_id source_table)
        column-keys       (qp/order-columns {:query query} (keys (first results)))
        column-names      (map name column-keys)]
    {:row_count (count results)
     :status :completed
     :data {:columns column-names
            :cols (qp/get-column-info {:query query} column-names)
            :rows (map #(map % column-keys)
                       results)}}))


;; ## CLAUSE APPLICATION 2.0

(def field-id->kw
  (memoize
   (fn [field-id]
     (keyword (sel :one :field [Field :name] :id field-id)))))

(def clauses (atom '()))

(defmacro defclause [clause match-binding & body]
  `(swap! clauses concat '[[~clause ~match-binding] (try
                                                      ~@body
                                                      (catch Throwable e#
                                                        (println (color/red ~(format "Failed to process clause [%s %s]: " clause match-binding)
                                                                            (.getMessage e#)))))]))

;; ### CLAUSE DEFINITIONS

;; ### breakout (TODO)
(defclause :breakout field-ids
  nil)

;; #### cum_sum
;; Don't need to do anything here <3
(defclause :cum_sum _
  nil)

;; ### fields
;; TODO - this still returns _id, even if we don't ask for it :/
(defclause :fields field-ids
  `[(fields ~(mapv field-id->kw field-ids))])


;; ### filter
;; !!! SPECIAL CASE - since this is used in a different way by the different aggregation options
;; we just return a "constraints" map

(defclause :filter ["INSIDE" lat-field-id lon-field-id lat-max lon-min lat-min lon-max]
  (let [lat-field (field-id->kw lat-field-id)
        lon-field (field-id->kw lon-field-id)]
    {$and [{lat-field {$gte lat-min, $lte lat-max}}
           {lon-field {$gte lon-min, $lte lon-max}}]}))

(defclause :filter ["IS_NULL" field-id]
  {(field-id->kw field-id) {$exists false}})

(defclause :filter ["NOT_NULL" field-id]
  {(field-id->kw field-id) {$exists true}})

(defclause :filter ["BETWEEN" field-id min max]
  {(field-id->kw field-id) {$gte min
                            $lte max}})
(defclause :filter ["=" field-id value]
  {(field-id->kw field-id) value})

(defclause :filter ["!=" field-id value]
  {(field-id->kw field-id) {$ne value}})

(defclause :filter ["<" field-id value]
  {(field-id->kw field-id) {$lt value}})

(defclause :filter [">" field-id value]
  {(field-id->kw field-id) {$gt value}})

(defclause :filter ["<=" field-id value]
  {(field-id->kw field-id) {$lte value}})

(defclause :filter [">=" field-id value]
  {(field-id->kw field-id) {$gte value}})

(defclause :filter ["AND" & subclauses]
  {$and (mapv #(apply-clause [:filter %]) subclauses)})

(defclause :filter ["OR" & subclauses]
  {$or (mapv #(apply-clause [:filter %]) subclauses)})


;; ### limit

(defclause :limit value
  `[(limit ~value)])

;; ### order_by
(defclause :order_by field-dir-pairs
  (let [sort-options (mapcat (fn [[field-id direction]]
                               [(field-id->kw field-id) (case (keyword direction)
                                                          :ascending 1
                                                          :descending -1)])
                             field-dir-pairs)]
    (when (seq sort-options)
      `[(sort (array-map ~@sort-options))])))

;; ### page
(defclause :page page-clause
  (let [{page-num :page items-per-page :items} page-clause
        num-to-skip (* (dec page-num) items-per-page)]
    `[(skip ~num-to-skip)
      (limit ~items-per-page)]))


;; ### APPLY-CLAUSE

(defmacro match-clause [clause]
  `(match ~clause
     ~@@clauses
     ~'_ nil))

(defn apply-clause [clause]
  (match-clause clause))
