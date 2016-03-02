(ns metabase.driver.generic-sql.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into korma SQL forms."
  (:require [clojure.core.match :refer [match]]
            [clojure.java.jdbc :as jdbc]
            (clojure [pprint :as pprint]
                     [string :as s]
                     [walk :as walk])
            [clojure.tools.logging :as log]
            (korma [core :as k]
                   [db :as kdb])
            (korma.sql [fns :as kfns]
                       [utils :as utils])
            [metabase.config :as config]
            [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.query-processor :as qp]
            metabase.driver.query-processor.interface
            [metabase.util :as u]
            [metabase.util.korma-extensions :as kx]
            [korma.sql.utils :as kutils]
            [korma.sql.engine :as kengine])
  (:import java.sql.Timestamp
           java.util.Date
           (metabase.driver.query_processor.interface AgFieldRef
                                                      DateTimeField
                                                      DateTimeValue
                                                      Field
                                                      RelativeDateTimeValue
                                                      Value)))

(def ^:dynamic *query*
  "The outer query currently being processed."
  nil)

(defn- driver [] (:driver *query*))


;;; ## Formatting

(defn as
  "Generate a FORM `AS` FIELD alias using the name information of FIELD."
  [form field]
  (if-let [alias (sql/field->alias (driver) field)]
    [form alias]
    form))


(defprotocol ^:private IGenericSQLFormattable
  (formatted [this]
    "Return an appropriate korma form for an object."))

(extend-protocol IGenericSQLFormattable
  nil (formatted [_] nil)

  Field
  (formatted [{:keys [schema-name table-name special-type field-name]}]
    (let [field (keyword (kx/combine+escape-name-components [schema-name table-name field-name]))]
      (case special-type
        :timestamp_seconds      (sql/unix-timestamp->timestamp (driver) field :seconds)
        :timestamp_milliseconds (sql/unix-timestamp->timestamp (driver) field :milliseconds)
        field)))

  DateTimeField
  (formatted [{unit :unit, field :field}]
    (sql/date (driver) unit (formatted field)))

  ;; e.g. the ["aggregation" 0] fields we allow in order-by
  AgFieldRef
  (formatted [_]
    (let [{:keys [aggregation-type]} (:aggregation (:query *query*))]
      (case aggregation-type
        :avg      :avg
        :count    :count
        :distinct :count
        :stddev   :stddev
        :sum      :sum)))

  Value
  (formatted [value] (sql/prepare-value (driver) value))

  DateTimeValue
  (formatted [{{unit :unit} :field, :as value}]
    (sql/date (driver) unit (sql/prepare-value (driver) value)))

  RelativeDateTimeValue
  (formatted [{:keys [amount unit], {field-unit :unit} :field}]
    (sql/date (driver) field-unit (if (zero? amount)
                                    (sql/current-datetime-fn (driver))
                                    (driver/date-interval (driver) unit amount)))))




;;; ## Clause Handlers

(defn apply-aggregation
  "Apply an `aggregation` clause to KORMA-FORM. Default implementation of `apply-aggregation` for SQL drivers."
  ([driver korma-form {{:keys [aggregation-type field]} :aggregation}]
   (apply-aggregation driver korma-form aggregation-type (formatted field)))

  ([driver korma-form aggregation-type field]
   (if-not field
     ;; aggregation clauses w/o a Field
     (do (assert (= aggregation-type :count))
         (k/aggregate korma-form (count (k/raw "*")) :count))
     ;; aggregation clauses with a Field
     (case aggregation-type
       :avg      (k/aggregate korma-form (avg field)                              :avg)
       :count    (k/aggregate korma-form (count field)                            :count)
       :distinct (k/aggregate korma-form (count (k/sqlfn :DISTINCT field))        :count)   ; why not call it :distinct? This complicates things
       :stddev   (k/fields    korma-form [(k/sqlfn* (sql/stddev-fn driver) field) :stddev])
       :sum      (k/aggregate korma-form (sum field)                              :sum)))))

(defn apply-breakout
  "Apply a `breakout` clause to KORMA-FORM. Default implementation of `apply-breakout` for SQL drivers."
  [_ korma-form {breakout-fields :breakout, fields-fields :fields}]
  (-> korma-form
      ;; Group by all the breakout fields
      ((partial apply k/group) (map formatted breakout-fields))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include it twice, or korma will barf
      ((partial apply k/fields) (for [field breakout-fields
                                      :when (not (contains? (set fields-fields) field))]
                                  (as (formatted field) field)))))

