(ns metabase.driver.query-processor.expand
  "Converts a Query Dict as recieved by the API into an *expanded* one that contains extra information that will be needed to
   construct the appropriate native Query, and perform various post-processing steps such as Field ordering."
  (:refer-clojure :exclude [< <= > >= = != and or filter count distinct sum])
  (:require (clojure [core :as core]
                     [string :as str])
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.driver.query-processor.interface :refer [*driver*], :as i]
            [metabase.models.table :refer [Table]]
            [metabase.util :as u]
            [schema.core :as s])
  (:import (metabase.driver.query_processor.interface BetweenFilter
                                                      ComparisonFilter
                                                      CompoundFilter
                                                      EqualityFilter
                                                      FieldPlaceholder
                                                      OrderByAggregateField
                                                      RelativeDatetime
                                                      StringFilter
                                                      ValuePlaceholder)))

;; *driver* is always bound when running queries the normal way, e.g. via `metabase.driver/process-query`
;; It is not neccesarily bound when using various functions like `fk->` in the REPL.
;; The check is not performed in those cases to allow flexibility when composing queries for tests or interactive development
(defn- assert-driver-supports
  "When `*driver*` is bound, assert that is supports keyword FEATURE."
  [feature]
  (when *driver*
    (when-not (contains? (driver/features *driver*) feature)
      (throw (Exception. (str (name feature) " is not supported by this driver."))))))

;;; # ------------------------------------------------------------ Token dispatch ------------------------------------------------------------

(s/defn ^:private ^:always-validate normalize-token :- s/Keyword
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased keyword."
  [token :- (s/cond-pre s/Keyword s/Str)]
  (-> (name token)
      str/lower-case
      (str/replace #"_" "-")
      keyword))

(def ^:private ^:const dispatchable-tokens
  "Keywords that have a corresponding function in this namespace that we can 'dispatch' to."
  #{;; top-level
    :aggregation :breakout :filter :fields :order-by :source-table :limit :page
    ;; aggregation subclauses
    :count :avg :distinct :stddev :sum :cum-sum
    ;; filter subclauses
    :and :or :inside :between := :!= :< :> :<= :>= :starts-with :contains :ends-with :time-interval
    ;; fields
    :fk-> :datetime-field
    ;; values
    :relative-datetime})

