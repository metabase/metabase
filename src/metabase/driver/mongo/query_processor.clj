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
            (metabase [config :as config]
                      [db :refer :all])
            [metabase.driver.query-processor :as qp]
            (metabase.driver.query-processor [annotate :as annotate]
                                             [interface :refer [qualified-name-components map->DateTimeField map->DateTimeValue]])
            [metabase.driver.mongo.util :refer [with-mongo-connection *mongo-connection*]]
            [metabase.models.field :as field]
            [metabase.util :as u])
  (:import java.sql.Timestamp
           java.util.Date
           (com.mongodb CommandResult
                        DB)
           clojure.lang.PersistentArrayMap
           org.bson.types.ObjectId
           (metabase.driver.query_processor.interface DateTimeField
                                                      DateTimeValue
                                                      Field
                                                      OrderByAggregateField
                                                      RelativeDateTimeValue
                                                      Value)))

(def ^:private ^:const $subtract :$subtract)


;; # DRIVER QP INTERFACE

(def ^:dynamic ^:private *query* nil)

(defn- log-mongo-pipeline [pipeline]
  (when-not qp/*disable-qp-logging*
    (log/debug (u/format-color 'blue "\nMONGO AGGREGATION PIPELINE:\n%s\n"
                 (->> pipeline
                      (walk/postwalk #(if (symbol? %) (symbol (name %)) %)) ; strip namespace qualifiers from Monger form
                      u/pprint-to-str) "\n"))))

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

(defn process-and-run-native
  "Process and run a native MongoDB query."
  [_ query]
  (let [results (eval-raw-command (:query (:native query)))]
    (if (sequential? results) results
        [results])))


;;; # STRUCTURED QUERY PROCESSOR

;;; ## FORMATTING

;; We're not allowed to use field names that contain a period in the Mongo aggregation $group stage.
;; Not OK:
;;   {"$group" {"source.username" {"$first" {"$source.username"}, "_id" "$source.username"}}, ...}
;;
;; For *nested* Fields, we'll replace the '.' with '___', and restore the original names afterward.
;; Escaped:
;;   {"$group" {"source___username" {"$first" {"$source.username"}, "_id" "$source.username"}}, ...}

(defprotocol IRValue
  (->rvalue [this]
    "Format this `Field` or `Value` for use as the right hand value of an expression, e.g. by adding `$` to a `Field`'s name"))

(defprotocol IField
  (->lvalue ^String [this]
    "Return an escaped name that can be used as the name of a given Field.")
  (->initial-rvalue [this]
    "Return the rvalue that should be used in the *initial* projection for this `Field`."))


(defn- field->name
  "Return a single string name for FIELD. For nested fields, this creates a combined qualified name."
  ^String [^Field field, ^String separator]
  (apply str (interpose separator (rest (qualified-name-components field)))))

(defmacro ^:private mongo-let [[field value] & body]
  {:$let {:vars {(keyword field) value}
          :in   `(let [~field ~(keyword (str "$$" (name field)))]
                   ~@body)}})

(extend-protocol IField
  Field
  (->lvalue [this]
    (field->name this "___"))

  (->initial-rvalue [this]
    (str \$ (field->name this ".")))

  OrderByAggregateField
  (->lvalue [_]
    (let [{:keys [aggregation-type]} (:aggregation (:query *query*))]
      (case aggregation-type
        :avg      "avg"
        :count    "count"
        :distinct "count"
        :sum      "sum")))

  DateTimeField
  (->lvalue [{unit :unit, ^Field field :field}]
    (str (->lvalue field) "~~~" (name unit)))

  (->initial-rvalue [{unit :unit, {:keys [special-type], :as ^Field field} :field}]
    (mongo-let [field (as-> field <>
                        (->initial-rvalue <>)
                        (cond
                          (= special-type :timestamp_milliseconds)
                          {$add [(java.util.Date. 0) <>]}

                          (= special-type :timestamp_seconds)
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
  Field
  (->rvalue [this]
    (str \$ (->lvalue this)))

  DateTimeField
  (->rvalue [this]
    (str \$ (->lvalue this)))

  Value
  (->rvalue [{value :value, {:keys [field-name base-type]} :field}]
    (if (and (= field-name "_id")
             (= base-type  :UnknownField))
      `(ObjectId. ~value)
      value))

  DateTimeValue
  (->rvalue [{^java.sql.Timestamp value :value, {:keys [unit]} :field}]
    (let [stringify (fn stringify
                      ([format-string]
                       (stringify format-string value))
                      ([format-string v]
                       {:___date (u/format-date format-string v)}))
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
  (->rvalue [{:keys [amount unit field], :as this}]
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

(defn- parse-filter-subclause [{:keys [filter-type field value] :as filter}]
  (let [field (when field (->lvalue field))
        value (when value (->rvalue value))]
    (case filter-type
      :inside      (let [lat (:lat filter)
                         lon (:lon filter)]
                     {$and [{(->lvalue (:field lat)) {$gte (->rvalue (:min lat)), $lte (->rvalue (:max lat))}}
                            {(->lvalue (:field lon)) {$gte (->rvalue (:min lon)), $lte (->rvalue (:max lon))}}]})
      :between     {field {$gte (->rvalue (:min-val filter))
                           $lte (->rvalue (:max-val filter))}}
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

(defn- handle-filter [{filter-clause :filter} pipeline]
  (when filter-clause
    {$match (parse-filter-clause filter-clause)}))


;;; ### aggregation

(def ^:private ^:const ag-type->field-name
  {:avg      "avg"
   :count    "count"
   :distinct "count"
   :sum      "sum"})

(defn- aggregation->rvalue [{:keys [aggregation-type field]}]
  (if-not field
    (case aggregation-type
      :count {$sum 1})
    (case aggregation-type
      :avg      {$avg (->rvalue field)}
      :count    {$sum {$cond {:if   (->rvalue field)
                              :then 1
                              :else 0}}}
      :distinct {$addToSet (->rvalue field)}
      :sum      {$sum (->rvalue field)})))

(defn- handle-breakout+aggregation [{breakout-fields :breakout, {ag-type :aggregation-type, ag-field :field, :as aggregation} :aggregation} pipeline]
  (let [aggregation? (and ag-type
                          (not= ag-type :rows))
        breakout?    (seq breakout-fields)]
    (when (or aggregation? breakout?)
      (let [ag-field-name (ag-type->field-name ag-type)]
        (filter identity
                [ ;; create a totally sweet made-up column called __group to store the fields we'd like to group by
                 (when breakout?
                   {$project (merge
                              {"_id"      "$_id"
                               "___group" (into {} (for [field breakout-fields]
                                                     {(->lvalue field) (->rvalue field)}))}
                              (when ag-field
                                {(->lvalue ag-field) (->rvalue ag-field)}))})
                 ;; Now project onto the __group and the aggregation rvalue
                 {$group (merge {"_id" (when breakout?
                                         "$___group")}
                                (when aggregation
                                  {ag-field-name (aggregation->rvalue aggregation)}))}
                 ;; Sort by _id (___group)
                 {$sort {"_id" 1}}
                 ;; now project back to the fields we expect
                 {$project (merge {"_id" false}
                                  (when aggregation?
                                    {ag-field-name (if (= ag-type :distinct)
                                                     {$size "$count"} ; HACK
                                                     true)})
                                  (into {} (for [field breakout-fields]
                                             {(->lvalue field) (format "$_id.%s" (->lvalue field))})))}])))))


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

(defn- generate-aggregation-pipeline [query]
  (loop [pipeline [], [f & more] [add-initial-projection
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

(defn process-and-run-structured
  "Process and run a structured MongoDB query."
  [_ {database :database, {{source-table-name :name} :source-table} :query, :as query}]
  {:pre [(map? database)
         (string? source-table-name)]}
  (binding [*query* query]
    (let [generated-pipeline (generate-aggregation-pipeline (:query query))]
      (log-mongo-pipeline generated-pipeline)
      (->> (with-mongo-connection [_ database]
             (mc/aggregate *mongo-connection* source-table-name generated-pipeline
                           :allow-disk-use true))
           unescape-names
           unstringify-dates))))
