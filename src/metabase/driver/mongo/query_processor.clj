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
                    [operators :refer :all])
            [metabase.db :refer :all]
            [metabase.driver :as driver]
            (metabase.driver [interface :refer [field-values-lazy-seq]]
                             [query-processor :as qp])
            [metabase.driver.query-processor.interface :as i]
            [metabase.driver.mongo.util :refer [with-mongo-connection *mongo-connection* values->base-type]]
            [metabase.util :as u])
  (:import (com.mongodb CommandResult
                        DB)
           (clojure.lang PersistentArrayMap)
           (org.bson.types ObjectId)
           (metabase.driver.query_processor.interface DateTimeLiteral DateTimeValue Value Field DateTimeField)))

(declare apply-clause eval-raw-command log-query process-structured process-and-run-structured)


;;; # ============================================================ DRIVER QP INTERFACE ============================================================

(def ^:dynamic ^:private *query* nil)

(defn process-and-run
  "Process and run a MongoDB QUERY."
  [{query-type :type, :as query}]
  (binding [*query* query]
    (case (keyword query-type)
      :query  (process-structured (:query query))
      :native (let [results (eval-raw-command (:query (:native query)))]
                (if (sequential? results) results
                              [results])))))


;;; # ============================================================ NATIVE QUERY PROCESSOR ============================================================

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


;;; # ============================================================ STRUCTURED QUERY PROCESSOR ============================================================

;;; ## ------------------------------------------------------------ FIELDS + VALUES FORMATTING ------------------------------------------------------------

(defmulti ^:private field->name (fn [obj & [separator]]
                                  (class obj)))

;; Return qualified string name of FIELD, e.g. `venue` or `venue.address`.
(defmethod field->name Field [field & [separator]]
  (->> (i/qualified-name-components field)
       rest                                ; drop collection name
       (interpose (or separator "."))
       (apply str)))


(defmethod field->name DateTimeField [{:keys [field unit]} & [separator]]
  (format "%s::%s" (field->name field separator) (name unit)))


(defmulti field->$str
  "Given a FIELD, return a `$`-qualified field name for use in a Mongo aggregate query, e.g. `\"$user_id\"`."
  class)

(defmethod field->$str Field [field]
  (let [s (field->name field)]
    (assert (string? s))
    (str "$" s)))

(defmethod field->$str DateTimeField [field]
  (field->$str (:field field)))



(defmulti ^:private format-value class)

(defmethod format-value Value [{value :value, {:keys [field-name base-type]} :field}]
  (cond
    (and (= field-name "_id")
         (= base-type  :UnknownField))  `(ObjectId. ~value)
    :else                               value))

(defmethod format-value DateTimeLiteral [{:keys [^java.sql.Timestamp value, ^DateTimeField field]}]
  (java.util.Date. (.getTime ^java.sql.Timestamp value)))

(defmethod format-value DateTimeValue [{:keys [unit, relative-amount], {field-unit :unit} :field}]
  (println "field-unit" field-unit)
  (let [date (u/relative-date relative-amount unit)]
    (if (contains? #{:minute-of-hour :hour-of-day :day-of-week :day-of-year :week-of-year :month-of-year :quarter-of-year} field-unit)
      (u/date-extract field-unit date)
      (case field-unit
        :minute          date ; YYYYMMDDHHMM ?? Should we bit shift numbers insteed of multiplying by 10?
        :hour            date ; YYYYMMDDHH   ?? Are we sure we can't string cat them?
        :day             date ; YYYYMMDD     ??
        :week            (+ (* 100 (u/date-extract :year date))
                                   (u/date-extract :week-of-year date))
        :month           (+ (* 100 (u/date-extract :year date))
                            (u/date-extract :month-of-year date))
        :quarter
        :year            (+ (* 10 (u/date-extract :year date))
                            (u/date-extract :quarter-of-year date))))))


;;; ## ------------------------------------------------------------ AGGREGATION IMPLEMENTATIONS ------------------------------------------------------------

(def ^:dynamic *collection-name*
  "String name of the collection (i.e., `Table`) that we're currently querying against."
  nil)

;;; ### ------------------------------------------------------------ CLAUSE APPLICATION ------------------------------------------------------------

(defn- initial-projection-fields
  "Collect all the fields referenced in the query (including 'casts' that may need to occur) to build the initial `$project` dictionary."
  [query]
  (let [fields (atom {})]
    (->> query
         (walk/prewalk (fn [form]
                         (cond
                           (instance? DateTimeField form)
                           (let [{:keys [unit], :as field} form
                                 field-name                (field->name field)
                                 $field-name               (field->$str field)]
                             (when (not= unit :default)
                               (swap! fields assoc field-name (case unit
                                                                :minute          $field-name
                                                                :minute-of-hour  {$minute $field-name}
                                                                :hour            $field-name
                                                                :hour-of-day     {$hour $field-name}
                                                                :day             $field-name
                                                                :day-of-week     {$dayOfWeek $field-name}
                                                                :day-of-month    {$dayOfMonth $field-name}
                                                                :day-of-year     {$dayOfYear $field-name}
                                                                :week            {$add [{$multiply [100 {$year  $field-name}]}
                                                                                                        {$week  $field-name}]}
                                                                :week-of-year    {$week $field-name}
                                                                :month           {$add [{$multiply [100 {$year  $field-name}]}
                                                                                                        {$month $field-name}]}
                                                                :month-of-year   {$month $field-name}
                                                                :quarter         {$add [{$multiply [10 {$year $field-name}]}
                                                                                        {$add [1 {$mod [{$month $field-name} 3]}]}]}
                                                                :quarter-of-year {$add [1 {$mod [{$month $field-name} 3]}]}
                                                                :year            {$year $field-name}))))
                           (instance? Field form)
                           (swap! fields assoc (field->name form) (field->$str form))

                           :else nil)
                         form)))
    @fields))

(defn- final-projection-fields
  "Collect the fields that should be returned (used in the final `$project` clause).
   This is usually whatever is in `:fields`, except in the case of aggregations like `:count`."
  [{:keys [fields]}]
  (into {} (for [field fields]
             (let [field (if (instance? DateTimeField field) (:field field)
                             field)]
               [(field->name field) (field->$str field)]))))


;;; #### filter

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

(defn- constraints [{filter-clause :filter}]
  (when filter-clause
    (parse-filter-clause filter-clause)))


;;; #### order_by

(defn- order-by [{subclauses :order-by}]
  (when (seq subclauses)
    (apply array-map (mapcat (fn [{:keys [field direction]}]
                               [(field->name field) (case direction
                                                      :ascending   1
                                                      :descending -1)])
                             subclauses))))

;;; ### page & limit

(defn- skip [{{page-num :page items-per-page :items} :page}]
  (when page-num
    (* (dec page-num) items-per-page)))

(defn- limit [{{items-per-page :items} :page, lim :limit}]
  (or items-per-page lim))


;;; ### ------------------------------------------------------------ AGGREGATION IMPLEMENTATIONS ------------------------------------------------------------

(defn- aggregation [& final-clauses]
  (let [query (:query *query*)
        forms (->> (concat [{$project (initial-projection-fields query)}
                            (when-let [match  (constraints query)] {$match match})
                            (when-let [order  (order-by query)]    {$sort  order})
                            (when-let [skip   (skip query)]        {$skip  skip})
                            (when-let [limit  (limit query)]       {$limit limit})]
                           final-clauses)
                   (filterv identity))]
    (log-query `(aggregate ~*collection-name* ~forms))
    (mc/aggregate ^DB *mongo-connection* *collection-name* forms)))

