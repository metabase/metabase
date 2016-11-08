(ns metabase.driver.mongo.query-processor
  (:refer-clojure :exclude [find sort])
  (:require (clojure [set :as set]
                     [string :as s])
            [clojure.tools.logging :as log]
            [clojure.walk :as walk]
            [cheshire.core :as json]
            (monger [collection :as mc]
                    [operators :refer :all]
                    joda-time)
            [metabase.driver.mongo.util :refer [with-mongo-connection *mongo-connection* values->base-type]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor :as qp]
            (metabase.query-processor [annotate :as annotate]
                                      [interface :refer [qualified-name-components map->DateTimeField map->DateTimeValue]])
            [metabase.util :as u]
            [clj-time.core :refer [date-time]]
            [clj-time.coerce :as c])
  (:import java.sql.Timestamp
           java.util.Date
           (com.mongodb CommandResult DB)
           clojure.lang.PersistentArrayMap
           org.bson.types.ObjectId
           (metabase.query_processor.interface AgFieldRef
                                               DateTimeField
                                               DateTimeValue
                                               Field
                                               RelativeDateTimeValue
                                               Value)))

(def ^:private ^:const $subtract :$subtract)


;; # DRIVER QP INTERFACE

(def ^:dynamic ^:private *query* nil)

(defn- log-monger-form [form]
  (when-not qp/*disable-qp-logging*
    (log/debug (u/format-color 'green "\nMONGO AGGREGATION PIPELINE:\n%s\n"
                 (->> form
                      (walk/postwalk #(if (symbol? %) (symbol (name %)) %)) ; strip namespace qualifiers from Monger form
                      u/pprint-to-str) "\n"))))


;;; # STRUCTURED QUERY PROCESSOR

;;; ## FORMATTING

;; We're not allowed to use field names that contain a period in the Mongo aggregation $group stage.
;; Not OK:
;;   {"$group" {"source.username" {"$first" {"$source.username"}, "_id" "$source.username"}}, ...}
;;
;; For *nested* Fields, we'll replace the '.' with '___', and restore the original names afterward.
;; Escaped:
;;   {"$group" {"source___username" {"$first" {"$source.username"}, "_id" "$source.username"}}, ...}

(defprotocol ^:private IRValue
  (^:private ->rvalue [this]
    "Format this `Field` or `Value` for use as the right hand value of an expression, e.g. by adding `$` to a `Field`'s name"))

(defprotocol ^:private IField
  (^:private ->lvalue ^String [this]
    "Return an escaped name that can be used as the name of a given Field.")
  (^:private ->initial-rvalue [this]
    "Return the rvalue that should be used in the *initial* projection for this `Field`."))


(defn- field->name
  "Return a single string name for FIELD. For nested fields, this creates a combined qualified name."
  ^String [^Field field, ^String separator]
  (s/join separator (rest (qualified-name-components field))))

(defmacro ^:private mongo-let
  {:style/indent 1}
  [[field value] & body]
  {:$let {:vars {(keyword field) value}
          :in   `(let [~field ~(keyword (str "$$" (name field)))]
                   ~@body)}})

;; As mentioned elsewhere for some arcane reason distinct aggregations come back named "count" and every thing else as the aggregation type
(defn- ag-type->field-name [ag-type]
  (when ag-type
    (if (= ag-type :distinct)
      "count"
      (name ag-type))))

(extend-protocol IField
  Field
  (->lvalue [this]
    (field->name this "___"))

  (->initial-rvalue [this]
    (str \$ (field->name this ".")))

  AgFieldRef
  (->lvalue [{:keys [index]}]
    (let [{:keys [aggregation-type]} (nth (:aggregation (:query *query*)) index)]
      (ag-type->field-name aggregation-type)))

  DateTimeField
  (->lvalue [{unit :unit, ^Field field :field}]
    (str (->lvalue field) "~~~" (name unit)))

  (->initial-rvalue [{unit :unit, {:keys [special-type], :as ^Field field} :field}]
    (mongo-let [field (as-> field <>
                        (->initial-rvalue <>)
                        (cond
                          (isa? special-type :type/UNIXTimestampMilliseconds)
                          {$add [(java.util.Date. 0) <>]}

                          (isa? special-type :type/UNIXTimestampSeconds)
                          {$add [(java.util.Date. 0) {$multiply [<> 1000]}]}

                          :else <>))]
      (let [stringify (fn stringify
                        ([format-string]
                         (stringify format-string field))
                        ([format-string fld]
                         {:___date {:$dateToString {:format format-string
                                                    :date   fld}}}))]
        (case unit
          :default         field
          :minute          (stringify "%Y-%m-%dT%H:%M:00")
          :minute-of-hour  {$minute field}
          :hour            (stringify "%Y-%m-%dT%H:00:00")
          :hour-of-day     {$hour field}
          :day             (stringify "%Y-%m-%d")
          :day-of-week     {$dayOfWeek field}
          :day-of-month    {$dayOfMonth field}
          :day-of-year     {$dayOfYear field}
          :week            (stringify "%Y-%m-%d" {$subtract [field
                                                             {$multiply [{$subtract [{$dayOfWeek field}
                                                                                     1]}
                                                                         (* 24 60 60 1000)]}]})
          :week-of-year    {$add [{$week field}
                                  1]}
          :month           (stringify "%Y-%m")
          :month-of-year   {$month field}
          ;; For quarter we'll just subtract enough days from the current date to put it in the correct month and stringify it as yyyy-MM
          ;; Subtracting (($dayOfYear(field) % 91) - 3) days will put you in correct month. Trust me.
          :quarter         (stringify "%Y-%m" {$subtract [field
                                                          {$multiply [{$subtract [{$mod [{$dayOfYear field}
                                                                                         91]}
                                                                                  3]}
                                                                      (* 24 60 60 1000)]}]})
          :quarter-of-year (mongo-let [month   {$month field}]
                             {$divide [{$subtract [{$add [month 2]}
                                                   {$mod [{$add [month 2]}
                                                          3]}]}
                                       3]})
          :year            {$year field})))))


(extend-protocol IRValue
  nil (->rvalue [_] nil)

  Field
  (->rvalue [this]
    (str \$ (->lvalue this)))

  DateTimeField
  (->rvalue [this]
    ;; omf: date/time fields using native Mongo operators
    (let [unit (:unit this)
      field (:field this)]
      (case (or unit :default)
        :default         (->rvalue field)
        :minute          {:$dateToString {:format "%Y-%m-%d %H:%M" :date (->rvalue field)}}
        :minute-of-hour  {:$minute (->rvalue field)}
        :hour            {:$dateToString {:format "%Y-%m-%d %H" :date (->rvalue field)}}
        :hour-of-day     {:$hour (->rvalue field)}
        :day             {:$dateToString {:format "%Y-%m-%d" :date (->rvalue field)}}
        :day-of-week     {:$dayOfWeek (->rvalue field)}
        :day-of-month    {:$dayOfMonth (->rvalue field)}
        :day-of-year     {:$dayOfYear (->rvalue field)}
        :week            {:$dateToString {:format "%Y-%m-%d" :date { :$subtract [ (->rvalue field) {:$multiply [ {:$subtract [{:$dayOfWeek (->rvalue field)}, 1]}, 86400000]}] }}}
        :week-of-year    {:$add [{:$week (->rvalue field)}, 1]}
        :month           {:$dateToString {:format "%Y-%m" :date (->rvalue field)}}
        :month-of-year   {:$month (->rvalue field)}
        :quarter         {:$dateToString {:format "%Y-%m" :date (->rvalue field)}} 
        :quarter-of-year {:$substr [{:$add [{:$divide [{:$subtract [{:$month (->rvalue field)} ,1]} ,3]} ,1]} ,0 ,1]}
        :year            {:$year (->rvalue field)})))

  Value
  (->rvalue [{value :value, {:keys [base-type]} :field}]
    (if (isa? base-type :type/MongoBSONID)
      (ObjectId. (str value))
      value))

  DateTimeValue
  (->rvalue [{^java.sql.Timestamp value :value, {:keys [unit]} :field}]
    (let [stringify (fn stringify
                      ([format-string]
                       (stringify format-string value))
                      ([format-string v]
                       ;; omf: date/time values as joda-times known to Monger 
                       (c/from-long (c/to-long (u/format-date format-string v)))))
          extract   (u/rpartial u/date-extract value)]
      (case (or unit :default)
        :default         (u/->Date value)
        :minute          (stringify "yyyy-MM-dd'T'HH:mm:00")
        :minute-of-hour  (extract :minute)
        :hour            (stringify "yyyy-MM-dd'T'HH:00:00")
        :hour-of-day     (extract :hour)
        :day             (stringify "yyyy-MM-dd")
        :day-of-week     (extract :day-of-week)
        :day-of-month    (extract :day-of-month)
        :day-of-year     (extract :day-of-year)
        :week            (stringify "yyyy-MM-dd" (u/date-trunc :week value))
        :week-of-year    (extract :week-of-year)
        :month           (stringify "yyyy-MM")
        :month-of-year   (extract :month)
        :quarter         (stringify "yyyy-MM" (u/date-trunc :quarter value))
        :quarter-of-year (extract :quarter-of-year)
        :year            (extract :year))))

  RelativeDateTimeValue
  (->rvalue [{:keys [amount unit field]}]
    (->rvalue (map->DateTimeValue {:value (u/relative-date (or unit :day) amount)
                                   :field field}))))


;;; ## CLAUSE APPLICATION

;;; ### initial projection

(defn- add-initial-projection [query pipeline]
  (let [all-fields (distinct (annotate/collect-fields query :keep-date-time-fields))]
    (when (seq all-fields)
      {$project (into (array-map) (for [field all-fields]
                                    {(->lvalue field) (->initial-rvalue field)}))})))


;;; ### filter

;; omf: adds one day to date
(defn- add-one-day [date]
  (c/from-long (+ (c/to-long date) 86400000))
)

(defn- parse-filter-subclause [{:keys [filter-type field value] :as filter} & [negate?]]
  ;; omf: Maybe there is a better way to do this. 'field' is being received as field: {...} or as field:{field: {...}}
  ;; We need basetype so we can do a specific setup for 'between' and '=' for datetimes
  (let [basetype (when field (or (:base-type field) (:base-type (:field field))))
        field (when field (or (:field-name field) (:field-name (:field field))))
        value (when value (->rvalue value))
        v     (case filter-type
                ;; omf: 'max' date in a date range is next day at 00:00:00.000
                :between     (cond (= basetype :type/DateTime)
                               {$gte (->rvalue (:min-val filter))
                                $lt (add-one-day (->rvalue (:max-val filter)))}
                             :else 
                               {$gte (->rvalue (:min-val filter))
                                $lte (->rvalue (:max-val filter))})
                :contains    (re-pattern value)
                :starts-with (re-pattern (str \^ value))
                :ends-with   (re-pattern (str value \$))
                ;; omf: a single day ends before next day at 00:00:00.000
                :=           (if (= basetype :type/DateTime) {$gte value $lt (add-one-day value)} {"$eq" value})
                :!=          {$ne  value}
                :<           {$lt  value}
                :>           {$gt  value}
                :<=          {$lte value}
                :>=          {$gte value})]
    {field (if negate?
             {$not v}
             v)}))

(defn- parse-filter-clause [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and {$and (mapv parse-filter-clause subclauses)}
    :or  {$or  (mapv parse-filter-clause subclauses)}
    :not (parse-filter-subclause subclause :negate)
    nil  (parse-filter-subclause clause)))

(defn- handle-filter [{filter-clause :filter} pipeline]
  (when filter-clause
    {$match (parse-filter-clause filter-clause)}))


;;; ### aggregation

(defn- aggregation->rvalue [{:keys [aggregation-type field]}]
  {:pre [(keyword? aggregation-type)]}
  (if-not field
    (case aggregation-type
      :count {$sum 1})
    (case aggregation-type
      :avg      {$avg (->rvalue field)}
      :count    {$sum {$cond {:if   (->rvalue field)
                              :then 1
                              :else 0}}}
      :distinct {$addToSet (->rvalue field)}
      :sum      {$sum (->rvalue field)}
      :min      {$min (->rvalue field)}
      :max      {$max (->rvalue field)})))

(defn- handle-breakout+aggregation [{breakout-fields :breakout, aggregations :aggregation} pipeline]
  (let [aggregations? (seq aggregations)
        breakout?     (seq breakout-fields)]
    (when (or aggregations? breakout?)
      (filter identity
              [;; From this (~14 secs):
               ;; [
               ;; {"$project":{"_id":"$_id","___group":{"adr":"$adr"},"len":"$len"}},
               ;; {"$group":{"_id":"$___group","avg":{"$avg":"$len"}}},
               ;; {"$sort":{"_id":1}},
               ;; {"$project":{"_id":false,"avg":true,"adr":"$_id.adr"}},
               ;; {"$sort":{"adr":1}}
               ;; ]
               ;;
               ;; To this (~6 secs):
               ;; [
               ;; {"$group":{"_id":{"adr":"$adr"},"avg":{"$avg":"$len"}}},
               ;; {"$sort":{"_id":1}},
               ;; {"$project":{"_id":false,"adr":"$_id.adr", "avg":1}},
               ;; {"$sort":{"adr":1}}
               ;; ]

               ;; Now project onto the __group and the aggregation rvalue
               {$group (merge {"_id" (when breakout?
                                       (into {} (for [field breakout-fields]
                                                   {(->lvalue field) (->rvalue field)})))}
                              (into {} (for [{ag-type :aggregation-type, :as aggregation} aggregations]
                                         {(ag-type->field-name ag-type) (aggregation->rvalue aggregation)})))}
               ;; Sort by _id (___group)
               {$sort {"_id" 1}}
               ;; now project back to the fields we expect
               {$project (merge {"_id" false}
                                (into {} (for [{ag-type :aggregation-type} aggregations]
                                         {(ag-type->field-name ag-type) (if (= ag-type :distinct)
                                                                          {$size "$count"} ; HACK
                                                                          true)}))
                                (into {} (for [field breakout-fields]
                                           {(->lvalue field) (format "$_id.%s" (->lvalue field))})))}]))))

;;; ### order-by

(defn- handle-order-by [{:keys [order-by]} pipeline]
  (when (seq order-by)
    {$sort (into (array-map) (for [{:keys [field direction]} order-by]
                               {(->lvalue field) (case direction
                                                   :ascending   1
                                                   :descending -1)}))}))


;;; ### fields

(defn- handle-fields [{:keys [fields]} pipeline]
  (when (seq fields)
    ;; add project _id = false to keep _id from getting automatically returned unless explicitly specified
    {$project (into (array-map "_id" false)
                    (for [field fields]
                      {(->lvalue field) (->rvalue field)}))}))


;;; ### limit

(defn- handle-limit [{:keys [limit]} pipeline]
  (when limit
    {$limit limit}))


;;; ### page

(defn- handle-page [{{page-num :page items-per-page :items, :as page-clause} :page} pipeline]
  (when page-clause
    [{$skip (* items-per-page (dec page-num))}
     {$limit items-per-page}]))


;;; # process + run

(defn- generate-aggregation-pipeline
  "Generate the aggregation pipeline. Returns a sequence of maps representing each stage."
  [query]
  (loop [pipeline [], [f & more] [;; omf: disabled
                                  ;;add-initial-projection
                                  handle-filter
                                  handle-breakout+aggregation
                                  handle-order-by
                                  handle-fields
                                  handle-limit
                                  handle-page]]
    (let [out      (f query pipeline)
          pipeline (cond
                     (nil? out)        pipeline
                     (map? out)        (conj pipeline out)
                     (sequential? out) (vec (concat pipeline out)))]
      (if-not (seq more)
        pipeline
        (recur pipeline more)))))

(defn- unescape-names
  "Restore the original, unescaped nested Field names in the keys of RESULTS.
   E.g. `:source___service` becomes `:source.service`"
  [results]
  ;; Build a map of escaped key -> unescaped key by looking at the keys in the first result
  ;; e.g. {:source___username :source.username}
  (let [replacements (into {} (for [k (keys (first results))]
                                (let [k-str     (name k)
                                      unescaped (-> k-str
                                                    (s/replace #"___" ".")
                                                    (s/replace #"~~~(.+)$" ""))]
                                  (when-not (= k-str unescaped)
                                    {k (keyword unescaped)}))))]
    ;; If the map is non-empty then map set/rename-keys over the results with it
    (if-not (seq replacements)
      results
      (do (log/debug "Unescaping fields:" (u/pprint-to-str 'green replacements))
          (for [row results]
            (set/rename-keys row replacements))))))


(defn- unstringify-dates
  "Convert string dates, which we wrap in dictionaries like `{:___date <str>}`, back to `Timestamps`.
   This can't be done within the Mongo aggregation framework itself."
  [results]
  (for [row results]
    (into {} (for [[k v] row]
               {k (if (and (map? v)
                           (:___date v))
                    (u/->Timestamp (:___date v))
                    v)}))))


(defn mbql->native
  "Process and run an MBQL query."
  [{database :database, {{source-table-name :name} :source-table} :query, :as query}]
  {:pre [(map? database)
         (string? source-table-name)]}
  (binding [*query* query]
    (let [generated-pipeline (generate-aggregation-pipeline (:query query))]
      (log-monger-form generated-pipeline)
      {:query      generated-pipeline
       :collection source-table-name
       :mbql?      true})))

;; omf: if value 'is' a ISODate, extract the date/time string and convert it to date object
(defn- to-date-object [value]
  (if (and (string? value) (clojure.string/starts-with? value "ISODate"))
    (let [reg (re-seq #"ISODate\((.*?)\)" value)
          isodate (get (first reg) 1)]
          (c/from-long (c/to-long isodate)))
    value))

;; omf: possibly reduce-recurse contained map objects rying to find ISODate values
(defn recurse-map [altered-map k v]
  (if (map? v)
    (assoc altered-map k (reduce-kv recurse-map {} v))
    (assoc altered-map k (to-date-object v)))
)

;; omf: parse the query collection and reduce-recurse each map object
(defn- parse-dates [query]
  (let [reg query]
    (loop [f (first reg)
           r (rest reg)
           m []]
      (if-not f
        m
        (recur (first r) (rest r) (conj m (reduce-kv recurse-map {} f))))
    )))

(defn execute-query
  "Process and run a native MongoDB query."
  [{{:keys [collection query mbql?]} :native, database :database}]
  {:pre [query
         (string? collection)
         (map? database)]}
  (let [query   (if (string? query)
                  (parse-dates (json/parse-string query keyword))
                  query)
        results (mc/aggregate *mongo-connection* collection query
                              :allow-disk-use true)
        results (if (sequential? results)
                  results
                  [results])
        ;; if we formed the query using MBQL then we apply a couple post processing functions
        results (if-not mbql? results
                              (-> results
                                  unescape-names
                                  unstringify-dates))
        columns (vec (keys (first results)))]
    {:columns   columns
     :rows      (for [row results]
                  (mapv row columns))
     :annotate? mbql?}))

