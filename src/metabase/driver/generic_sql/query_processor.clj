(ns metabase.driver.generic-sql.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into korma SQL forms."
  (:require [clojure.core.match :refer [match]]
            [clojure.java.jdbc :as jdbc]
            [clojure.string :as s]
            [clojure.tools.logging :as log]
            (korma [core :as k]
                   [db :as kdb])
            (korma.sql [fns :as kfns]
                       [utils :as utils])
            [metabase.config :as config]
            [metabase.driver :as driver]
            (metabase.driver.generic-sql [native :as native]
                                         [util :refer :all])
            [metabase.driver.query-processor :as qp]
            [metabase.util :as u])
  (:import java.sql.Timestamp
           java.util.Date
           (metabase.driver.query_processor.interface DateTimeField
                                                      DateTimeValue
                                                      Field
                                                      OrderByAggregateField
                                                      RelativeDateTimeValue
                                                      Value)))

(def ^:private ^:dynamic *query* nil)

;;; ## Formatting

(defprotocol IGenericSQLFormattable
  (formatted [this] [this include-as?]))

(extend-protocol IGenericSQLFormattable
  Field
  (formatted
    ([this]
     (formatted this false))
    ([{:keys [schema-name table-name special-type field-name], :as field} include-as?]
     (let [->timestamp (:unix-timestamp->timestamp (:driver *query*))
           field       (cond-> (keyword (str (when schema-name (str schema-name \.)) table-name \. field-name))
                         (= special-type :timestamp_seconds)      (->timestamp :seconds)
                         (= special-type :timestamp_milliseconds) (->timestamp :milliseconds))]
       (if include-as? [field (keyword field-name)]
           field))))

  DateTimeField
  (formatted
    ([this]
     (formatted this false))
    ([{unit :unit, {:keys [field-name base-type special-type], :as field} :field} include-as?]
     (let [field ((:date (:driver *query*)) unit (formatted field))]
       (if include-as? [field (keyword field-name)]
           field))))

  ;; e.g. the ["aggregation" 0] fields we allow in order-by
  OrderByAggregateField
  (formatted
    ([this]
     (formatted this false))
    ([_ _]
     (let [{:keys [aggregation-type]} (:aggregation (:query *query*))]
       (case aggregation-type
         :avg      :avg
         :count    :count
         :distinct :count
         :stddev   :stddev
         :sum      :sum))))

  Value
  (formatted
    ([this]
     (formatted this false))
    ([{value :value, {:keys [base-type]} :field} _]
     (if (= base-type :UUIDField)
       (java.util.UUID/fromString value)
       value)))

  DateTimeValue
  (formatted
    ([this]
     (formatted this false))
    ([{value :value, {unit :unit} :field} _]
     ;; prevent Clojure from converting this to #inst literal, which is a util.date
     ((:date (:driver *query*)) unit value)))

  RelativeDateTimeValue
  (formatted
    ([this]
     (formatted this false))
    ([{:keys [amount unit], {field-unit :unit} :field} _]
     (let [{:keys [date date-interval]} (:driver *query*)]
       (date field-unit (if (zero? amount)
                          (-> *query* :driver :current-datetime-fn)
                          (date-interval unit amount)))))))


;;; ## Clause Handlers

(defn- apply-aggregation [korma-query {{:keys [aggregation-type field]} :aggregation}]
  (if-not field
    ;; aggregation clauses w/o a Field
    (case aggregation-type
      :rows  korma-query ; don't need to do anything special for `rows` - `select` selects all rows by default
      :count (k/aggregate korma-query (count (k/raw "*")) :count))
    ;; aggregation clauses with a Field
    (let [field (formatted field)]
      (case aggregation-type
        :avg      (k/aggregate korma-query (avg field) :avg)
        :count    (k/aggregate korma-query (count field) :count)
        :distinct (k/aggregate korma-query (count (k/sqlfn :DISTINCT field)) :count)
        :stddev   (k/fields    korma-query [(k/sqlfn* (-> *query* :driver :stddev-fn) field) :stddev])
        :sum      (k/aggregate korma-query (sum field) :sum)))))

(defn- apply-breakout [korma-query {fields :breakout}]
  (-> korma-query
      ;; Group by all the breakout fields
      ((partial apply k/group) (map formatted fields))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it twice, or korma will barf
      ((partial apply k/fields) (->> fields
                                     (filter (partial (complement contains?) (set (:fields (:query *query*)))))
                                     (map (u/rpartial formatted :include-as))))))

(defn- apply-fields [korma-query {fields :fields}]
  (apply k/fields korma-query (for [field fields]
                                (formatted field :include-as))))

