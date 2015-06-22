(ns metabase.driver.generic-sql.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into korma SQL forms."
  (:require [clojure.core.match :refer [match]]
            [clojure.tools.logging :as log]
            [korma.core :refer :all]
            [metabase.config :as config]
            [metabase.db :refer :all]
            [metabase.driver.query-processor :as qp]
            (metabase.driver.generic-sql [native :as native]
                                         [util :refer :all])
            (metabase.models [database :refer [Database]]
                             [field :refer [Field]]
                             [table :refer [Table]])
            [metabase.util :as u]))


(declare apply-form
         log-query)

;; # INTERFACE

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

(defn- uncastify
  "Remove CAST statements from a column name if needed.

    (uncastify \"DATE\")               -> \"DATE\"
    (uncastify \"CAST(DATE AS DATE)\") -> \"DATE\""
  [column-name]
  (let [column-name (name column-name)]
    (keyword (or (second (re-find #"CAST\(([^\s]+) AS [\w]+\)" column-name))
                 (second (re-find (:uncastify-timestamp-regex qp/*driver*) column-name))
                 column-name))))

(defn process-structured
  "Convert QUERY into a korma `select` form, execute it, and annotate the results."
  [query]
  {:pre [(integer? (:database query)) ; double check that the query being passed is valid
         (map? (:query query))
         (= (name (:type query)) "query")]}
  (try
    (as-> (process query) results
      (eval results)
      (qp/annotate query results uncastify))
    (catch java.sql.SQLException e
      (let [^String message (or (->> (.getMessage e)                            ; error message comes back like "Error message ... [status-code]" sometimes
                                          (re-find  #"(?s)(^.*)\s+\[[\d-]+\]$") ; status code isn't useful and makes unit tests hard to write so strip it off
                                          second)                               ; (?s) = Pattern.DOTALL - tell regex `.` to match newline characters as well
                                (.getMessage e))]
        (throw (Exception. message))))))


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
                           "distinct" `(aggregate (~'count (sqlfn :DISTINCT ~field)) :count)
                           "stddev"   `(fields [(sqlfn :stddev ~field) :stddev])
                           "sum"      `(aggregate (~'sum ~field) :sum))))) ; cumulative sum happens in post-processing (see below)

;; ### `:breakout`
;; ex.
;;
;;     [1412 1413]
(defmethod apply-form :breakout [[_ field-ids]]
  (let [ ;; Group by all the breakout fields
        field-names                       (map field-id->kw field-ids)
        ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it twice, or korma will barf
        fields-not-in-fields-clause-names (->> field-ids
                                               (filter (partial (complement contains?) (set (:fields (:query qp/*query*)))))
                                               (map field-id->kw))]
    `[(group  ~@field-names)
      (fields ~@fields-not-in-fields-clause-names)]))


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

(defn- field-id->special-type [field-id]
  (sel :one :field [Field :special_type] :id field-id))

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
                      ;; If the field in question is a date field we need to cast the YYYY-MM-DD string that comes back from the UI to a SQL date
                      (let [cast-value-if-needed (fn [v]
                                                   (if-not (or (= (type v) java.sql.Date)
                                                               (= (type v) java.util.Date)) v
                                                     `(raw ~(format "CAST('%s' AS DATE)" (.toString ^java.sql.Date v)))))]
                        (match subclause
                          ["NOT_NULL" _]        ['not= nil]
                          ["IS_NULL" _]         ['=    nil]
                          ["BETWEEN" _ min max] ['between [(cast-value-if-needed min) (cast-value-if-needed max)]]
                          [_ _ value]           (let [value (cast-value-if-needed value)]
                                                  (match subclause
                                                    [">"  _ _] ['>    value]
                                                    ["<"  _ _] ['<    value]
                                                    [">=" _ _] ['>=   value]
                                                    ["<=" _ _] ['<=   value]
                                                    ["="  _ _] ['=    value]
                                                    ["!=" _ _] ['not= value]))))}))

(defmethod apply-form :filter [[_ filter-clause]]
  (match filter-clause
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
  `(limit ~value))

;; ### `:order_by`
;; ex.
;;
;;     [[1416 "ascending"]
;;      [1412 "descending"]]
(defmethod apply-form :order_by [[_ order-by-pairs]]
  (when-not (empty? order-by-pairs)
    (->> order-by-pairs
         (map (fn [pair] (when-not (vector? pair) (throw (Exception. "order_by clause must consists of pairs like [field_id \"ascending\"]"))) pair))
         (mapv (fn [[field asc-desc]]
                 {:pre [(string? asc-desc)]}
                 `(order ~(match [field]
                            [field-id :guard integer?] (field-id->kw field-id)
                            [["aggregation" 0]]        (let [[ag] (:aggregation (:query qp/*query*))]
                                                         `(raw ~(case ag
                                                                  "avg"      "\"avg\""   ; based on the type of the aggregation
                                                                  "count"    "\"count\"" ; make sure we ask the DB to order by the
                                                                  "distinct" "\"count\"" ; name of the aggregate field
                                                                  "stddev"   "\"stddev\""
                                                                  "sum"      "\"sum\""))))
                         ~(case asc-desc
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


;; ## Debugging Functions (Internal)

(defn- log-query
  "Log QUERY Dictionary and the korma form and SQL that the Query Processor translates it to."
  [{:keys [source_table] :as query} forms]
  (when-not qp/*disable-qp-logging*
    (log/debug
     "\n********************"
     "\nSOURCE TABLE: " source_table
     "\nQUERY ->"      (with-out-str (clojure.pprint/pprint query))
     "\nKORMA FORM ->" (with-out-str (clojure.pprint/pprint `(select (table-id->korma-entity ~source_table) ~@forms)))
     "\nSQL ->"        (eval `(let [entity# (table-id->korma-entity ~source_table)]
                                (sql-only (select entity# ~@forms))))
     "\n********************\n")))