(defn apply-fields
  "Apply a `fields` clause to KORMA-FORM. Default implementation of `apply-fields` for SQL drivers."
  [_ korma-form {fields :fields}]
  (apply k/fields korma-form (for [field fields]
                                (as (formatted field) field))))

(defn- filter-subclause->predicate
  "Given a filter SUBCLAUSE, return a Korma filter predicate form for use in korma `where`."
  [{:keys [filter-type field value], :as filter}]
  {:pre [(map? filter) field]}
  (let [field (formatted field)]
    {field (case          filter-type
             :between     ['between [(formatted (:min-val filter)) (formatted (:max-val filter))]]
             :starts-with ['like (formatted (update value :value (fn [s] (str    s \%)))) ]
             :contains    ['like (formatted (update value :value (fn [s] (str \% s \%))))]
             :ends-with   ['like (formatted (update value :value (fn [s] (str \% s))))]
             :>           ['>    (formatted value)]
             :<           ['<    (formatted value)]
             :>=          ['>=   (formatted value)]
             :<=          ['<=   (formatted value)]
             :=           ['=    (formatted value)]
             :!=          ['not= (formatted value)])}))

(defn- filter-clause->predicate [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply kfns/pred-and (map filter-clause->predicate subclauses))
    :or  (apply kfns/pred-or  (map filter-clause->predicate subclauses))
    :not (kfns/pred-not (kengine/pred-map (filter-subclause->predicate subclause)))
    nil  (filter-subclause->predicate clause)))

(defn apply-filter
  "Apply a `filter` clause to KORMA-FORM. Default implementation of `apply-filter` for SQL drivers."
  [_ korma-form {clause :filter}]
  (k/where korma-form (filter-clause->predicate clause)))

(defn apply-join-tables
  "Apply expanded query `join-tables` clause to KORMA-FORM. Default implementation of `apply-join-tables` for SQL drivers."
  [_ korma-form {join-tables :join-tables, {source-table-name :name, source-schema :schema} :source-table}]
  (loop [korma-form korma-form, [{:keys [table-name pk-field source-field schema]} & more] join-tables]
    (let [table-name        (if (seq schema)
                              (str schema \. table-name)
                              table-name)
          source-table-name (if (seq source-schema)
                              (str source-schema \. source-table-name)
                              source-table-name)
          korma-form       (k/join korma-form table-name
                                    (= (keyword (str source-table-name \. (:field-name source-field)))
                                       (keyword (str table-name        \. (:field-name pk-field)))))]
      (if (seq more)
        (recur korma-form more)
        korma-form))))

(defn apply-limit
  "Apply `limit` clause to KORMA-FORM. Default implementation of `apply-limit` for SQL drivers."
  [_ korma-form {value :limit}]
  (k/limit korma-form value))

(defn apply-order-by
  "Apply `order-by` clause to KORMA-FORM. Default implementation of `apply-order-by` for SQL drivers."
  [_ korma-form {subclauses :order-by}]
  (loop [korma-form korma-form, [{:keys [field direction]} & more] subclauses]
    (let [korma-form (k/order korma-form (formatted field) (case direction
                                                               :ascending  :ASC
                                                               :descending :DESC))]
      (if (seq more)
        (recur korma-form more)
        korma-form))))

(defn apply-page
  "Apply `page` clause to KORMA-FORM. Default implementation of `apply-page` for SQL drivers."
  [_ korma-form {{:keys [items page]} :page}]
  (-> korma-form
      (k/limit items)
      (k/offset (* items (dec page)))))

(defn- should-log-korma-form? []
  (and (config/config-bool :mb-db-logging)
       (not qp/*disable-qp-logging*)))

(defn pprint-korma-form
  "Removing empty/`nil` kv pairs from KORMA-FORM and strip ns qualifiers (e.g. `(keyword (name :korma.sql.utils/func))` -> `:func`)."
  [korma-form]
  (u/pprint-to-str (walk/postwalk (fn [x] (cond
                                            (keyword? x) (keyword (name x)) ; strip off ns qualifiers from keywords
                                            (fn? x)      (class x)
                                            :else        x))
                                  (into {} (for [[k v] (dissoc korma-form :db :ent :from :options :aliases :results :type :alias)
                                                 :when (or (not (sequential? v))
                                                           (seq v))]
                                             {k v})))))

(defn pprint-sql
  "Add newlines to the SQL to make it more readable."
  [sql]
  (when sql
    (-> sql
        (s/replace #"\sFROM" "\nFROM")
        (s/replace #"\sLEFT JOIN" "\nLEFT JOIN")
        (s/replace #"\sWHERE" "\nWHERE")
        (s/replace #"\sGROUP BY" "\nGROUP BY")
        (s/replace #"\sORDER BY" "\nORDER BY")
        (s/replace #"\sLIMIT" "\nLIMIT")
        (s/replace #"\sAND\s" "\n   AND ")
        (s/replace #"\sOR\s" "\n    OR "))))

(defn log-korma-form
  "Log a korma form and the SQL it corresponds to logging is enabled."
  ([korma-form]
   (when (should-log-korma-form?)
     (log-korma-form korma-form (try (k/as-sql korma-form)
                                     (catch Throwable e
                                       (log/error (u/format-color 'red "Invalid korma form: %s" (.getMessage e))))))))

  ([korma-form, ^String sql]
   (when (should-log-korma-form?)
     (log/debug (u/format-color 'green "\nKORMA FORM: 😋\n%s" (pprint-korma-form korma-form))
                (u/format-color 'blue "\nSQL: 😈\n%s\n"  (pprint-sql sql))))))



(def ^:private clause-handlers
  {:aggregation #'sql/apply-aggregation ; use the vars rather than the functions themselves because them implementation
   :breakout    #'sql/apply-breakout    ; will get swapped around and  we'll be left with old version of the function that nobody implements
   :fields      #'sql/apply-fields
   :filter      #'sql/apply-filter
   :join-tables #'sql/apply-join-tables
   :limit       #'sql/apply-limit
   :order-by    #'sql/apply-order-by
   :page        #'sql/apply-page})

(defn- apply-clauses
  "Loop through all the `clause->handler` entries; if the query contains a given clause, apply the handler fn."
  [driver korma-form query]
  (loop [korma-form korma-form, [[clause f] & more] (seq clause-handlers)]
    (let [korma-form (if (clause query)
                        (f driver korma-form query)
                        korma-form)]
      (if (seq more)
        (recur korma-form more)
        korma-form))))

(defn- do-with-timezone [driver f]
  (log/debug (u/format-color 'blue (sql/set-timezone-sql driver)))
  (try (kdb/transaction (k/exec-raw [(sql/set-timezone-sql driver) [(driver/report-timezone)]])
                        (f))
       (catch Throwable e
         (log/error (u/format-color 'red "Failed to set timezone:\n%s"
                      (with-out-str (jdbc/print-sql-exception-chain e))))
         (f))))

(defn- do-with-try-catch [f]
  (try
    (f)
    (catch java.sql.SQLException e
      (jdbc/print-sql-exception-chain e)
      (let [^String message (or (->> (.getMessage e)                       ; error message comes back like "Error message ... [status-code]" sometimes
                                     (re-find  #"(?s)(^.*)\s+\[[\d-]+\]$") ; status code isn't useful and makes unit tests hard to write so strip it off
                                     second)                               ; (?s) = Pattern.DOTALL - tell regex `.` to match newline characters as well
                                (.getMessage e))]
        (throw (Exception. message))))))

(defn build-korma-form
  "Build the korma form we will call `k/exec` on."
  [driver {inner-query :query :as outer-query} entity]
  (binding [*query* outer-query]
      (apply-clauses driver (k/select* entity) inner-query)))

(defn process-structured
  "Convert QUERY into a korma `select` form, execute it, and annotate the results."
  [driver {{:keys [source-table]} :query, database :database, :as outer-query}]
  (let [set-timezone? (and (seq (driver/report-timezone))
                           (contains? (driver/features driver) :set-timezone))
        entity        ((resolve 'metabase.driver.generic-sql/korma-entity) database source-table)
        korma-form   (build-korma-form driver outer-query entity)
        f             (partial k/exec korma-form)
        f             (fn []
                        (kdb/with-db (:db entity)
                          (if set-timezone?
                            (do-with-timezone driver f)
                            (f))))]
    (log-korma-form korma-form)
    (do-with-try-catch f)))
