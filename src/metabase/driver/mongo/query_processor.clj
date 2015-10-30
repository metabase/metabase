(ns metabase.driver.mongo.query-processor
  (:refer-clojure :exclude [find sort])
  (:require [clojure.core.match :refer [match]]
            (clojure [set :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [colorize.core :as color]
            (monger [collection :as mc]
                    [core :as mg]
                    [db :as mdb]
                    [operators :refer :all]
                    [query :refer :all])
            [metabase.db :refer :all]
            [metabase.driver.query-processor :as qp]
            [metabase.driver.query-processor.interface :refer [qualified-name-components]]
            [metabase.driver.mongo.util :refer [with-mongo-connection *mongo-connection* values->base-type]]
            [metabase.models.field :as field]
            [metabase.util :as u])
  (:import (com.mongodb CommandResult
                        DB)
           (clojure.lang PersistentArrayMap)
           (org.bson.types ObjectId)
           (metabase.driver.query_processor.interface DateTimeField
                                                      DateTimeValue
                                                      Field
                                                      OrderByAggregateField
                                                      Value)))

(declare apply-clause
         eval-raw-command
         process-structured
         process-and-run-structured)


;; # DRIVER QP INTERFACE

(def ^:dynamic ^:private *query* nil)

(defn process-and-run
  "Process and run a MongoDB QUERY."
  [{query-type :type, :as query}]
  (binding [*query* query]
    (case (keyword query-type)
      :query (let [generated-query (process-structured (:query query))]
               (when-not qp/*disable-qp-logging*
                 (log/debug (u/format-color 'green "\nMONGER FORM:\n%s\n"
                                            (->> generated-query
                                                 (walk/postwalk #(if (symbol? %) (symbol (name %)) %)) ; strip namespace qualifiers from Monger form
                                                 u/pprint-to-str) "\n"))) ; so it's easier to read
                (eval generated-query))
      :native (let [results (eval-raw-command (:query (:native query)))]
                (if (sequential? results) results
                              [results])))))


;; # NATIVE QUERY PROCESSOR

(defn eval-raw-command
  "Evaluate raw MongoDB javascript code. This must be ran insided the body of a `with-mongo-connection`.

     (with-mongo-connection [_ \"mongodb://localhost/test\"]
       (eval-raw-command \"db.zips.findOne()\"))
     -> {\"_id\" \"01001\", \"city\" \"AGAWAM\", ...}"
  [^String command]
  (assert *mongo-connection* "eval-raw-command must be ran inside the body of with-mongo-connection.")
  (let [^CommandResult result (.doEval ^DB *mongo-connection* command nil)]
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
  `(mc/aggregate ^DB *mongo-connection* ~*collection-name* [~@(when *constraints*
                                                                        [{$match *constraints*}])
                                                                    ~@(filter identity forms)]))

;; Return qualified string name of FIELD, e.g. `venue` or `venue.address`.
(defmulti field->name (fn
                         (^String [this]           (class this))
                         (^String [this separator] (class this))))

(defmethod field->name Field
  ([this]
   (field->name this "."))
  ([this separator]
   (apply str (interpose separator (rest (qualified-name-components this))))))

(defmethod field->name OrderByAggregateField
  ([this]
   (field->name this nil))
  ([this _]
   (let [{:keys [aggregation-type]} (:aggregation (:query *query*))]
     (case aggregation-type
       :avg      "avg"
       :count    "count"
       :distinct "count"
       :stddev   "stddev"
       :sum      "sum"))))

(defmethod field->name DateTimeField
  ([this]
   (field->name (:field this)))
  ([this separator]
   (field->name (:field this) separator)))

(defn- field->$str
  "Given a FIELD, return a `$`-qualified field name for use in a Mongo aggregate query, e.g. `\"$user_id\"`."
  [field]
  (format "$%s" (field->name field)))

(defn- aggregation:rows []
  `(doall (with-collection ^DB *mongo-connection* ~*collection-name*
            ~@(when *constraints* [`(find ~*constraints*)])
            ~@(mapcat apply-clause (dissoc (:query *query*) :filter)))))

(defn- aggregation:count
  ([]
   `[{:count (mc/count ^DB *mongo-connection* ~*collection-name*
                       ~*constraints*)}])
  ([field]
   `[{:count (mc/count ^DB *mongo-connection* ~*collection-name*
                       (merge ~*constraints*
                              {~(field->name field) {$exists true}}))}]))

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
                                  (constantly true))
                 field-id     (or (:field-id field)             ; Field
                                  (:field-id (:field field)))]  ; DateTimeField
             (->> (@(resolve 'metabase.driver.mongo/field-values-lazy-seq) (sel :one field/Field :id field-id)) ; resolve driver at runtime to avoid circular deps
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

;;; BREAKOUT FIELD NAME ESCAPING FOR $GROUP
;; We're not allowed to use field names that contain a period in the Mongo aggregation $group stage.
;; Not OK:
;;   {"$group" {"source.username" {"$first" {"$source.username"}, "_id" "$source.username"}}, ...}
;;
;; For *nested* Fields, we'll replace the '.' with '___', and restore the original names afterward.
;; Escaped:
;;   {"$group" {"source___username" {"$first" {"$source.username"}, "_id" "$source.username"}}, ...}

(defn ag-unescape-nested-field-names
  "Restore the original, unescaped nested Field names in the keys of RESULTS.
   E.g. `:source___service` becomes `:source.service`"
  [results]
  ;; Build a map of escaped key -> unescaped key by looking at the keys in the first result
  ;; e.g. {:source___username :source.username}
  (let [replacements (into {} (for [k (keys (first results))]
                                (let [k-str     (name k)
                                      unescaped (s/replace k-str #"___" ".")]
                                  (when-not (= k-str unescaped)
                                    {k (keyword unescaped)}))))]
    ;; If the map is non-empty then map set/rename-keys over the results with it
    (if-not (seq replacements)
      results
      (for [row results]
        (set/rename-keys row replacements)))))

(defn- do-breakout
  "Generate a Monger query from a structured QUERY dictionary that contains a `breakout` clause.
   Since the Monger query we generate looks very different from ones we generate when no `breakout` clause
   is present, this is essentialy a separate implementation :/"
  [{aggregation :aggregation, breakout-fields :breakout, order-by :order-by, limit :limit, :as query}]
  (let [;; Shadow the top-level definition of field->name with one that will use "___" as the separator instead of "."
        field->escaped-name  (u/rpartial field->name "___")
        [ag-field ag-clause] (breakout-aggregation->field-name+expression aggregation)
        fields               (map field->escaped-name breakout-fields)
        $fields              (map field->$str breakout-fields)
        fields->$fields      (zipmap fields $fields)]
    `(ag-unescape-nested-field-names
      ~(aggregate {$group  (merge {"_id" (if (= (count fields) 1) (first $fields)
                                             fields->$fields)}
                                  (when (and ag-field ag-clause)
                                    {ag-field ag-clause})
                                  (into {} (for [[field $field] fields->$fields]
                                             (when-not (= field "_id")
                                               {field {$first $field}}))))}
                  {$sort    (->> order-by
                                 (mapcat (fn [{:keys [field direction]}]
                                           [(field->escaped-name field) (case direction
                                                                  :ascending   1
                                                                  :descending -1)]))
                                 (apply sorted-map))}
                  {$project (merge {"_id" false}
                                   (when ag-field
                                     {ag-field true})
                                   (zipmap fields (repeat true)))}
                  (when limit
                    {$limit limit})))))

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

(defmacro ^:private defclause
  "Generate a new clause definition that will be called inside of a `match` statement
   whenever CLAUSE matches MATCH-BINDING.

   In general, these should emit a vector of forms to be included in the generated Monger query;
   however, `filter` is handled a little differently (see below)."
  [clause match-binding & body]
  `(swap! clauses concat '[[~clause ~match-binding] (try
                                                      ~@body
                                                      (catch Throwable e#
                                                        (log/error (color/red ~(format "Failed to process '%s' clause:" (name clause))
                                                                              (.getMessage e#)))))]))

;; ### CLAUSE DEFINITIONS

;; ### fields
(defclause :fields fields
  `[(fields ~(mapv field->name fields))])


;; ### filter

(defmulti format-value class)

(defmethod format-value Value [{value :value, {:keys [field-name base-type]} :field}]
  (if (and (= field-name "_id")
           (= base-type  :UnknownField))
    `(ObjectId. ~value)
    value))

(defmethod format-value DateTimeValue [{^java.sql.Timestamp value :value}]
  (java.util.Date. (.getTime value)))

(defn- parse-filter-subclause [{:keys [filter-type field value] :as filter}]
  (let [field (when field (field->name field))
        value (when value (format-value value))]
    (case filter-type
      :inside      (let [lat (:lat filter)
                         lon (:lon filter)]
                     {$and [{(field->name (:field lat)) {$gte (format-value (:min lat)), $lte (format-value (:max lat))}}
                            {(field->name (:field lon)) {$gte (format-value (:min lon)), $lte (format-value (:max lon))}}]})
      :between     {field {$gte (format-value (:min-val filter))
                           $lte (format-value (:max-val filter))}}
      :is-null     {field {$exists false}}
      :not-null    {field {$exists true}}
      :contains    {field (re-pattern value)}
      :starts-with {field (re-pattern (str \^ value))}
      :ends-with   {field (re-pattern (str value \$))}
      :=           {field value}
      :!=          {field {$ne  value}}
      :<           {field {$lt  value}}
      :>           {field {$gt  value}}
      :<=          {field {$lte value}}
      :>=          {field {$gte value}})))

(defn- parse-filter-clause [{:keys [compound-type subclauses], :as clause}]
  (cond
    (= compound-type :and) {$and (mapv parse-filter-clause subclauses)}
    (= compound-type :or)  {$or  (mapv parse-filter-clause subclauses)}
    :else                  (parse-filter-subclause clause)))


(defclause :filter filter-clause
  (parse-filter-clause filter-clause))


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