(defn- filter-subclause->predicate
  "Given a filter SUBCLAUSE, return a Korma filter predicate form for use in korma `where`."
  [{:keys [filter-type], :as filter}]
  (if (= filter-type :inside)
    ;; INSIDE filter subclause
    (let [{:keys [lat lon]} filter]
      (kfns/pred-and {(formatted (:field lat)) ['between [(formatted (:min lat)) (formatted (:max lat))]]}
                     {(formatted (:field lon)) ['between [(formatted (:min lon)) (formatted (:max lon))]]}))

    ;; all other filter subclauses
    (let [field (formatted (:field filter))
          value (some-> filter :value formatted)]
      (case          filter-type
        :between     {field ['between [(formatted (:min-val filter)) (formatted (:max-val filter))]]}
        :not-null    {field ['not= nil]}
        :is-null     {field ['=    nil]}
        :starts-with {field ['like (str value \%)]}
        :contains    {field ['like (str \% value \%)]}
        :ends-with   {field ['like (str \% value)]}
        :>           {field ['>    value]}
        :<           {field ['<    value]}
        :>=          {field ['>=   value]}
        :<=          {field ['<=   value]}
        :=           {field ['=    value]}
        :!=          {field ['not= value]}))))

(defn- filter-clause->predicate [{:keys [compound-type subclauses], :as clause}]
  (case compound-type
    :and (apply kfns/pred-and (map filter-clause->predicate subclauses))
    :or  (apply kfns/pred-or  (map filter-clause->predicate subclauses))
    nil  (filter-subclause->predicate clause)))

(defn- apply-filter [korma-query {clause :filter}]
  (k/where korma-query (filter-clause->predicate clause)))

(defn- apply-join-tables [korma-query {join-tables :join-tables, {source-table-name :name} :source-table}]
  (loop [korma-query korma-query, [{:keys [table-name pk-field source-field]} & more] join-tables]
    (let [korma-query (k/join korma-query table-name
                              (= (keyword (format "%s.%s" source-table-name (:field-name source-field)))
                                 (keyword (format "%s.%s" table-name        (:field-name pk-field)))))]
      (if (seq more)
        (recur korma-query more)
        korma-query))))

(defn- apply-limit [korma-query {value :limit}]
  (k/limit korma-query value))

(defn- apply-order-by [korma-query {subclauses :order-by}]
  (loop [korma-query korma-query, [{:keys [field direction]} & more] subclauses]
    (let [korma-query (k/order korma-query (formatted field) (case direction
                                                               :ascending  :ASC
                                                               :descending :DESC))]
      (if (seq more)
        (recur korma-query more)
        korma-query))))

(defn- apply-page [korma-query {{:keys [items page]} :page}]
  (-> korma-query
      (k/limit items)
      (k/offset (* items (dec page)))))

(defn- log-korma-form
  [korma-form]
  (when (config/config-bool :mb-db-logging)
    (when-not qp/*disable-qp-logging*
      (log/debug
       (u/format-color 'green "\nKORMA FORM: 😋\n%s" (u/pprint-to-str (dissoc korma-form :db :ent :from :options :aliases :results :type :alias))))
      (try
        (log/debug
         (u/format-color 'blue "\nSQL: 😈\n%s\n" (-> (k/as-sql korma-form)
                                                      (s/replace #"\sFROM" "\nFROM") ; add newlines to the SQL to make it more readable
                                                      (s/replace #"\sLEFT JOIN" "\nLEFT JOIN")
                                                      (s/replace #"\sWHERE" "\nWHERE")
                                                      (s/replace #"\sGROUP BY" "\nGROUP BY")
                                                      (s/replace #"\sORDER BY" "\nORDER BY")
                                                      (s/replace #"\sLIMIT" "\nLIMIT")
                                                      (s/replace #"\sAND" "\n   AND")
                                                      (s/replace #"\sOR" "\n    OR"))))
        ;; (k/as-sql korma-form) will barf if the korma form is invalid
        (catch Throwable e
          (log/error (u/format-color 'red "Invalid korma form: %s" (.getMessage e))))))))

(def ^:const clause->handler
  "A map of QL clauses to fns that handle them. Each function is called like

       (fn [korma-query query])

   and should return an appropriately modified KORMA-QUERY. SQL drivers contain a copy of this map keyed by `:qp-clause->handler`.
   Most drivers can use the default implementations for all clauses, but some may need to override one or more (e.g. SQL Server needs to
   override the behavior of `apply-limit`, since T-SQL uses `TOP` instead of `LIMIT`)."
  {:aggregation apply-aggregation
   :breakout    apply-breakout
   :fields      apply-fields
   :filter      apply-filter
   :join-tables apply-join-tables
   :limit       apply-limit
   :order-by    apply-order-by
   :page        apply-page})

(defn process-structured
  "Convert QUERY into a korma `select` form, execute it, and annotate the results."
  [{{:keys [source-table] :as query} :query, driver :driver, database :database, :as outer-query}]
  (binding [*query* outer-query]
    (try
      (let [entity      (korma-entity database source-table)
            timezone    (driver/report-timezone)
            ;; Loop through all the :qp-clause->handler entries in the current driver. If the query contains a given clause, apply its handler fn.
            korma-query (loop [korma-query (k/select* entity), [[clause f] & more] (seq (:qp-clause->handler driver))]
                          (let [korma-query (if (clause query)
                                              (f korma-query query)
                                              korma-query)]
                            (if (seq more)
                              (recur korma-query more)
                              korma-query)))]

        (log-korma-form korma-query)

        (kdb/with-db (:db entity)
          (if (and (seq timezone)
                   (contains? (:features driver) :set-timezone))
            (try (kdb/transaction (k/exec-raw [(:set-timezone-sql driver) [timezone]])
                                  (k/exec korma-query))
                 (catch Throwable e
                   (log/error (u/format-color 'red "Failed to set timezone:\n%s"
                                (with-out-str (jdbc/print-sql-exception-chain e))))
                   (k/exec korma-query)))
            (k/exec korma-query))))

      (catch java.sql.SQLException e
        (jdbc/print-sql-exception-chain e)
        (let [^String message (or (->> (.getMessage e)                       ; error message comes back like "Error message ... [status-code]" sometimes
                                       (re-find  #"(?s)(^.*)\s+\[[\d-]+\]$") ; status code isn't useful and makes unit tests hard to write so strip it off
                                       second)                               ; (?s) = Pattern.DOTALL - tell regex `.` to match newline characters as well
                                  (.getMessage e))]
          (throw (Exception. message)))))))

(defn process-and-run
  "Process and run a query and return results."
  [{:keys [type] :as query}]
  (case (keyword type)
    :native (native/process-and-run query)
    :query  (process-structured query)))
