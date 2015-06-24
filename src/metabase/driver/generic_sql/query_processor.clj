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
            [metabase.util :as u])
  (:import (metabase.driver.query_processor.expand Field
                                                   Value)))


(declare apply-form
         log-korma-form)

;; # INTERFACE

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
  [{{:keys [source_table]} :query, :as query}]
  (try
    ;; Process the expanded query and generate a korma form
    (let [korma-form `(let [entity# (table-id->korma-entity ~source_table)]
                        (select entity# ~@(->> (map apply-form (:query query))
                                               (filter identity)
                                               (mapcat #(if (vector? %) % [%])))))]

      ;; Log generated korma form
      (when (config/config-bool :mb-db-logging)
        (log-korma-form korma-form))

      ;; Now eval the korma form. Then annotate the results
      ;; TODO - why does this happen within the individual drivers still? Annotate should be moved out
      (let [results (eval korma-form)]
        (qp/annotate query results uncastify)))

    (catch java.sql.SQLException e
      (let [^String message (or (->> (.getMessage e)                            ; error message comes back like "Error message ... [status-code]" sometimes
                                          (re-find  #"(?s)(^.*)\s+\[[\d-]+\]$") ; status code isn't useful and makes unit tests hard to write so strip it off
                                          second)                               ; (?s) = Pattern.DOTALL - tell regex `.` to match newline characters as well
                                (.getMessage e))]
        (throw (Exception. message))))))

(defn process-and-run
  "Process and run a query and return results."
  [{:keys [type] :as query}]
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

(defmethod apply-form :default [form]
  (println (u/format-color 'red "Ignoring form: %s" (u/pprint-to-str form))))


(defprotocol IGenericSQLFormattable
  (formatted [this]))

(extend-protocol IGenericSQLFormattable
  Field
  (formatted [{:keys [field-name base-type-special-type]}]
    ;; TODO
    (keyword field-name))

  Value
  (formatted [{:keys [value base-type special-type]}]
    ;; TODO
    value))


(defmethod apply-form :aggregation [[_ {:keys [aggregation-type field]}]]
  (if-not field
    ;; aggregation clauses w/o a Field
    (case aggregation-type
      :rows  nil                               ; don't need to do anything special for `rows` - `select` selects all rows by default
      :count `(aggregate (~'count :*) :count))
    ;; aggregation clauses with a Field
    (let [field (formatted field)]
      (case aggregation-type
        :avg      `(aggregate (~'avg ~field) :avg)
        :count    `(aggregate (~'count ~field) :count)
        :distinct `(aggregate (~'count (sqlfn :DISTINCT ~field)) :count)
        :stddev   `(fields [(sqlfn :stddev ~field) :stddev])
        :sum      `(aggregate (~'sum ~field) :sum)))))


;; TODO
(defmethod apply-form :breakout [[_ field-ids]]
  (let [ ;; Group by all the breakout fields
        field-names                       (map field-id->kw field-ids)
        ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it twice, or korma will barf
        fields-not-in-fields-clause-names (->> field-ids
                                               (filter (partial (complement contains?) (set (:fields (:query qp/*query*)))))
                                               (map field-id->kw))]
    `[(group  ~@field-names)
      (fields ~@fields-not-in-fields-clause-names)]))


(defmethod apply-form :fields [[_ fields]]
  `(fields ~@(map formatted fields)))


;; (fn [v]
;;   (if-not (or (= (type v) java.sql.Date)
;;               (= (type v) java.util.Date)) v
;;               `(raw ~(format "CAST('%s' AS DATE)" (.toString ^java.sql.Date v)))))

(defn- filter-subclause->predicate
  "Given a filter SUBCLAUSE, return a Korma filter predicate form for use in korma `where`."
  [{:keys [filter-type], :as filter}]
  (if (= filter-type :inside)
    ;; inside filter subclause
    (let [{:keys [lat lon]} :filter]
      `(~'and {~(formatted (:field lat)) ['< ~(formatted (:max lat))]}
              {~(formatted (:field lat)) ['> ~(formatted (:min lat))]}
              {~(formatted (:field lon)) ['< ~(formatted (:max lon))]}
              {~(formatted (:field lon)) ['> ~(formatted (:min lon))]}))

    ;; all other filter subclauses
    (let [field (formatted (:field filter))
          value (some-> filter :value formatted)]
      (case filter-type
        :between  {field ['between [(formatted (:min-val filter)) (formatted (:max-val filter))]]}
        :not-null {field ['not= nil]}
        :is-null  {field ['=    nil]}
        :>        {field ['>    value]}
        :<        {field ['<    value]}
        :>=       {field ['>=   value]}
        :<=       {field ['<=   value]}
        :=        {field ['=    value]}
        :!=       {field ['not= value]}))))

(defmethod apply-form :filter [[_ {:keys [compound-type subclauses]}]]
  (let [[first-subclause :as subclauses] (map filter-subclause->predicate subclauses)]
    `(where ~(case compound-type
               :and    `(~'and ~@subclauses)
               :or     `(~'or  ~@subclauses)
               :simple first-subclause))))

(defmethod apply-form :limit [[_ value]]
  `(limit ~value))

;; TODO
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

;; TODO (?)
(defmethod apply-form :page [[_ {:keys [items page]}]]
  {:pre [(integer? items)
         (> items 0)
         (integer? page)
         (> page 0)]}
  `[(limit ~items)
    (offset ~(* items (- page 1)))])


;; ## Debugging Functions (Internal)

(defn- log-korma-form
  [korma-form]
  (when-not qp/*disable-qp-logging*
    (log/debug
     (u/format-color 'green "\n\nKORMA FORM:\n%s" (u/pprint-to-str korma-form))
     (u/format-color 'blue  "\nSQL:\n%s\n"        (eval (let [[let-form binding-form & body] korma-form] ; wrap the (select ...) form in a sql-only clause
                                                          `(~let-form ~binding-form                      ; has to go there to work correctly
                                                             (sql-only ~@body))))))))
