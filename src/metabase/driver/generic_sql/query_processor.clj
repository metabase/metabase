(ns metabase.driver.generic-sql.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into korma SQL forms."
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.config :as config]
            [metabase.db :refer :all]
            [metabase.driver.generic-sql.native :as native]
            [metabase.driver.generic-sql.query-processor.annotate :as annotate]
            [metabase.driver.generic-sql.util :refer :all]
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])))


(declare apply-form
         log-query
         post-process
         query-is-cumulative-sum?
         apply-cumulative-sum)

(def ^{:dynamic true, :private true} *query*
  "Query dictionary that we're currently processing"
  nil)

;; # INTERFACE

(defn process
  "Convert QUERY into a korma `select` form."
  [{{:keys [source_table] :as query} :query}]
  (when-not (zero? source_table)
    (binding [*query* query]
      (let [forms (->> (map apply-form query)                    ; call `apply-form` for each clause and strip out nil results
                       (filter identity)
                       (mapcat (fn [form] (if (vector? form) form ; some `apply-form` implementations return a vector of multiple korma forms; if only one was
                                             [form])))           ; returned wrap it in a vec so `mapcat` can build a flattened sequence of forms
                       doall)]
        (when (config/config-bool :mb-db-logging)
          (log-query query forms))
        `(let [entity# (table-id->korma-entity ~source_table)]
           (select entity# ~@forms))))))


(defn process-structured
  "Convert QUERY into a korma `select` form, execute it, and annotate the results."
  [query]
  {:pre [(integer? (:database query)) ; double check that the query being passed is valid
         (map? (:query query))
         (= (name (:type query)) "query")]}
  (try
    (->> (process query)
         eval
         (post-process query)
         (annotate/annotate query))
    (catch java.sql.SQLException e
      {:status :failed
       :error (->> (.getMessage e)                       ; error message comes back like "Error message ... [status-code]
                   (re-find  #"(?s)(^.*)\s+\[[\d-]+\]$") ; status code isn't useful and makes unit tests hard to write so strip it off
                   second)})))                           ; (?s) = Pattern.DOTALL - tell regex `.` to match newline characters as well


(defn process-and-run
  "Process and run a query and return results."
  [{:keys [type] :as query}]
  ;; we know how to handle :native and :query (structured) type queries
  (case (keyword type)
      :native (native/process-and-run query)
      :query  (process-structured query)))


;; # IMPLEMENTATION

;; ## Query Clause Processors

(defmulti apply-form
  "Given a Query clause like

    {:aggregation [\"count\"]}

  call the matching implementation which should either return `nil` or translate it into a korma clause like

    (aggregate (count :*) :count)

  An implementation of `apply-form` may optionally return a vector of several forms to insert into the generated korma `select` form."
  (fn [[clause-name _]] clause-name))

;; ### `:aggregation`
;; ex.
;;
;;     ["distinct" 1412]
(defmethod apply-form :aggregation [[_ value]]
  (match value
    ["rows"]           nil ; don't need to do anything special for `rows` - `select` selects all rows by default
    ["count"]          `(aggregate (~'count :*) :count)
    [ag-type field-id] (let [field (field-id->kw field-id)]
                         (match ag-type
                           "avg"      `(aggregate (~'avg ~field) :avg)
                           "count"    `(aggregate (~'count ~field) :count)
                           "distinct" `(aggregate (~'count (raw ~(format "DISTINCT(\"%s\")" (name field)))) :count)
                           "stddev"   `(fields [(sqlfn :stddev ~field) :stddev])
                           "sum"      `(aggregate (~'sum ~field) :sum)
                           "cum_sum"  `[(fields ~field)     ; just make sure this field is returned + included in GROUP BY
                                        (group ~field)])))) ; cumulative sum happens in post-processing (see below)

;; ### `:breakout`
;; ex.
;;
;;     [1412 1413]
(defmethod apply-form :breakout [[_ field-ids]]
  (match field-ids
    []    nil ; empty clause
    [nil] nil ; empty clause
    _     (let [field-names (map field-id->kw field-ids)
                order-by-field-names (some->> (:order_by *query*) ; get set of names of all fields specified in `order_by`
                                              (map first)
                                              (map field-id->kw)
                                              set)]
            `[(group  ~@field-names)
              (fields ~@field-names)
              ~@(->> field-names                                                    ; Add an implicit `order :ASC` clause for every field specified in `breakout`
                     (filter (complement (partial contains? order-by-field-names))) ; that is *not* specified *explicitly* in `order_by`.
                     (map (fn [field-name]
                            `(order ~field-name :ASC))))])))

;; ### `:fields`
;; ex.
;;
;;     [1412 1413]
(defmethod apply-form :fields [[_ field-ids]]
  (let [field-names (map field-id->kw field-ids)]
    `(fields ~@field-names)))

;; ### `:filter`
;; ex.
;;
;;     ["AND"
;;       [">" 1413 1]
;;       [">=" 1412 4]]
(defn- filter-subclause->predicate
  "Given a filter SUBCLAUSE, return a Korma filter predicate form for use in korma `where`.

    (filter-subclause->predicate [\">\" 1413 1]) -> {:field_name [> 1]} "
  [subclause]
  (match subclause
    ["INSIDE" lat-field lon-field lat-max lon-min lat-min lon-max] (let [lat-kw (field-id->kw lat-field)
                                                                         lon-kw (field-id->kw lon-field)]
                                                                     `(~'and ~@[{lat-kw ['< lat-max]}
                                                                                {lat-kw ['> lat-min]}
                                                                                {lon-kw ['< lon-max]}
                                                                                {lon-kw ['> lon-min]}]))
    [_ field-id & _] {(field-id->kw field-id)
                      (match subclause
                        [">"  _ value]        ['>    value]
                        ["<"  _ value]        ['<    value]
                        [">=" _ value]        ['>=   value]
                        ["<=" _ value]        ['<=   value]
                        ["="  _ value]        ['=    value]
                        ["!=" _ value]        ['not= value]
                        ["NOT_NULL" _]        ['not= nil]
                        ["IS_NULL" _]         ['=    nil]
                        ["BETWEEN" _ min max] ['between [min max]])}))

(defmethod apply-form :filter [[_ filter-clause]]
  (match filter-clause
    nil                  nil ; empty clause
    [nil nil]            nil ; empty clause
    []                   nil ; empty clause
    ["AND" & subclauses] `(where (~'and ~@(map filter-subclause->predicate
                                               subclauses)))
    ["OR" & subclauses]  `(where (~'or  ~@(map filter-subclause->predicate
                                               subclauses)))
    [& subclause]        `(where ~(filter-subclause->predicate subclause))))

;; ### `:limit`
;; ex.
;;
;;     10
(defmethod apply-form :limit [[_ value]]
  (when value
    `(limit ~value)))

;; ### `:order_by`
;; ex.
;;
;;     [[1416 "ascending"]
;;      [1412 "descending"]]
(defmethod apply-form :order_by [[_ order-by-pairs]]
  (when-not (empty? order-by-pairs)
    (->> order-by-pairs
         (map (fn [pair] (when-not (vector? pair) (throw (Exception. "order_by clause must consists of pairs like [field_id \"ascending\"]"))) pair))
         (mapv (fn [[field-id asc-desc]]
                 {:pre [(integer? field-id)
                        (string? asc-desc)]}
                 `(order ~(field-id->kw field-id) ~(case asc-desc
                                                     "ascending" :ASC
                                                     "descending" :DESC)))))))

;; ### `:page`
;; ex.
;;
;;     {:page 1
;;      :items 20}
(defmethod apply-form :page [[_ {:keys [items page]}]]
  {:pre [(integer? items)
         (> items 0)
         (integer? page)
         (> page 0)]}
  `[(limit ~items)
    (offset ~(* items (- page 1)))])

;; ### `:source_table`
(defmethod apply-form :source_table [_] ; nothing to do here since getting the `Table` is handled by `process`
  nil)


;; ## Post Processing

(defn- post-process
  "Post-processing stage for query results."
  [{query :query} results]
  (cond
    (query-is-cumulative-sum? query) (apply-cumulative-sum query results)
    :else                            (do results)))

;; ### Cumulative sum
;; Cumulative sum is a special case. We can't do it in the DB because it's not a SQL function; thus we do it as a post-processing step.

(defn- query-is-cumulative-sum?
  "Is this a cumulative sum query?"
  [query]
  (some->> (:aggregation query)
           first
           (= "cum_sum")))

(defn- apply-cumulative-sum
  "Cumulative sum the values of the aggregate `Field` in RESULTS."
  {:arglists '([query results])}
  [{[_ field-id] :aggregation} results]
  (let [field (field-id->kw field-id)
        values (->> results          ; make a sequence of cumulative sum values for each row
                    (map field)
                    (reductions +))]
    (map (fn [row value]              ; replace the value for each row with the cumulative sum value
           (assoc row field value))
         results values)))


;; ## Debugging Functions (Internal)

(defn- log-query
  "Log QUERY Dictionary and the korma form and SQL that the Query Processor translates it to."
  [{:keys [source_table] :as query} forms]
  (log/debug
   "\n********************"
   "\nSOURCE TABLE: " source_table
   "\nQUERY ->"      (with-out-str (clojure.pprint/pprint query))
   "\nKORMA FORM ->" (with-out-str (clojure.pprint/pprint `(select (table-id->korma-entity ~source_table) ~@forms)))
   "\nSQL ->"        (eval `(let [entity# (table-id->korma-entity ~source_table)]
                              (sql-only (select entity# ~@forms))))
   "\n********************\n"))
