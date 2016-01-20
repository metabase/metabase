(ns metabase.driver.query-processor.expand
  "Converts a Query Dict as recieved by the API into an *expanded* one that contains extra information that will be needed to
   construct the appropriate native Query, and perform various post-processing steps such as Field ordering."
  (:refer-clojure :exclude [< <= > >= = != and or filter count distinct sum])
  (:require (clojure [core :as core]
                     [string :as str])
            [clojure.tools.logging :as log]
            [schema.core :as s]
            [metabase.db :as db]
            [metabase.driver :as driver]
            [metabase.driver.query-processor.interface :refer [*driver*], :as i]
            [metabase.models.table :refer [Table]]
            [metabase.util :as u])

  (:import (metabase.driver.query_processor.interface AgFieldRef
                                                      BetweenFilter
                                                      ComparisonFilter
                                                      CompoundFilter
                                                      EqualityFilter
                                                      FieldPlaceholder
                                                      RelativeDatetime
                                                      StringFilter
                                                      ValuePlaceholder)))


;;; # ------------------------------------------------------------ Token dispatch ------------------------------------------------------------

(s/defn ^:private ^:always-validate normalize-token :- s/Keyword
  "Convert a string or keyword in various cases (`lisp-case`, `snake_case`, or `SCREAMING_SNAKE_CASE`) to a lisp-cased keyword."
  [token :- (s/named (s/cond-pre s/Keyword s/Str) "Valid token (keyword or string)")]
  (-> (name token)
      str/lower-case
      (str/replace #"_" "-")
      keyword))

;;; # ------------------------------------------------------------ Clause Handlers ------------------------------------------------------------

;; TODO - check that there's a matching :aggregation clause in the query ?
(s/defn ^:ql ^:always-validate aggregate-field :- AgFieldRef
  "Aggregate field referece, e.g. for use in an `order-by` clause.

     (query (aggregate (count))
            (order-by (asc (aggregate-field 0)))) ; order by :count"
  [index :- s/Int]
  (i/map->AgFieldRef {:index index}))

(s/defn ^:ql ^:always-validate field-id :- FieldPlaceholder
  "Create a generic reference to a `Field` with ID."
  [id :- i/IntGreaterThanZero]
  (i/map->FieldPlaceholder {:field-id id}))

(s/defn ^:private ^:always-validate field :- i/FieldPlaceholderOrAgRef
  "Generic reference to a `Field`. F can be an integer Field ID, or various other forms like `fk->` or `aggregation`."
  [f]
  (if (integer? f)
    (do (log/warn (u/format-color 'yellow "Referring to fields by their bare ID (%d) is deprecated in MBQL '98. Please use [:field-id %d] instead." f f))
        (field-id f))
    f))

(s/defn ^:ql ^:always-validate datetime-field :- FieldPlaceholder
  "Reference to a `DateTimeField`. This is just a `Field` reference with an associated datetime UNIT."
  ([f _ unit] (log/warn (u/format-color 'yellow (str "The syntax for datetime-field has changed in MBQL '98. [:datetime-field <field> :as <unit>] is deprecated. "
                                                     "Prefer [:datetime-field <field> <unit>] instead.")))
              (datetime-field f unit))
  ([f unit]   (assoc (field f) :datetime-unit (normalize-token unit))))

(s/defn ^:ql ^:always-validate fk-> :- FieldPlaceholder
  "Reference to a `Field` that belongs to another `Table`. DEST-FIELD-ID is the ID of this Field, and FK-FIELD-ID is the ID of the foreign key field
   belonging to the *source table* we should use to perform the join.

   `fk->` is so named because you can think of it as \"going through\" the FK Field to get to the dest Field:

     (fk-> 100 200) ; refer to Field 200, which is part of another Table; join to the other table via our foreign key 100"
  [fk-field-id :- s/Int, dest-field-id :- s/Int]
  (i/assert-driver-supports :foreign-keys)
  (i/map->FieldPlaceholder {:fk-field-id fk-field-id, :field-id dest-field-id}))


(s/defn ^:private ^:always-validate value :- ValuePlaceholder
  "Literal value. F is the `Field` it relates to, and V is `nil`, or a boolean, string, numerical, or datetime value."
  [f v]
  (cond
    (instance? ValuePlaceholder v) v
    :else                          (i/map->ValuePlaceholder {:field-placeholder (field f), :value v})))

(s/defn ^:private ^:always-validate field-or-value
  "Use instead of `value` when something may be either a field or a value."
  [f v]
  (if (instance? FieldPlaceholder v)
    v
    (value f v)))

(s/defn ^:ql ^:always-validate relative-datetime :- RelativeDatetime
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

(def ^:ql ^{:arglists '([f])} avg      "Aggregation clause. Return the average value of F."                (partial ag-with-field :avg))
(def ^:ql ^{:arglists '([f])} distinct "Aggregation clause. Return the number of distinct values of F."    (partial ag-with-field :distinct))
(def ^:ql ^{:arglists '([f])} sum      "Aggregation clause. Return the sum of the values of F."            (partial ag-with-field :sum))
(def ^:ql ^{:arglists '([f])} cum-sum  "Aggregation clause. Return the cumulative sum of the values of F." (partial ag-with-field :cumulative-sum))

(defn ^:ql stddev
  "Aggregation clause. Return the standard deviation of values of F."
  [f]
  (i/assert-driver-supports :standard-deviation-aggregations)
  (ag-with-field :stddev f))

(s/defn ^:ql ^:always-validate count :- i/Aggregation
  "Aggregation clause. Return total row count (e.g., `COUNT(*)`). If F is specified, only count rows where F is non-null (e.g. `COUNT(f)`)."
  ([]  {:aggregation-type :count})
  ([f] (ag-with-field :count f)))

(defn ^:ql ^:deprecated rows
  "Bare rows aggregation. This is the default behavior, so specifying it is deprecated."
  []
  (log/warn (u/format-color 'yellow "Specifying :rows as the aggregation type is deprecated in MBQL '98. This is the default behavior, so you don't need to specify it.")))

(s/defn ^:ql ^:always-validate aggregation
  "Specify the aggregation to be performed for this query.

     (aggregation {} (count 100))
     (aggregation {} :count 100))"
  ;; Handle ag field references like [:aggregation 0] (deprecated)
  ([index :- s/Int]
   (log/warn "The syntax for aggregate fields has changed in MBQL '98. Instead of `[:aggregation 0]`, please use `[:aggregate-field 0]` instead.")
   (aggregate-field index))

  ;; Handle :aggregation top-level clauses
  ([query ag :- (s/maybe (s/pred map?))]
   (if ag
     (let [ag (update ag :aggregation-type normalize-token)]
       (s/validate i/Aggregation ag)
       (assoc query :aggregation ag))
     ag)))


;;; ## breakout & fields

(defn- fields-list-clause
  ([k query] query)
  ([k query & fields] (assoc query k (mapv field fields))))

(def ^:ql ^{:arglists '([query & fields])} breakout "Specify which fields to breakout by." (partial fields-list-clause :breakout))
(def ^:ql ^{:arglists '([query & fields])} fields   "Specify which fields to return."      (partial fields-list-clause :fields))

;;; ## filter

(s/defn ^:private ^:always-validate compound-filter :- i/Filter
  ([compound-type subclause :- i/Filter]
   (log/warn (u/format-color 'yellow "You shouldn't specify an %s filter with only one subclause." compound-type))
   subclause)

  ([compound-type, subclause :- i/Filter, & more :- [i/Filter]]
   (i/map->CompoundFilter {:compound-type compound-type, :subclauses (cons subclause more)})))

(def ^:ql ^{:arglists '([& subclauses])} and "Filter subclause. Return results that satisfy *all* SUBCLAUSES." (partial compound-filter :and))
(def ^:ql ^{:arglists '([& subclauses])} or  "Filter subclause. Return results that satisfy *any* of the SUBCLAUSES." (partial compound-filter :or))

(s/defn ^:private ^:always-validate equality-filter :- i/Filter
  ([filter-type _ f v]
   (i/map->EqualityFilter {:filter-type filter-type, :field (field f), :value (field-or-value f v)}))
  ([filter-type compound-fn f v & more]
   (apply compound-fn (for [v (cons v more)]
                        (equality-filter filter-type compound-fn f v)))))

(def ^:ql ^{:arglists '([f v & more])} =
  "Filter subclause. With a single value, return results where F == V. With two or more values, return results where F matches *any* of the values (i.e.`IN`)

     (= f v)
     (= f v1 v2) ; same as (or (= f v1) (= f v2))"
  (partial equality-filter := or))

(def ^:ql ^{:arglists '([f v & more])} !=
  "Filter subclause. With a single value, return results where F != V. With two or more values, return results where F does not match *any* of the values (i.e. `NOT IN`)

     (!= f v)
     (!= f v1 v2) ; same as (and (!= f v1) (!= f v2))"
  (partial equality-filter :!= and))

(s/defn ^:private ^:always-validate comparison-filter :- ComparisonFilter [filter-type f v]
  (i/map->ComparisonFilter {:filter-type filter-type, :field (field f), :value (value f v)}))

(def ^:ql ^{:arglists '([f v])} <  "Filter subclause. Return results where F is less than V. V must be orderable, i.e. a number or datetime."                (partial comparison-filter :<))
(def ^:ql ^{:arglists '([f v])} <= "Filter subclause. Return results where F is less than or equal to V. V must be orderable, i.e. a number or datetime."    (partial comparison-filter :<=))
(def ^:ql ^{:arglists '([f v])} >  "Filter subclause. Return results where F is greater than V. V must be orderable, i.e. a number or datetime."             (partial comparison-filter :>))
(def ^:ql ^{:arglists '([f v])} >= "Filter subclause. Return results where F is greater than or equal to V. V must be orderable, i.e. a number or datetime." (partial comparison-filter :>=))

(s/defn ^:ql ^:always-validate between :- BetweenFilter
  "Filter subclause. Return results where F is between MIN and MAX. MIN and MAX must be orderable, i.e. numbers or datetimes.
   This behaves like SQL `BETWEEN`, i.e. MIN and MAX are inclusive."
  [f min-val max-val]
  (i/map->BetweenFilter {:filter-type :between, :field (field f), :min-val (value f min-val), :max-val (value f max-val)}))

(s/defn ^:ql ^:always-validate inside :- CompoundFilter
  "Filter subclause for geo bounding. Return results where LAT-FIELD and LON-FIELD are between some set of bounding values."
  [lat-field lon-field lat-max lon-min lat-min lon-max]
  (and (between lat-field lat-min lat-max)
       (between lon-field lon-min lon-max)))

(s/defn ^:private ^:always-validate string-filter :- StringFilter [filter-type f s]
  (i/map->StringFilter {:filter-type filter-type, :field (field f), :value (value f s)}))

(def ^:ql ^{:arglists '([f s])} starts-with "Filter subclause. Return results where F starts with the string V."    (partial string-filter :starts-with))
(def ^:ql ^{:arglists '([f s])} contains    "Filter subclause. Return results where F contains the string V."       (partial string-filter :contains))
(def ^:ql ^{:arglists '([f s])} ends-with   "Filter subclause. Return results where F ends with with the string V." (partial string-filter :ends-with))

(s/defn ^:ql ^:always-validate time-interval :- i/Filter
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

(s/defn ^:ql ^:always-validate filter
  "Filter the results returned by the query.

     (filter {} := 100 true) ; return rows where Field 100 == true"
  [query, filter-map :- (s/maybe i/Filter)]
  (if filter-map
    (assoc query :filter filter-map)
    query))

(s/defn ^:ql ^:always-validate limit
  "Limit the number of results returned by the query.

     (limit {} 10)"
  [query, limit :- (s/maybe s/Int)]
  (if limit
    (assoc query :limit limit)
    query))


;;; ## order-by

(s/defn ^:private ^:always-validate maybe-parse-order-by-subclause :- i/OrderBy [subclause]
  (cond
    (map? subclause)    subclause
    (vector? subclause) (let [[f direction] subclause]
                          (log/warn (u/format-color 'yellow (str "The syntax for order-by has changed in MBQL '98. [<field> :ascending/:descending] is deprecated. "
                                                                 "Prefer [:asc/:desc <field>] instead.")))
                          {:field (field f), :direction (normalize-token direction)})))

(s/defn ^:ql ^:always-validate asc :- i/OrderBy
  "order-by subclause. Specify that results should be returned in ascending order for Field or AgRef F.

     (order-by {} (asc 100))"
  [f]
  {:field (field f), :direction :ascending})

(s/defn ^:ql ^:always-validate desc :- i/OrderBy
  "order-by subclause. Specify that results should be returned in ascending order for Field or AgRef F.

     (order-by {} (desc 100))"
  [f]
  {:field (field f), :direction :descending})

(defn ^:ql order-by
  "Specify how ordering should be done for this query.

     (order-by {} (asc 20))        ; order by field 20
     (order-by {} [20 :ascending]) ; order by field 20 (deprecated/legacy syntax)
     (order-by {} [(aggregate-field 0) :descending]) ; order by the aggregate field (e.g. :count)"
  ([query] query)
  ([query & subclauses]
   (assoc query :order-by (mapv maybe-parse-order-by-subclause subclauses))))


;;; ## page

(s/defn ^:ql ^:always-validate page
  "Specify which 'page' of results to fetch (offset and limit the results).

     (page {} {:page 1, :items 20}) ; fetch first 20 rows"
  [query {:keys [page items], :as page-clause} :- (s/maybe i/Page)]
  (if page-clause
    (assoc query :page page-clause)
    query))

;;; ## source-table

(s/defn ^:ql ^:always-validate source-table
  "Specify the ID of the table to query (required).

     (source-table {} 100)"
  [query, table-id :- s/Int]
  (assoc query :source-table table-id))


;;; # ------------------------------------------------------------ Expansion ------------------------------------------------------------

;; QL functions are any public function in this namespace marked with `^:ql`.
(def ^:private token->ql-fn
  "A map of keywords (e.g., `:=`), to the matching vars (e.g., `#'=`)."
  (into {} (for [[symb varr] (ns-publics *ns*)
                 :let        [metta (meta varr)]
                 :when       (:ql metta)]
             {(keyword symb) varr})))

(defn- fn-for-token
  "Return fn var that matches a token, or throw an exception.

     (fn-for-token :starts-with) -> #'starts-with"
  [token]
  (let [token (normalize-token token)]
    (core/or (token->ql-fn token)
             (throw (Exception. (str "Illegal clause (no matching fn found): " token))))))

(s/defn ^:always-validate expand-ql-sexpr
  "Expand a QL bracketed S-expression by dispatching to the appropriate `^:ql` function. If SEXPR is not a QL
   S-expression (the first item isn't a token), it is returned as-is.

     (expand-ql-sexpr [:field-id 10]) -> (field-id 10) -> {:field-id 10, :fk-field-id nil, :datetime-unit nil}"
  [[token & args :as sexpr] :- (s/pred vector?)]
  (if (core/or (keyword? token)
               (string?  token))
    (apply (fn-for-token token) args)
    sexpr))

(defn- walk-expand-ql-sexprs
  "Walk QUERY depth-first and expand QL bracketed S-expressions."
  [x]
  (cond (map? x)    (into x (for [[k v] x]                    ; do `into x` instead of `into {}` so we can keep the original class,
                              [k (walk-expand-ql-sexprs v)])) ; e.g. FieldPlaceholder
        (vector? x) (expand-ql-sexpr (mapv walk-expand-ql-sexprs x))
        :else       x))


(s/defn ^:always-validate expand-inner :- i/Query
  "Expand an inner query map."
  [inner-query :- (s/pred map?)]
  (loop [query {}, [[clause-name arg] & more] (seq inner-query)]
    (let [arg   (walk-expand-ql-sexprs arg)
          args  (cond
                  (sequential? arg) arg
                  arg               [arg])
          query (if (seq args)
                  (apply (fn-for-token clause-name) query args)
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
  `(-> {}
       ~@body
       expand-inner))

(s/defn ^:always-validate wrap-inner-query
  "Wrap inner QUERY with `:database` ID and other 'outer query' kvs. DB ID is fetched by looking up the Database for the query's `:source-table`."
  {:style/indent 0}
  [query :- i/Query]
  {:database (db/sel :one :field [Table :db_id], :id (:source-table query))
   :type     :query
   :query    query})

(s/defn ^:always-validate run-query*
  "Call `driver/process-query` on expanded inner QUERY, looking up the `Database` ID for the `source-table.`

     (run-query* (query (source-table 5) ...))"
  [query :- i/Query]
  (driver/process-query (wrap-inner-query query)))

(defmacro run-query
  "Build and run a query.

     (run-query (source-table 5) ...)"
  {:style/indent 0}
  [& body]
  `(run-query* (query ~@body)))
