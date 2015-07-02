(ns metabase.driver.mongo.query-processor
  (:refer-clojure :exclude [find sort])
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [colorize.core :as color]
            (monger [collection :as mc]
                    [core :as mg]
                    [db :as mdb]
                    [operators :refer :all]
                    [query :refer :all])
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.driver [interface :as i]
                             [query-processor :as qp])
            [metabase.driver.mongo.util :refer [with-mongo-connection *mongo-connection* values->base-type]]
            [metabase.models.field :refer [Field]]
            [metabase.util :as u])
  (:import (com.mongodb CommandResult
                        DBApiLayer)
           (clojure.lang PersistentArrayMap)
           (org.bson.types ObjectId)))

(declare apply-clause
         eval-raw-command
         process-structured
         process-and-run-structured)


;; # DRIVER QP INTERFACE

(def ^:dynamic ^:private *query* nil)

(defn process-and-run
  "Process and run a MongoDB QUERY."
  [{query-type :type, database :database, :as query}]
  (binding [*query* query]
    (with-mongo-connection [_ database]
      (case (keyword query-type)
        :query (let [generated-query (process-structured (:query query))]
                 (when-not qp/*disable-qp-logging*
                   (log/debug (u/format-color 'green "\nMONGER FORM:\n\n%s\n"
                                              (->> generated-query
                                                   (walk/postwalk #(if (symbol? %) (symbol (name %)) %)) ; strip namespace qualifiers from Monger form
                                                   u/pprint-to-str) "\n")))                              ; so it's easier to read
                 {:results (eval generated-query)})
        :native (let [results (eval-raw-command (:query (:native query)))]
                  {:results (if (sequential? results) results
                                [results])})))))


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


;; # STRUCTURED QUERY PROCESSOR

;; ## AGGREGATION IMPLEMENTATIONS

(def ^:dynamic *collection-name*
  "String name of the collection (i.e., `Table`) that we're currently querying against."
  nil)
(def ^:dynamic *constraints*
  "Monger clauses generated from query dict `filter` clauses; bound dynamically so we can insert these as appropriate for various types of aggregations."
  nil)

(defn aggregate
  "Generate a Monger `aggregate` form."
  [& forms]
  `(mc/aggregate ^DBApiLayer *mongo-connection* ~*collection-name* [~@(when *constraints*
                                                                        [{$match *constraints*}])
                                                                    ~@(filter identity forms)]))

(defn- field->name
  [{:keys [field-name subfield]}]
  (if subfield (format "%s.%s" field-name subfield)
      field-name))

(defn- field->$str
  "Given a FIELD, return a `$`-qualified field name for use in a Mongo aggregate query, e.g. `\"$user_id\"`."
  [field]
  (format "$%s" (name (field->name field))))

(defn- aggregation:rows []
  `(doall (with-collection ^DBApiLayer *mongo-connection* ~*collection-name*
            ~@(when *constraints* [`(find ~*constraints*)])
            ~@(mapcat apply-clause (dissoc (:query *query*) :filter)))))

(defn- aggregation:count
  ([]
   `[{:count (mc/count ^DBApiLayer *mongo-connection* ~*collection-name*
                       ~*constraints*)}])
  ([field]
   `[{:count (mc/count ^DBApiLayer *mongo-connection* ~*collection-name*
                       (merge ~*constraints*
                              {(field->name field) {$exists true}}))}]))

(defn- aggregation:avg [field]
  (aggregate {$group {"_id" nil
                      "avg" {$avg (field->$str field)}}}
             {$project {"_id" false, "avg" true}}))

(defn- aggregation:distinct [field]
  ;; Unfortunately trying to do a MongoDB distinct aggregation runs out of memory if there are more than a few thousand values
  ;; because Monger currently doesn't expose any way to enable allowDiskUse in aggregations
  ;; (see https://groups.google.com/forum/#!searchin/clojure-mongodb/$2BallowDiskUse/clojure-mongodb/3qT34rZSFwQ/tYCxj5coo8gJ).
  ;;
  ;; We also can't effectively limit the number of values considered in the aggregation meaning simple things like determining categories
  ;; in sync (which only needs to know if distinct count is < 40, meaning it can theoretically stop as soon as it sees the 40th value)
  ;; will still barf on large columns.
  ;;
  ;; It's faster and better-behaved to just implement this logic in Clojure-land for the time being.
  ;; Since it's lazy we can handle large data sets (I've ran this successfully over 500,000+ document collections w/o issue).
  [{:count (let [values       (transient (set []))
                 limit        (:limit (:query *query*))
                 keep-taking? (if limit (fn [_]
                                          (< (count values) limit))
                                  (constantly true))]
             (->> (i/field-values-lazy-seq @(ns-resolve 'metabase.driver.mongo 'driver) (sel :one Field :id (:field-id field))) ; resolve driver at runtime to avoid circular deps
                  (filter identity)
                  (map hash)
                  (map #(conj! values %))
                  (take-while keep-taking?)
                  dorun)
             (count values))}])

(defn- aggregation:sum [field]
  (aggregate {$group {"_id" nil ; TODO - I don't think this works for _id
                      "sum" {$sum (field->$str field)}}}
             {$project {"_id" false, "sum" true}}))

(defn- match-aggregation [{:keys [aggregation-type field]}]
  (if-not field
    ;; aggregations with no Field
    (case aggregation-type
      :rows  (aggregation:rows)
      :count (aggregation:count))
    ;; aggregations with a field
    ((case       aggregation-type
       :avg      aggregation:avg
       :count    aggregation:count
       :distinct aggregation:distinct
       :sum      aggregation:sum) ; TODO -- stddev isn't implemented for mongo
     field)))


;; ## BREAKOUT
;; This is similar to the aggregation stuff but has to be implemented separately since Mongo doesn't really have
;; GROUP BY functionality the same way SQL does.
;; This is annoying, since it effectively duplicates logic we have in the aggregation definitions above and the
;; clause definitions below, but the query we need to generate is different enough that I haven't found a cleaner
;; way of doing this yet.
(defn- breakout-aggregation->field-name+expression
  "Match AGGREGATION clause of a structured query that contains a `breakout` clause, and return
   a pair containing `[field-name aggregation-expression]`, which are used to generate the Mongo aggregate query."
  [{:keys [aggregation-type field]}]
  ;; AFAIK these are the only aggregation types that make sense in combination with a breakout clause or are we missing something?
  ;; At any rate these seem to be the most common use cases, so we can add more here if and when they're needed.
  (if-not field
    (case aggregation-type
      :rows  nil
      :count ["count" {$sum 1}])
    (case aggregation-type
      :avg ["avg" {$avg (field->$str field)}]
      :sum ["sum" {$sum (field->$str field)}])))

(defn do-breakout
  "Generate a Monger query from a structured QUERY dictionary that contains a `breakout` clause.
   Since the Monger query we generate looks very different from ones we generate when no `breakout` clause
   is present, this is essentialy a separate implementation :/"
  [{aggregation :aggregation, breakout-fields :breakout, order-by :order-by, limit :limit, :as query}]
  (let [[ag-field ag-clause] (breakout-aggregation->field-name+expression aggregation)
        fields               (map field->name breakout-fields)
        $fields              (map field->$str breakout-fields)
        fields->$fields      (zipmap fields $fields)]
    (aggregate {$group  (merge {"_id" (if (= (count fields) 1) (first $fields)
                                          fields->$fields)}
                               (when (and ag-field ag-clause)
                                 {ag-field ag-clause})
                               (->> fields->$fields
                                    (map (fn [[field $field]]
                                           (when-not (= field "_id")
                                             {field {$first $field}})))
                                    (into {})))}
               {$sort    (->> order-by
                              (mapcat (fn [{:keys [field direction]}]
                                        [(field->name field) (case direction
                                                               :ascending   1
                                                               :descending -1)]))
                              (apply sorted-map))}
               {$project (merge {"_id" false}
                                (when ag-field
                                  {ag-field true})
                                (zipmap fields (repeat true)))}
               (when limit
                 {$limit limit}))))

;; ## PROCESS-STRUCTURED

(defn process-structured
  "Process a structured MongoDB QUERY.
   This establishes some bindings, then:

   *  queries that contain `breakout` clauses are handled by `do-breakout`
   *  other queries are handled by `match-aggregation`, which hands off to the
      appropriate fn defined by a `defaggregation`."
  [{:keys [source-table aggregation breakout] :as query}]
  (binding [*collection-name* (:name source-table)
            *constraints*     (when-let [filter-clause (:filter query)]
                                (apply-clause [:filter filter-clause]))]
    (if (seq breakout) (do-breakout query)
        (match-aggregation aggregation))))


;; ## CLAUSE APPLICATION 2.0

(def ^:private clauses
  "Used by `defclause` to store the clause definitions generated by it."
  (atom '()))

(defmacro defclause
  "Generate a new clause definition that will be called inside of a `match` statement
   whenever CLAUSE matches MATCH-BINDING.

   In general, these should emit a vector of forms to be included in the generated Monger query;
   however, `filter` is handled a little differently (see below)."
  [clause match-binding & body]
  `(swap! clauses concat '[[~clause ~match-binding] (try
                                                      ~@body
                                                      (catch Throwable e#
                                                        (log/error (color/red ~(format "Failed to process clause [%s %s]: " clause match-binding)
                                                                              (.getMessage e#)))))]))

;; ### CLAUSE DEFINITIONS

;; ### fields
(defclause :fields fields
  `[(fields ~(mapv field->name fields))])


;; ### filter

(defn- format-value
  "Convert ID strings to `ObjectId`."
  [{:keys [field-name base-type value]}]
  (if (and (= field-name "_id")
           (= base-type  :UnknownField)) `(ObjectId. ~value)
           value))

(defn- parse-filter-subclause [{:keys [filter-type field value] :as filter}]
  (let [field (when field (field->name field))
        value (when value (format-value value))]
    (case filter-type
      :inside  (let [lat (:lat filter)
                     lon (:lon filter)]
                 {$and [{(field->name (:field lat)) {$gte (format-value (:min lat)), $lte (format-value (:max lat))}}
                        {(field->name (:field lon)) {$gte (format-value (:min lon)), $lte (format-value (:max lon))}}]})
      :between  {field {$gte (format-value (:min-val filter))
                        $lte (format-value (:max-val filter))}}
      :is-null  {field {$exists false}}
      :not-null {field {$exists true}}
      :=        {field value}
      :!=       {field {$ne  value}}
      :<        {field {$lt  value}}
      :>        {field {$gt  value}}
      :<=       {field {$lte value}}
      :>=       {field {$gte value}})))


(defclause :filter filter-clause
  (let [{:keys [compound-type subclauses]} filter-clause
        subclauses (mapv parse-filter-subclause subclauses)]
    (case compound-type
      :and    {$and subclauses}
      :or     {$or  subclauses}
      :simple (first subclauses))))


;; ### limit

(defclause :limit value
  `[(limit ~value)])

;; ### order_by
(defclause :order-by subclauses
  (let [sort-options (mapcat (fn [{:keys [field direction]}]
                               [(field->name field) (case direction
                                                      :ascending   1
                                                      :descending -1)])
                             subclauses)]
    (when (seq sort-options)
      `[(sort (array-map ~@sort-options))])))

;; ### page
(defclause :page page-clause
  (let [{page-num :page items-per-page :items} page-clause
        num-to-skip (* (dec page-num) items-per-page)]
    `[(skip ~num-to-skip)
      (limit ~items-per-page)]))


;; ### APPLY-CLAUSE

(defmacro match-clause
  "Generate a `match` form against all the clauses defined by `defclause`."
  [clause]
  `(match ~clause
     ~@@clauses
     ~'_ nil))

(defn apply-clause
  "Match CLAUSE against a clause defined by `defclause`."
  [clause]
  (match-clause clause))
