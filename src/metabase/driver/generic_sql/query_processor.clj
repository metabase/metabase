(ns metabase.driver.generic-sql.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into korma SQL forms."
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.config :as config]
            [metabase.db :refer :all]
            [metabase.driver.generic-sql.query-processor.annotate :as annotate]
            (metabase.models [field :refer [Field]]
                             [table :refer [Table]])))


(declare apply-form
         log-query
         field-id->kw
         table-id->korma-entity)

;; ## Public Functions

(defn process
  "Convert QUERY into a korma `select` form."
  [{{:keys [source_table] :as query} :query}]
  (when-not (zero? source_table)
    (let [forms (->> (map apply-form query)                    ; call `apply-form` for each clause and strip out nil results
                     (filter identity)
                     (mapcat (fn [form] (if (vector? form) form ; some `apply-form` implementations return a vector of multiple korma forms; if only one was
                                           [form])))           ; returned wrap it in a vec so `mapcat` can build a flattened sequence of forms
                     doall)]
      (when (config/config-bool :mb-db-logging)
        (log-query query forms))
      `(let [entity# (table-id->korma-entity ~source_table)]
         (select entity# ~@forms)))))


(defn process-and-run
  "Convert QUERY into a korma `select` form, execute it, and annotate the results."
  [query]
  {:pre [(integer? (:database query)) ; double check that the query being passed is valid
         (map? (:query query))
         (= (name (:type query)) "query")]}
  (->> (process query)
    eval
    (annotate/annotate query)))


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
    ["rows"]  nil                                  ; don't need to do anything special for `rows` - `select` selects all rows by default
    ["count"] `(aggregate (~'count :*) :count)     ; TODO - implement other types of aggregation (?)
    [_ _]     (let [[ag-type field-id] value       ; valid values to `korma.core/aggregate`: count, sum, avg, min, max, first, last
                    field (field-id->kw field-id)]
                (match (keyword ag-type)
                       :avg      `(aggregate (~'avg ~field) :avg)
                       :distinct `(aggregate (~'count (raw ~(format "DISTINCT(\"%s\")" (name field)))) :count)
                       :stddev   `(fields [(sqlfn :stddev ~field) :stddev])
                       :sum      `(aggregate (~'sum ~field) :sum)))))
                 ;; TODO - `:cum_sum` is not yet implemented (!)

;; ### `:breakout`
;; ex.
;;
;;     [1412 1413]
(defmethod apply-form :breakout [[_ field-ids]]
  (match field-ids
    []    nil ; empty clause
    [nil] nil ; empty clause
    _     `[(group  ~@(map field-id->kw field-ids))
            (fields ~@(map #(field-id->kw % :cast-include-as) field-ids))]))

;; ### `:fields`
;; ex.
;;
;;     [1412 1413]
(defmethod apply-form :fields [[_ field-ids]]
  (let [field-names (map #(field-id->kw % :cast-include-as) field-ids)]
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
  [[_ field-id :as subclause]]
  {(field-id->kw field-id)
   (match subclause
     [">"  _ value]        ['>    value]
     ["<"  _ value]        ['<    value]
     [">=" _ value]        ['>=   value]
     ["<=" _ value]        ['<=   value]
     ["="  _ value]        ['=    value]
     ["!=" _ value]        ['not= value]
     ["NOT_NULL" _]        ['not= nil]
     ["IS_NULL" _]         ['=    nil]
     ["BETWEEN" _ min max] ['between [min max]])})

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
                 `(order ~(field-id->kw field-id :no-cast) ~(case asc-desc
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


;; ## Utility Functions (Internal)

(defn table-id->korma-entity
  "Lookup `Table` with TABLE-ID and return a korma entity that can be used in a korma form."
  [table-id]
  {:pre [(integer? table-id)]
   :post [(map? %)]}
  (let [{:keys [korma-entity] :as table} (sel :one Table :id table-id)]
    (when-not table (throw (Exception. (format "Table with ID %d doesn't exist!" table-id))))
    @korma-entity))

(defn castify-field
  "Wrap Field in a SQL `CAST` statement if needed (i.e., it's a `DateTimeField`).

    (castify :name \"TextField\")                      -> :name
    (castify :date \"DateTimeField\")                  -> (raw \"CAST(\"date\" AS DATE)
    (castify :date \"DateTimeField\" :cast-include-as) -> (raw \"CAST(\"date\" AS DATE) AS \"date\"\")"
  [field-name field-base-type & options]
  {:pre [(string? field-name)
         (string? field-base-type)
         (every? keyword? options)]}
  (let [options (set options)]
    (if (or (= field-base-type "DateField")                      ; do we need to cast DateFields ?
            (= field-base-type "DateTimeField"))                 ; or just DateTimeFields ?
      `(raw ~(format "CAST(\"%s\" AS DATE)%s" field-name (if (contains? options :cast-include-as) (format " AS \"%s\"" field-name)
                                                             "")))
      (keyword field-name))))

;; TODO - should we memoize this?
(defn- field-id->kw
  "Given a metabase `Field` ID, return a keyword for use in the Korma form (or a casted raw string for date fields).

   OPTIONS
   *  `:no-cast`         Disable casting for this `Field`, even if it's a date. (i.e., for ordering, we probably don't want to cast away relevant parts of the timestamp).
   *  `:cast-include-as` If `Field` is casted, add an `AS \"original-field-name\"` to the cast (i.e, for `SELECT` clauses)."
  [field-id & options]
  {:pre [(integer? field-id)
         (every? keyword? options)
         (every? (partial contains? #{:no-cast :cast-include-as}) options)]}
  (let [options (set options)]
    (if-let [{field-name :name, field-type :base_type} (sel :one [Field :name :base_type] :id field-id)]
      (if (contains? options :no-cast) (keyword field-name)
          (apply castify-field field-name field-type options))
      (throw (Exception. (format "Field with ID %d doesn't exist!" field-id))))))


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
