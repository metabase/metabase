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
           clojure.lang.PersistentArrayMap
           java.util.Calendar
           org.bson.types.ObjectId
           (metabase.driver.query_processor.interface DateTimeField
                                                      DateTimeValue
                                                      Field
                                                      OrderByAggregateField
                                                      RelativeDateTimeValue
                                                      Value)))

(declare process-and-run-native
         process-and-run-structured)


;; # DRIVER QP INTERFACE

(def ^:dynamic ^:private *query* nil)

(defn- log-monger-form [form]
  (when-not qp/*disable-qp-logging*
    (log/debug (u/format-color 'green "\nMONGO AGGREGATION PIPELINE:\n%s\n"
                 (->> form
                      (walk/postwalk #(if (symbol? %) (symbol (name %)) %)) ; strip namespace qualifiers from Monger form
                      u/pprint-to-str) "\n"))))

(defn process-and-run
  "Process and run a MongoDB QUERY."
  [{query-type :type, :as query}]
  {:pre [query-type]}
  (case (keyword query-type)
    :query  (process-and-run-structured query)
    :native (process-and-run-native query)))


;; # NATIVE QUERY PROCESSOR

(defn- eval-raw-command
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

(defn- process-and-run-native [query]
  (let [results (eval-raw-command (:query (:native query)))]
    (if (sequential? results) results
        [results])))


;;; # STRUCTURED QUERY PROCESSOR

;;; ## FORMATTING

(defmulti field->name
  "Return qualified string name of FIELD, e.g. `venue` or `venue.address`."
  (fn
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
       :sum      "sum"))))

(defmethod field->name DateTimeField
  ([this]
   (field->name (:field this)))
  ([this separator]
   (field->name (:field this) separator)))

(defmulti format-value class)

(defmethod format-value Value [{value :value, {:keys [field-name base-type]} :field}]
  (if (and (= field-name "_id")
           (= base-type  :UnknownField))
    `(ObjectId. ~value)
    value))

(defmethod format-value DateTimeValue [{^java.sql.Timestamp value :value}]
  (java.util.Date. (.getTime value)))

;; TODO - this doesn't work 100%
;; in filters we're not applying bucketing for things like "="
(defmethod format-value RelativeDateTimeValue [{:keys [amount unit field], :as r}]
  (let [cal               (Calendar/getInstance)
        [unit multiplier] (case (or unit :day)
                            :minute  [Calendar/MINUTE 1]
                            :hour    [Calendar/HOUR   1]
                            :day     [Calendar/DATE   1]
                            :week    [Calendar/DATE   7]
                            :month   [Calendar/MONTH  1]
                            :quarter [Calendar/MONTH  3]
                            :year    [Calendar/YEAR   1])]
    (.set cal unit (+ (.get cal unit)
                      (* amount multiplier)))
    (.getTime cal)))

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
      :=           {:$eq [{:$dateToString {:format "%Y-%m-%d"
                                           :date "$timestamp"}}
                          value]}
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


;;; ## CLAUSE APPLICATION

(defmulti field->$ class)

(defmethod field->$ Field [this]
  (str \$ (field->name this)))

(defn- current-timezone-offset
  "MongoDB doesn't really do timezone support, so we will *totally* fake it.
   When dealing with a `DateTimeField`, we'll add the current timezone offset to its value
   and apply the appropriate suffix to the strings we generate
   so grouping happens for the current timezone, instead of UTC.
   TODO - we should upgrade this to handle arbitrary timezones like via the Query Dict like the SQL DBs."
  []
  (let [ms (.getOffset (java.util.TimeZone/getDefault) (System/currentTimeMillis))
        seconds (/ ms 1000)
        minutes (/ seconds 60)
        hours   (/ minutes 60)
        minutes (mod minutes 60)]
    {:ms ms
     :str (format "%s%02d:%02d"
                  (if (< hours 0) "-" "+")
                  (Math/abs ^Integer hours)
                  minutes)}))

(defmethod field->$ DateTimeField [{unit :unit, {:keys [special-type], :as ^Field field} :field}]
  (let [tz-offset    (current-timezone-offset)
        $field       (field->$ field)
        $field       {$add [(:ms tz-offset)
                            (cond
                              (= special-type :timestamp_milliseconds)
                              {$add [(java.util.Date. 0) $field]}

                              (= special-type :timestamp_seconds)
                              {$add [(java.util.Date. 0) {$multiply [$field 1000]}]}

                              :else $field)]}
        date->string (fn [format-str]
                       {:___date {:$dateToString {:format (str format-str (:str tz-offset))
                                                  :date   $field}}})]
    (case unit
      :default         $field
      :minute          (date->string "%Y-%m-%dT%H:%M:00")
      :minute-of-hour  {$minute $field}
      :hour            (date->string "%Y-%m-%dT%H:00:00")
      :hour-of-day     {$hour $field}
      :day             (date->string "%Y-%m-%dT00:00:00")
      :day-of-week     {$dayOfWeek $field}
      :day-of-month    {$dayOfMonth $field}
      :day-of-year     {$dayOfYear $field}
      :week            nil
      :week-of-year    {$week $field}
      :month           (date->string "%Y-%m")
      :month-of-year   {$month $field}
      :quarter         nil
      :quarter-of-year nil #_{$divide [{$add [{$month $field} 2]}
                                       3]}
      :year            {$year $field})))

(defn- handle-order-by [{:keys [order-by]} pipeline]
  (if-not (seq order-by)
    pipeline
    (conj pipeline
          {$sort (into (array-map) (for [{:keys [field direction]} order-by]
                                     {(field->name field) (case direction
                                                                :ascending   1
                                                                :descending -1)}))})))

(defn- handle-filter [{filter-clause :filter} pipeline]
  (if-not filter-clause
    pipeline
    (conj pipeline
          {$match (parse-filter-clause filter-clause)})))

(defn- handle-fields [{:keys [fields]} pipeline]
  (if-not (seq fields)
    pipeline
    (conj pipeline
          {$project (into (array-map) (for [field fields]
                                        {(field->name field) (field->$ field)}))})))

(defn- handle-limit [{:keys [limit]} pipeline]
  (if-not limit
    pipeline
    (conj pipeline {$limit limit})))

(def ^:private ^:const ag-type->field-name
  {:avg      "avg"
   :count    "count"
   :distinct "count"
   :sum      "sum"})

(defn- ag-type->group-by-clause [{:keys [aggregation-type field]}]
  (if-not field
    (case aggregation-type
      :count {$sum 1})
    (case aggregation-type
      :avg      {$avg (field->$ field)}
      :count    {$sum {$cond {:if   (field->$ field)
                              :then 1
                              :else 0}}}
      :distinct {$addToSet (field->$ field)}
      :sum      {$sum (field->$ field)})))

(defn- handle-breakout+aggregation [{breakout-fields :breakout, {ag-type :aggregation-type, :as aggregation} :aggregation} pipeline]
  (if (or (not ag-type)
          (= ag-type :rows))
    pipeline
    (let [ag-field-name (ag-type->field-name ag-type)]
      (vec (concat pipeline
                   (filter identity
                           [(when (seq breakout-fields)
                              {$project {"_id"      "$_id"
                                         "___group" (into {} (for [field breakout-fields]                        ; create a totally sweet made-up column called __group
                                                               {(field->name field "___") (field->$ field)}))}}) ; to store the fields we'd like to group by
                            {$group {"_id"         (when (seq breakout-fields)
                                                     "$___group")
                                     ag-field-name (ag-type->group-by-clause aggregation)}}
                            {$sort {"_id" 1}}
                            {$project (merge {"_id"         false
                                              ag-field-name (if (= ag-type :distinct)
                                                              {$size "$count"} ; HACK
                                                              true)}
                                             (into {} (for [field breakout-fields]
                                                        {(field->name field "___") (format "$_id.%s" (field->name field "___"))})))}]))))))

(defn- handle-page [{{page-num :page items-per-page :items, :as page-clause} :page} pipeline]
  (if-not page-clause
    pipeline
    (conj pipeline
          {$skip (* items-per-page (dec page-num))}
          {$limit items-per-page})))


;;; # process + run

(defn- process-structured [query]
  (->> []
       (handle-filter query)
       (handle-breakout+aggregation query)
       (handle-order-by query)
       (handle-fields query)
       (handle-limit query)
       (handle-page query)))

;;; BREAKOUT FIELD NAME ESCAPING FOR $GROUP
;; We're not allowed to use field names that contain a period in the Mongo aggregation $group stage.
;; Not OK:
;;   {"$group" {"source.username" {"$first" {"$source.username"}, "_id" "$source.username"}}, ...}
;;
;; For *nested* Fields, we'll replace the '.' with '___', and restore the original names afterward.
;; Escaped:
;;   {"$group" {"source___username" {"$first" {"$source.username"}, "_id" "$source.username"}}, ...}
(defn- unescape-nested-field-names
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


(defn- unstringify-dates
  "Convert string dates, which we wrap in dictionaries like `{:___date <str>}`, back to `Timestamps`.
   This can't be done within the Mongo aggregation framework itself."
  [results]
  (for [row results]
    (into {} (for [[k v] row]
               {k (if (and (map? v)
                           (:___date v))
                    (u/parse-iso8601 (:___date v))
                    v)}))))

(defn- process-and-run-structured [{database :database, {{source-table-name :name} :source-table} :query, :as query}]
  {:pre [(map? database)
         (string? source-table-name)]}
  (binding [*query* query]
    (let [generated-query (process-structured (:query query))]
      (log-monger-form generated-query)
      (println "source-table-name generated-query ->" source-table-name generated-query)
      (println "database ->" database)
      (->> (with-mongo-connection [_ database]
             (mc/aggregate *mongo-connection* source-table-name generated-query
                           :allow-disk-use true))
           ;; ((fn [results]
           ;;    (println "RESULTS->" (u/pprint-to-str 'cyan results))
           ;;    results))
           unescape-nested-field-names
           unstringify-dates))))

(defn a []
  (metabase.driver/process-query {:type "query"
                                  :database 3
                                  :query {:aggregation  ["rows"]
                                          :source_table 23
                                          :filter       ["CONTAINS" 400 "BBQ"]
                                          :order_by     [[412 "ascending"]]}}))

(defn x []
  (metabase.test.data.datasets/with-dataset :mongo
    (require 'metabase.driver.query-processor-test)
    (println @(resolve 'metabase.driver.query-processor-test/checkins:1-per-day))
    (metabase.test.data/with-temp-db [_ @(resolve 'metabase.driver.query-processor-test/checkins:1-per-day)]
      (driver/process-query
       {:database (metabase.test.data/db-id)
        :type     :query
        :query    {:source_table (metabase.test.data/id :checkins)
                   :aggregation  ["count"]
                   :filter       ["TIME_INTERVAL" (metabase.test.data/id :checkins :timestamp) "current" "day"]}}))))