(defn- apply-fn-for-token
  "Apply the appropriate function for dispatchable token.

    (apply-fn-for-token [\"fk->\" 100 200]) -> (fk-> 100 200)"
  ([token+args]
   (apply-fn-for-token (first token+args) (rest token+args)))
  ([token args]
   (let [token (normalize-token token)
         ;; _     (println "fn:" (cons (name token) args))
         f     (core/or (when (contains? dispatchable-tokens token)
                          (ns-resolve 'metabase.driver.query-processor.expand (symbol (name token))))
                        (throw (Exception. (str "Illegal clause (no matching fn found): " token))))]
     (apply f args))))


;;; # ------------------------------------------------------------ Clause Handlers ------------------------------------------------------------

;; TODO - check that there's a matching :aggregation clause in the query ?
(s/defn ^:always-validate aggregate-field :- OrderByAggregateField
  "Aggregate field referece, e.g. for use in an `order-by` clause.

     (query (aggregate (count))
            (order-by [(aggregate-field 0) :ascending])) ; order by :count"
  [index :- s/Int]
  (i/map->OrderByAggregateField {:index index}))

(s/defn ^:always-validate field :- i/FieldPlaceholderOrAgRef
  "Generic reference to a `Field`. F can be an integer Field ID, or various other forms like `fk->` or `aggregation`."
  [f]
  (cond
    (map?     f) (i/map->FieldPlaceholder f)
    (integer? f) (i/map->FieldPlaceholder {:field-id f})
    (vector?  f) (let [[token & args] f]
                   (if (core/= (normalize-token token) :aggregation)
                     (apply aggregate-field args)
                     (apply-fn-for-token token args)))
    :else        (throw (Exception. (str "Invalid field: " f)))))

(s/defn ^:always-validate datetime-field :- FieldPlaceholder
  "Reference to a `DateTimeField`. This is just a `Field` reference with an associated datetime UNIT."
  ([f _ unit] (datetime-field f unit))
  ([f unit]   (assoc (field f) :datetime-unit (normalize-token unit))))

(s/defn ^:always-validate fk-> :- FieldPlaceholder
  "Reference to a `Field` that belongs to another `Table`. DEST-FIELD-ID is the ID of this Field, and FK-FIELD-ID is the ID of the foreign key field
   belonging to the *source table* we should use to perform the join.

   `fk->` is so named because you can think of it as \"going through\" the FK Field to get to the dest Field:

     (fk-> 100 200) ; refer to Field 200, which is part of another Table; join to the other table via our foreign key 100"
  [fk-field-id :- s/Int, dest-field-id :- s/Int]
  (assert-driver-supports :foreign-keys)
  (i/map->FieldPlaceholder {:fk-field-id fk-field-id, :field-id dest-field-id}))


(s/defn ^:always-validate value :- ValuePlaceholder
  "Literal value. F is the `Field` it relates to, and V is `nil`, or a boolean, string, numerical, or datetime value."
  [f v]
  (cond
    (instance? ValuePlaceholder v) v
    (vector? v)                    (apply-fn-for-token (first v) (cons f (rest v)))
    :else                          (i/map->ValuePlaceholder {:field-placeholder (field f), :value v})))

(s/defn ^:always-validate relative-datetime :- RelativeDatetime
  "Value that represents a point in time relative to each moment the query is ran, e.g. \"today\" or \"1 year ago\".

   With `:current` as the only arg, refer to the current point in time; otherwise N is some number and UNIT is a unit like `:day` or `:year`.

     (relative-datetime :current)
     (relative-datetime -31 :day)"
  ([n]                (s/validate (s/eq :current) (normalize-token n))
                      (relative-datetime 0 nil))
  ([n :- s/Int, unit] (i/map->RelativeDatetime {:amount n, :unit (when-not (zero? n)
                                                                   (normalize-token unit))})))


;;; ## aggregation

(s/defn ^:private ^:always-validate ag-with-field :- i/Aggregation [ag-type f]
  {:aggregation-type ag-type, :field (field f)})

(def ^{:arglists '([f])} avg      "Aggregation clause. Return the average value of F."                (partial ag-with-field :avg))
(def ^{:arglists '([f])} distinct "Aggregation clause. Return the number of distinct values of F."    (partial ag-with-field :distinct))
(def ^{:arglists '([f])} sum      "Aggregation clause. Return the sum of the values of F."            (partial ag-with-field :sum))
(def ^{:arglists '([f])} cum-sum  "Aggregation clause. Return the cumulative sum of the values of F." (partial ag-with-field :cumulative-sum))

(defn stddev
  "Aggregation clause. Return the standard deviation of values of F."
  [f]
  (assert-driver-supports :standard-deviation-aggregations)
  (ag-with-field :stddev f))

(s/defn ^:always-validate count :- i/CountAggregation
  "Aggregation clause. Return total row count (e.g., `COUNT(*)`). If F is specified, only count rows where F is non-null (e.g. `COUNT(f)`)."
  ([]  {:aggregation-type :count})
  ([f] (ag-with-field :count f)))

(s/defn ^:always-validate aggregation
  "Specify the aggregation to be performed for this query.

     (aggregation {} (count 100))
     (aggregation {} :count 100))"
  [query ag & args]
  (if (map? ag)
    (do (s/validate i/Aggregation ag)
        (assoc query :aggregation ag))
    (let [ag-type (normalize-token ag)]
      (if (core/= ag-type :rows)
        query
        (aggregation query (apply-fn-for-token ag-type args))))))


;;; ## breakout & fields

(defn- fields-list-clause [k query & fields] (assoc query k (mapv field fields)))

(def ^{:arglists '([query & fields])} breakout "Specify which fields to breakout by." (partial fields-list-clause :breakout))
(def ^{:arglists '([query & fields])} fields   "Specify which fields to return."      (partial fields-list-clause :fields))

;;; ## filter

(declare expand-filter-subclause-if-needed)

(s/defn ^:always-validate ^:private compound-filter :- i/Filter
  ([_ subclause] (expand-filter-subclause-if-needed subclause))
  ([compound-type subclause & more]
   (i/map->CompoundFilter {:compound-type compound-type, :subclauses (mapv expand-filter-subclause-if-needed (cons subclause more))})))

(def ^{:arglists '([& subclauses])} and "Filter subclause. Return results that satisfy *all* SUBCLAUSES." (partial compound-filter :and))
(def ^{:arglists '([& subclauses])} or  "Filter subclause. Return results that satisfy *any* of the SUBCLAUSES." (partial compound-filter :or))

(s/defn ^:private ^:always-validate equality-filter :- i/Filter
  ([filter-type _ f v]
   (i/map->EqualityFilter {:filter-type filter-type, :field (field f), :value (value f v)}))
  ([filter-type compound-fn f v & more]
   (apply compound-fn (for [v (cons v more)]
                        (equality-filter filter-type compound-fn f v)))))

(def ^{:arglists '([f v & more])} =
  "Filter subclause. With a single value, return results where F == V. With two or more values, return results where F matches *any* of the values (i.e.`IN`)

     (= f v)
     (= f v1 v2) ; same as (or (= f v1) (= f v2))"
  (partial equality-filter := or))

(def ^{:arglists '([f v & more])} !=
  "Filter subclause. With a single value, return results where F != V. With two or more values, return results where F does not match *any* of the values (i.e. `NOT IN`)

     (!= f v)
     (!= f v1 v2) ; same as (and (!= f v1) (!= f v2))"
  (partial equality-filter :!= and))

(s/defn ^:private ^:always-validate comparison-filter :- ComparisonFilter [filter-type f v]
  (i/map->ComparisonFilter {:filter-type filter-type, :field (field f), :value (value f v)}))

(def ^{:arglists '([f v])} <  "Filter subclause. Return results where F is less than V. V must be orderable, i.e. a number or datetime."                (partial comparison-filter :<))
(def ^{:arglists '([f v])} <= "Filter subclause. Return results where F is less than or equal to V. V must be orderable, i.e. a number or datetime."    (partial comparison-filter :<=))
(def ^{:arglists '([f v])} >  "Filter subclause. Return results where F is greater than V. V must be orderable, i.e. a number or datetime."             (partial comparison-filter :>))
(def ^{:arglists '([f v])} >= "Filter subclause. Return results where F is greater than or equal to V. V must be orderable, i.e. a number or datetime." (partial comparison-filter :>=))

(s/defn ^:always-validate between :- BetweenFilter
  "Filter subclause. Return results where F is between MIN and MAX. MIN and MAX must be orderable, i.e. numbers or datetimes.
   This behaves like SQL `BETWEEN`, i.e. MIN and MAX are inclusive."
  [f min max]
  (i/map->BetweenFilter {:filter-type :between, :field (field f), :min-val (value f min), :max-val (value f max)}))

(s/defn ^:always-validate inside :- CompoundFilter
  "Filter subclause for geo bounding. Return results where LAT-FIELD and LON-FIELD are between some set of bounding values."
  [lat-field lon-field lat-max lon-min lat-min lon-max]
  (and (between lat-field lat-min lat-max)
       (between lon-field lon-min lon-max)))

(s/defn ^:private ^:always-validate string-filter :- StringFilter [filter-type f s]
  (i/map->StringFilter {:filter-type filter-type, :field (field f), :value (value f s)}))

(def ^{:arglists '([f s])} starts-with "Filter subclause. Return results where F starts with the string V."    (partial string-filter :starts-with))
(def ^{:arglists '([f s])} contains    "Filter subclause. Return results where F contains the string V."       (partial string-filter :contains))
(def ^{:arglists '([f s])} ends-with   "Filter subclause. Return results where F ends with with the string V." (partial string-filter :ends-with))

(s/defn ^:always-validate time-interval :- i/Filter
  "Filter subclause. Syntactic sugar for specifying a specific time interval.

    (filter {} (time-interval 100 :current :day)) ; return rows where datetime Field 100's value is in the current day"
  [f n unit]
  (if-not (integer? n)
    (let [n (normalize-token n)]
      (case n
        :current (recur f  0 unit)
        :last    (recur f -1 unit)
        :next    (recur f  1 unit)))
    (let [f (datetime-field f unit)]
      (cond
        (core/= n  0) (= f (value f (relative-datetime :current)))
        (core/= n -1) (= f (value f (relative-datetime -1 unit)))
        (core/= n  1) (= f (value f (relative-datetime  1 unit)))
        (core/< n -1) (between f (value f (relative-datetime (dec n) unit))
                                 (value f (relative-datetime      -1 unit)))
        (core/> n  1) (between f (value f (relative-datetime       1 unit))
                                 (value f (relative-datetime (inc n) unit)))))))

(s/defn ^:private ^:always-validate expand-filter-subclause-if-needed :- i/Filter [subclause]
  (cond
    (vector? subclause) (apply-fn-for-token subclause)
    (map? subclause)    subclause))

(s/defn ^:always-validate filter
  "Filter the results returned by the query.

     (filter {} := 100 true) ; return rows where Field 100 == true"
  ([query, filter-map :- i/Filter]
   (assoc query :filter filter-map))
  ([query filter-type & args]
   (filter query (apply-fn-for-token filter-type args))))

(s/defn ^:always-validate limit
  "Limit the number of results returned by the query.

     (limit {} 10)"
  [query limit :- s/Int]
  (assoc query :limit limit))


;;; ## order-by

(s/defn ^:private ^:always-validate maybe-parse-order-by-subclause :- i/OrderBy [subclause]
  (cond
    (map? subclause)    subclause
    (vector? subclause) (let [[f direction] subclause]
                          {:field (field f), :direction (normalize-token direction)})))

(defn order-by
  "Specify how ordering should be done for this query.

     (order-by {} [20 :ascending]) ; order by field 20
     (order-by {} [(aggregate-field 0) :descending]) ; order by the aggregate field (e.g. :count)"
  [query & subclauses]
  (assoc query :order-by (mapv maybe-parse-order-by-subclause subclauses)))


;;; ## page

(s/defn ^:always-validate page
  "Specify which 'page' of results to fetch (offset and limit the results).

     (page {} {:page 1, :items 20}) ; fetch first 20 rows"
  [query {:keys [page items], :as page-clause} :- i/Page]
  (assoc query :page page-clause))

;;; ## source-table

(s/defn ^:always-validate source-table
  "Specify the ID of the table to query (required).

     (source-table {} 100)"
  [query, table-id :- s/Int]
  (assoc query :source-table table-id))


;;; # ------------------------------------------------------------ Expansion ------------------------------------------------------------

(s/defn ^:private ^:always-validate expand-inner :- i/Query [inner-query]
  (loop [query {}, [[clause-name arg] & more] (seq inner-query)]
    (let [args  (cond
                  (sequential? arg) arg
                  arg               [arg])
          query (core/or (when (seq args)
                           (apply-fn-for-token clause-name (cons query args)))
                         query)]
      (if (seq more)
        (recur query more)
        query))))

(defn expand
  "Expand a query dictionary as it comes in from the API and return an \"expanded\" form, (almost) ready for use by the Query Processor.
   This includes steps like token normalization and function dispatch.

     (expand {:query {\"SOURCE_TABLE\" 10, \"FILTER\" [\"=\" 100 200]}})

       -> {:query {:source-table 10
                   :filter       {:filter-type :=
                                  :field       {:field-id 100}
                                  :value       {:field-placeholder {:field-id 100}
                                                :value 200}}}}

   The \"placeholder\" objects above are fetched from the DB and replaced in the next QP step, in `metabase.driver.query-processor.resolve`."
  [outer-query]
  (update outer-query :query expand-inner))

(defmacro query
  "Build a query by threading an (initially empty) map through each form in BODY with `->`.
   The final result is validated against the `Query` schema."
  {:style/indent 0}
  [& body]
  `(s/validate i/Query (-> {} ~@body)))

(s/defn ^:always-validate run-query* [query :- i/Query]
  #_(println "query:\n" (u/pprint-to-str 'cyan query))
  (let [db-id (db/sel :one :field [Table :db_id], :id (:source-table query))]
    (driver/process-query {:database db-id
                           :type     :query
                           :query    query})))

(defmacro run-query [& body]
  `(run-query* (query ~@body)))