(defn- aggregation:rows []
  (aggregation {$project (final-projection-fields (:query *query*))}))

(defn- aggregation:count [& [field]]
  (aggregation (when field
                 {$match {(field->name field) {$exists true}}})
               {$group   {"_id"   nil
                          "count" {$sum 1}}}

               {$project {"_id"   false
                          "count" true}}))

(defn- aggregation:avg [field]
  (aggregation {$group {"_id" nil
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
  ;;
  ;; TODO - UPDATE - apparently you can now set allowDiskUse from Monger. We can rewrite this the do things in Mongo-land at some point.
  [{:count (let [values       (transient (set []))
                 limit        (:limit (:query *query*))
                 keep-taking? (if limit (fn [_]
                                          (< (count values) limit))
                                  (constantly true))]
             (->> (field-values-lazy-seq @(ns-resolve 'metabase.driver.mongo 'driver) (sel :one 'Field :id (:field-id field))) ; resolve driver at runtime to avoid circular deps
                  (filter identity)
                  (map hash)
                  (map #(conj! values %))
                  (take-while keep-taking?)
                  dorun)
             (count values))}])

(defn- aggregation:sum [field]
  (aggregation {$group {"_id" nil ; TODO - I don't think this works for _id
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


;;; ## BREAKOUT
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

;; TODO - Do we still need all of this stuff? Can it be rolled into the logic we have above for dates?

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
  (let [ ;; Shadow the top-level definition of field->name with one that will use "___" as the separator instead of "."
        field->escaped-name  (u/rpartial field->name "___")
        [ag-field ag-clause] (breakout-aggregation->field-name+expression aggregation)
        fields               (map field->escaped-name breakout-fields)
        $fields              (map field->$str breakout-fields)
        fields->$fields      (zipmap fields $fields)]
    `(ag-unescape-nested-field-names
      ~(aggregation {$group  (merge {"_id" (if (= (count fields) 1) (first $fields)
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

;;; ## ------------------------------------------------------------ PROCESS-STRUCTURED ------------------------------------------------------------

(defn process-structured
  "Process a structured MongoDB QUERY.
   This establishes some bindings, then:

   *  queries that contain `breakout` clauses are handled by `do-breakout`
   *  other queries are handled by `match-aggregation`, which hands off to the
      appropriate fn defined by a `defaggregation`."
  [{:keys [source-table aggregation breakout] :as query}]
  (binding [*collection-name* (:name source-table)]
    (cond
      (seq breakout) (do-breakout query)
      aggregation    (match-aggregation aggregation)
      :else          (aggregation:rows))))           ; we can treat queries with no aggregation specified as "rows" aggregations (isn't that the same thing anyway?)


;;; ## ------------------------------------------------------------ UTIL FNS ------------------------------------------------------------

(defn- log-query [generated-query]
  (when-not qp/*disable-qp-logging*
    (try
      (log/debug (u/format-color 'green "\nMONGER FORM:\n%s\n"
                                 (->> generated-query
                                      (walk/postwalk #(if (symbol? %) (symbol (name %)) %)) ; strip namespace qualifiers from Monger form
                                      u/pprint-to-str) "\n"))
      (catch Throwable e
        (log/error (u/format-color 'red "Failed to log query: %s \n%s" e (u/pprint-to-str (u/filtered-stacktrace e))))))))
