(ns metabase.driver.mongo.query-processor
  "Logic for translating MBQL queries into Mongo Aggregation Pipeline queries. See
  https://docs.mongodb.com/manual/reference/operator/aggregation-pipeline/ for more details."
  (:refer-clojure :exclude [find sort])
  (:require [cheshire.core :as json]
            [clojure
             [set :as set]
             [string :as s]
             [walk :as walk]]
            [clojure.tools.logging :as log]
            [metabase.driver.mongo.util :refer [*mongo-connection*]]
            [metabase.query-processor
             [annotate :as annotate]
             [interface :as i]]
            [metabase.util :as u]
            [monger joda-time
             [collection :as mc]
             [operators :refer :all]])
  (:import java.sql.Timestamp
           java.util.Date
           [metabase.query_processor.interface AgFieldRef DateTimeField DateTimeValue Field FieldLiteral
            RelativeDateTimeValue Value]
           org.bson.types.ObjectId
           org.joda.time.DateTime))

(def ^:private ^:const $subtract :$subtract)


;; # DRIVER QP INTERFACE

(def ^:dynamic ^:private *query* nil)

(defn- log-monger-form [form]
  (when-not i/*disable-qp-logging*
    (log/debug (u/format-color 'green "\nMONGO AGGREGATION PIPELINE:\n%s\n"
                 (->> form
                      ;; strip namespace qualifiers from Monger form
                      (walk/postwalk #(if (symbol? %) (symbol (name %)) %))
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
    "Format this `Field` or `Value` for use as the right hand value of an expression, e.g. by adding `$` to a
    `Field`'s name"))

(defprotocol ^:private IField
  (^:private ->lvalue ^String [this]
    "Return an escaped name that can be used as the name of a given Field.")
  (^:private ->initial-rvalue [this]
    "Return the rvalue that should be used in the *initial* projection for this `Field`."))


(defn- field->name
  "Return a single string name for FIELD. For nested fields, this creates a combined qualified name."
  ^String [^Field field, ^String separator]
  (s/join separator (rest (i/qualified-name-components field))))

(defmacro ^:private mongo-let
  {:style/indent 1}
  [[field value] & body]
  {:$let {:vars {(keyword field) value}
          :in   `(let [~field ~(keyword (str "$$" (name field)))]
                   ~@body)}})

;; As mentioned elsewhere for some arcane reason distinct aggregations come back named "count" and every thing else as
;; the aggregation type
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

  FieldLiteral
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
          ;; For quarter we'll just subtract enough days from the current date to put it in the correct month and
          ;; stringify it as yyyy-MM Subtracting (($dayOfYear(field) % 91) - 3) days will put you in correct month.
          ;; Trust me.
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
    (str \$ (->lvalue this)))

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
                       {:___date (u/format-date format-string v)}))
          extract   (u/rpartial u/date-extract value)]
      (case (or unit :default)
        :default         (some-> value u/->Date)
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
    (->rvalue (i/map->DateTimeValue {:value (u/relative-date (or unit :day) amount)
                                     :field field}))))


;;; ## CLAUSE APPLICATION

;;; ### initial projection

(defn- add-initial-projection [query pipeline-ctx]
  (let [all-fields (distinct (annotate/collect-fields query :keep-date-time-fields))]
    (if-not (seq all-fields)
      pipeline-ctx
      (let [projections (for [field all-fields]
                          [(->lvalue field) (->initial-rvalue field)])]
        (-> pipeline-ctx
            (assoc  :projections (doall (map (comp keyword first) projections)))
            (update :query conj {$project (into (hash-map) projections)}))))))


;;; ### filter

(defn- parse-filter-subclause [{:keys [filter-type field value case-sensitive?] :as filter} & [negate?]]
  (let [field (when field (->lvalue field))
        value (when value (->rvalue value))
        v     (case filter-type
                :between     {$gte (->rvalue (:min-val filter))
                              $lte (->rvalue (:max-val filter))}
                :contains    (re-pattern (str (when-not case-sensitive? "(?i)")    value))
                :starts-with (re-pattern (str (when-not case-sensitive? "(?i)") \^ value))
                :ends-with   (re-pattern (str (when-not case-sensitive? "(?i)")    value \$))
                :=           {"$eq" value}
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

(defn- handle-filter [{filter-clause :filter} pipeline-ctx]
  (if-not filter-clause
    pipeline-ctx
    (update pipeline-ctx :query conj {$match (parse-filter-clause filter-clause)})))


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

(defn- breakouts-and-ags->projected-fields
  "Determine field projections for MBQL breakouts and aggregations. Returns a sequence of pairs like
  `[projectied-field-name source]`."
  [breakout-fields aggregations]
  (concat
   (for [{ag-type :aggregation-type} aggregations]
     [(ag-type->field-name ag-type) (if (= ag-type :distinct)
                                      {$size "$count"} ; HACK
                                      true)])
   (for [field breakout-fields]
     [(->lvalue field) (format "$_id.%s" (->lvalue field))])))

(defn- breakouts-and-ags->pipeline-stages
  "Return a sequeunce of aggregation pipeline stages needed to implement MBQL breakouts and aggregations."
  [projected-fields breakout-fields aggregations]
  (remove
   nil?
   [ ;; create a totally sweet made-up column called `___group` to store the fields we'd
    ;; like to group by
    (when (seq breakout-fields)
      {$project (merge {"_id"      "$_id"
                        "___group" (into {} (for [field breakout-fields]
                                              {(->lvalue field) (->rvalue field)}))}
                       (into {} (for [{ag-field :field} aggregations
                                      :when             ag-field]
                                  {(->lvalue ag-field) (->rvalue ag-field)})))})
    ;; Now project onto the __group and the aggregation rvalue
    {$group (merge
             {"_id" (when (seq breakout-fields)
                      "$___group")}
             (into {} (for [{ag-type :aggregation-type, :as aggregation} aggregations]
                        {(ag-type->field-name ag-type) (aggregation->rvalue aggregation)})))}
    ;; Sort by _id (___group)
    {$sort {"_id" 1}}
    ;; now project back to the fields we expect
    {$project (merge {"_id" false}
                     (into {} projected-fields))}]))

(defn- handle-breakout+aggregation
  "Add projections, groupings, sortings, and other things needed to the Query pipeline context (`pipeline-ctx`) for
  MBQL `aggregations` and `breakout-fields`."
  [{breakout-fields :breakout, aggregations :aggregation} pipeline-ctx]
  (if-not (or (seq aggregations) (seq breakout-fields))
    ;; if both aggregations and breakouts are empty, there's nothing to do...
    pipeline-ctx
    ;; determine the projections we'll need. projected-fields is like [[projected-field-name source]]`
    (let [projected-fields (breakouts-and-ags->projected-fields breakout-fields aggregations)]
      (-> pipeline-ctx
          ;; add :projections key which is just a sequence of the names of projections from above
          (assoc :projections (vec (for [[field] projected-fields]
                                     (keyword field))))
          ;; now add additional clauses to the end of :query as applicable
          (update :query into (breakouts-and-ags->pipeline-stages projected-fields breakout-fields aggregations))))))


;;; ### order-by

(defn- handle-order-by [{:keys [order-by]} pipeline-ctx]
  (if-not (seq order-by)
    pipeline-ctx
    (update pipeline-ctx :query conj {$sort (into (hash-map)
                                                  (for [{:keys [field direction]} order-by]
                                                    [(->lvalue field) (case direction
                                                                        :ascending   1
                                                                        :descending -1)]))})))

;;; ### fields

(defn- handle-fields [{:keys [fields]} pipeline-ctx]
  (if-not (seq fields)
    pipeline-ctx
    (let [new-projections (doall (map #(vector (->lvalue %) (->rvalue %)) fields))]
      (-> pipeline-ctx
          (assoc :projections (map (comp keyword first) new-projections))
          ;; add project _id = false to keep _id from getting automatically returned unless explicitly specified
          (update :query conj {$project (merge {"_id" false}
                                               (into (hash-map) new-projections))})))))

;;; ### limit

(defn- handle-limit [{:keys [limit]} pipeline-ctx]
  (if-not limit
    pipeline-ctx
    (update pipeline-ctx :query conj {$limit limit})))


;;; ### page

(defn- handle-page [{{page-num :page items-per-page :items, :as page-clause} :page} pipeline-ctx]
  (if-not page-clause
    pipeline-ctx
    (update pipeline-ctx :query into [{$skip (* items-per-page (dec page-num))}
                                      {$limit items-per-page}])))


;;; # process + run

(defn- generate-aggregation-pipeline
  "Generate the aggregation pipeline. Returns a sequence of maps representing each stage."
  [query]
  (reduce (fn [pipeline-ctx f]
            (f query pipeline-ctx))
          {:projections [], :query []}
          [add-initial-projection
           handle-filter
           handle-breakout+aggregation
           handle-order-by
           handle-fields
           handle-limit
           handle-page]))

(defn- create-unescaping-rename-map [original-keys]
  (into {} (for [k original-keys]
             (let [k-str     (name k)
                   unescaped (-> k-str
                                 (s/replace #"___" ".")
                                 (s/replace #"~~~(.+)$" ""))]
               (when-not (= k-str unescaped)
                 {k (keyword unescaped)})))))

(defn- unescape-names
  "Restore the original, unescaped nested Field names in the keys of RESULTS.
   E.g. `:source___service` becomes `:source.service`"
  [results]
  ;; Build a map of escaped key -> unescaped key by looking at the keys in the first result
  ;; e.g. {:source___username :source.username}
  (let [replacements (create-unescaping-rename-map (keys (first results)))]
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


;;; --------------------------------- Handling ISODate(...) and ObjectId(...) forms ----------------------------------

;; In Mongo it's fairly common use ISODate(...) or ObjectId(...) forms in queries, which unfortunately are not valid
;; JSON, and thus cannot be parsed by Cheshire. But we are clever so we will:
;;
;; 1) Convert forms like ISODate(...) to valid JSON forms like ["___ISODate", ...]
;; 2) Parse Normally
;; 3) Walk the parsed JSON and convert forms like [:___ISODate ...] to JodaTime dates, and [:___ObjectId ...] to BSON
;;    IDs

;; See https://docs.mongodb.com/manual/core/shell-types/ for a list of different supported types
(def ^:private fn-name->decoder
  {:ISODate    (fn [arg]
                 (DateTime. arg))
   :ObjectId   (fn [^String arg]
                 (ObjectId. arg))
   ;; it looks like Date() just ignores any arguments return a date string formatted the same way the Mongo console
   ;; does
   :Date       (fn [& _]
                 (u/format-date "EEE MMM dd yyyy HH:mm:ss z"))
   :NumberLong (fn [^String s]
                 (Long/parseLong s))
   :NumberInt  (fn [^String s]
                 (Integer/parseInt s))})
;; we're missing NumberDecimal but not sure how that's supposed to be converted to a Java type

(defn- form->encoded-fn-name
  "If FORM is an encoded fn call form return the key representing the fn call that was encoded.
   If it doesn't represent an encoded fn, return `nil`.

     (form->encoded-fn-name [:___ObjectId \"583327789137b2700a1621fb\"]) -> :ObjectId"
  [form]
  (when (vector? form)
    (when ((some-fn keyword? string?) (first form))
      (when-let [[_ k] (re-matches #"^___(\w+$)" (name (first form)))]
        (let [k (keyword k)]
          (when (contains? fn-name->decoder k)
            k))))))

(defn- maybe-decode-fncall [form]
  (if-let [fn-name (form->encoded-fn-name form)]
    ((fn-name->decoder fn-name) (second form))
    form))

(defn- decode-fncalls [query]
  (walk/postwalk maybe-decode-fncall query))

(defn- encode-fncalls-for-fn
  "Walk QUERY-STRING and replace fncalls to fn with FN-NAME with encoded forms that can be parsed as valid JSON.

     (encode-fncalls-for-fn \"ObjectId\" \"{\\\"$match\\\":ObjectId(\\\"583327789137b2700a1621fb\\\")}\")
     ;; -> \"{\\\"$match\\\":[\\\"___ObjectId\\\", \\\"583327789137b2700a1621fb\\\"]}\""
  [fn-name query-string]
  (-> query-string
      ;; replace any forms WITH NO args like ISODate() with ones like ["___ISODate"]
      (s/replace (re-pattern (format "%s\\(\\)" (name fn-name))) (format "[\"___%s\"]" (name fn-name)))
      ;; now replace any forms WITH args like ISODate("2016-01-01") with ones like ["___ISODate", "2016-01-01"]
      (s/replace (re-pattern (format "%s\\(([^)]*)\\)" (name fn-name))) (format "[\"___%s\", $1]" (name fn-name)))))

(defn- encode-fncalls
  "Replace occurances of `ISODate(...)` and similary function calls (invalid JSON, but legal in Mongo)
   with legal JSON forms like `[:___ISODate ...]` that we can decode later.

   Walks QUERY-STRING and encodes all the various fncalls we support."
  [query-string]
  (loop [query-string query-string, [fn-name & more] (keys fn-name->decoder)]
    (if-not fn-name
      query-string
      (recur (encode-fncalls-for-fn fn-name query-string)
             more))))


;;; ------------------------------------------------ Query Execution -------------------------------------------------

(defn mbql->native
  "Process and run an MBQL query."
  [{database :database, {{source-table-name :name} :source-table} :query, :as query}]
  {:pre [(map? database)
         (string? source-table-name)]}
  (binding [*query* query]
    (let [{proj :projections, generated-pipeline :query} (generate-aggregation-pipeline (:query query))]
      (log-monger-form generated-pipeline)
      {:projections proj
       :query       generated-pipeline
       :collection  source-table-name
       :mbql?       true})))

(defn execute-query
  "Process and run a native MongoDB query."
  [{{:keys [collection query mbql? projections]} :native, database :database}]
  {:pre [query
         (string? collection)
         (map? database)]}
  (let [query   (if (string? query)
                  (decode-fncalls (json/parse-string (encode-fncalls query) keyword))
                  query)
        results (mc/aggregate *mongo-connection* collection query
                              :allow-disk-use true
                              ;; options that control the creation of the cursor object. Empty map means use default
                              ;; options. Needed for Mongo 3.6+
                              :cursor {})
        results (if (sequential? results)
                  results
                  [results])
        ;; if we formed the query using MBQL then we apply a couple post processing functions
        results (if-not mbql?
                  results
                  (-> results
                      unescape-names
                      unstringify-dates))
        rename-map (create-unescaping-rename-map projections)
        columns (if-not mbql?
                  (vec (keys (first results)))
                  (map (fn [proj]
                         (if (contains? rename-map proj)
                           (get rename-map proj)
                           proj))
                       projections))]

    {:columns   columns
     :rows      (for [row results]
                  (mapv row columns))
     :annotate? mbql?}))
