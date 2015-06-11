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
            [metabase.driver.interface :as i]
            [metabase.driver.query-processor :as qp :refer [*query*]]
            [metabase.driver.mongo.util :refer [with-mongo-connection *mongo-connection* values->base-type]]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.util :as u])
  (:import (com.mongodb CommandResult
                        DBApiLayer)
           (clojure.lang PersistentArrayMap)
           (org.bson.types ObjectId)))

(declare apply-clause
         annotate-native-results
         annotate-results
         eval-raw-command
         field-id->kw
         process-structured
         process-and-run-structured)

;; # DRIVER QP INTERFACE



(defn process-and-run
  "Process and run a MongoDB QUERY."
  [{query-type :type database-id :database :as query}]
  {:pre [(contains? #{:native :query} (keyword query-type))
         (integer? database-id)]}
  (with-mongo-connection [_ (sel :one :fields [Database :details] :id database-id)]
    (case (keyword query-type)
      :query (if (zero? (:source_table (:query query))) qp/empty-response
                 (let [generated-query (process-structured (:query query))]
                   (when-not qp/*disable-qp-logging*
                     (log/debug (color/magenta "\n******************** Generated Monger Query: ********************\n"
                                               (with-out-str (clojure.pprint/pprint generated-query))
                                               "*****************************************************************\n")))
                   (->> (eval generated-query)
                        (annotate-results (:query query)))))
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

(def ^:private aggregations
  "Used internally by `defaggregation` to store the different aggregation patterns to match against."
  (atom '()))

(def ^:dynamic *collection-name*
  "String name of the collection (i.e., `Table`) that we're currently querying against."
  nil)
(def ^:dynamic *constraints*
  "Monger clauses generated from query dict `filter` clauses; bound dynamically so we can insert these as appropriate for various types of aggregations."
  nil)

(defmacro defaggregation
  "Define a new function that will be called when the `aggregation` clause in a structured query matches MATCH-BINDING.
   (All functions defined with `defaggregation` are combined into a massive `match` statement inside `match-aggregation`).

   These should emit a form that can be `eval`ed to get the query results; the `aggregate` function takes care of some of the
   boilerplate for this form."
  [match-binding & body]
  `(swap! aggregations concat
          (quote [~match-binding (try
                                   ~@body
                                   (catch Throwable e#
                                     (log/error (color/red ~(format "Failed to apply aggregation %s: " match-binding)
                                                           e#))))])))

(defn aggregate
  "Generate a Monger `aggregate` form."
  [& forms]
  `(mc/aggregate ^DBApiLayer *mongo-connection* ~*collection-name* [~@(when *constraints*
                                                                        [{$match *constraints*}])
                                                                    ~@(filter identity forms)]))

(defn field-id->$string
  "Given a FIELD-ID, return a `$`-qualified field name for use in a Mongo aggregate query, e.g. `\"$user_id\"`."
  [field-id]
  (format "$%s" (name (field-id->kw field-id))))


(defaggregation ["rows"]
  `(doall (with-collection ^DBApiLayer *mongo-connection* ~*collection-name*
            ~@(when *constraints* [`(find ~*constraints*)])
            ~@(mapcat apply-clause (dissoc (:query *query*) :filter)))))

(defaggregation ["count"]
  `[{:count (mc/count ^DBApiLayer *mongo-connection* ~*collection-name*
                      ~*constraints*)}])

(defaggregation ["avg" field-id]
  (aggregate {$group {"_id" nil
                      "avg" {$avg (field-id->$string field-id)}}}
             {$project {"_id" false, "avg" true}}))

(defaggregation ["count" field-id]
  `[{:count (mc/count ^DBApiLayer *mongo-connection* ~*collection-name*
                      (merge ~*constraints*
                             {(field-id->kw field-id) {$exists true}}))}])

(defaggregation ["distinct" field-id]
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
  [{:count (let [values (transient (set []))
                 limit  (:limit (:query *query*))
                 keep-taking?  (if limit (fn [_]
                                           (< (count values) limit))
                                   (constantly true))]
             (->> (i/field-values-lazy-seq @(ns-resolve 'metabase.driver.mongo 'driver) (sel :one Field :id field-id)) ; resolve driver at runtime to avoid circular deps
                  (filter identity)
                  (map hash)
                  (map #(conj! values %))
                  (take-while keep-taking?)
                  dorun)
             (count values))}])

(defaggregation ["stddev" field-id]
  nil) ; TODO

(defaggregation ["sum" field-id]
  (aggregate {$group {"_id" nil ; TODO - I don't think this works for _id
                      "sum" {$sum (field-id->$string field-id)}}}
             {$project {"_id" false, "sum" true}}))

(defmacro match-aggregation
  "Match structured query `aggregation` clause against the clauses defined by `defaggregation`."
  [aggregation]
  `(match ~aggregation
     ~@@aggregations
     ~'_ nil))


;; ## BREAKOUT
;; This is similar to the aggregation stuff but has to be implemented separately since Mongo doesn't really have
;; GROUP BY functionality the same way SQL does.
;; This is annoying, since it effectively duplicates logic we have in the aggregation definitions above and the
;; clause definitions below, but the query we need to generate is different enough that I haven't found a cleaner
;; way of doing this yet.

;;
(defn breakout-aggregation->field-name+expression
  "Match AGGREGATION clause of a structured query *that contains a `breakout` clause*, and return
   a pair containing `[field-name aggregation-expression]`, which are used to generate the Mongo aggregate query."
  [aggregation]
  ;; AFAIK these are the only aggregation types that make sense in combination with a breakout clause
  ;; or are we missing something?
  ;; At any rate these seem to be the most common use cases, so we can add more here if and when they're needed.
  (match aggregation
    ["rows"]         nil
    ["count"]        ["count" {$sum 1}]
    ["avg" field-id] ["avg" {$avg (field-id->$string field-id)}]
    ["sum" field-id] ["sum" {$sum (field-id->$string field-id)}]))

(defn do-breakout
  "Generate a Monger query from a structured QUERY dictionary that contains a `breakout` clause.
   Since the Monger query we generate looks very different from ones we generate when no `breakout` clause
   is present, this is essentialy a separate implementation :/"
  [{aggregation :aggregation, field-ids :breakout, order-by :order_by, limit :limit, :as query}]
  {:pre [(sequential? field-ids)
         (every? integer? field-ids)]}
  (let [[ag-field ag-clause] (breakout-aggregation->field-name+expression aggregation)
        fields               (->> (map field-id->kw field-ids)
                                  (map name))
        $fields              (map field-id->$string field-ids)
        fields->$fields      (zipmap fields $fields)]
    (aggregate {$group  (merge {"_id"    (if (= (count fields) 1) (first $fields)
                                             fields->$fields)}
                               (when (and ag-field ag-clause)
                                 {ag-field ag-clause})
                               (->> fields->$fields
                                    (map (fn [[field $field]]
                                           (when-not (= field "_id")
                                             {field {$first $field}})))
                                    (into {})))}
               {$sort    (->> order-by
                              (mapcat (fn [[field-id asc-or-desc]]
                                        [(name (field-id->kw field-id)) (case asc-or-desc
                                                                          "ascending" 1
                                                                          "descending" -1)]))
                              (apply sorted-map))}
               {$project (merge {"_id"    false}
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
  [{:keys [source_table aggregation breakout] :as query}]
  (binding [*collection-name* (sel :one :field [Table :name] :id source_table)
            *constraints* (when-let [filter-clause (:filter query)]
                            (apply-clause [:filter filter-clause]))]
    (if-not (empty? breakout) (do-breakout query)
            (match-aggregation aggregation))))


;; ## ANNOTATION

;; TODO - This is similar to the implementation in generic-sql; can we combine them and move it into metabase.driver.query-processor?
(defn annotate-results
  "Add column information, `row_count`, etc. to the results of a Mongo QP query."
  [{:keys [source_table] :as query} results]
  {:pre [(integer? source_table)]}
  (let [field-name->field (sel :many :field->obj [Field :name] :table_id source_table)
        column-keys       (qp/order-columns {:query query} (keys (first results)))
        column-names      (map name column-keys)]
    {:columns column-names
     :cols (qp/get-column-info {:query query} column-names)
     :rows (map #(map % column-keys)
                results)}))


;; ## CLAUSE APPLICATION 2.0

(def ^{:arglists '([field-id])} field-id->kw
  "Return the keyword name of a `Field` with ID FIELD-ID. Memoized."
  (memoize
   (fn [field-id]
     {:pre [(integer? field-id)]
      :post [(keyword? %)]}
     (keyword (sel :one :field [Field :name] :id field-id)))))

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
(defclause :fields field-ids
  `[(fields ~(mapv field-id->kw field-ids))])

(def ^:private field-id->casting-fn
  "Return a fn that should be used to cast values that match/filter against `Field` with FIELD-ID."
  (let [->ObjectId (fn [^String value]
                     `(ObjectId. ~value))]
    (memoize
     (fn [field-id]
       (let [{base-type :base_type, field-name :name, special-type :special_type} (sel :one [Field :base_type :name :special_type] :id field-id)]
         (cond
           (contains? #{:DateField :DateTimeField} base-type) u/parse-date-yyyy-mm-dd
           (= special-type :timestamp_seconds)                u/date-yyyy-mm-dd->unix-timestamp
           (and (= field-name "_id")
                (= base-type  :UnknownField))                 ->ObjectId
           :else                                              identity))))))

(defn- cast-value-if-needed
  "*  Convert dates (which come back as `YYYY-MM-DD` strings) to `java.util.Date`
   *  Convert ID strings to `ObjectId`
   *  Return other values as-is"
  [field-id ^String value]
  ((field-id->casting-fn field-id) value))

;; ### filter
;; !!! SPECIAL CASE - the results of this clause are bound to *constraints*, which is used differently
;; by the various defaggregation definitions or by do-breakout. Here, we just return a "constraints" map instead.
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
  {(field-id->kw field-id) {$gte (cast-value-if-needed field-id min)
                            $lte (cast-value-if-needed field-id max)}})

(defclause :filter ["=" field-id value]
  {(field-id->kw field-id) (cast-value-if-needed field-id value)})

(defclause :filter ["!=" field-id value]
  {(field-id->kw field-id) {$ne (cast-value-if-needed field-id value)}})

(defclause :filter ["<" field-id value]
  {(field-id->kw field-id) {$lt (cast-value-if-needed field-id value)}})

(defclause :filter [">" field-id value]
  {(field-id->kw field-id) {$gt (cast-value-if-needed field-id value)}})

(defclause :filter ["<=" field-id value]
  {(field-id->kw field-id) {$lte (cast-value-if-needed field-id value)}})

(defclause :filter [">=" field-id value]
  {(field-id->kw field-id) {$gte (cast-value-if-needed field-id value)}})

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
