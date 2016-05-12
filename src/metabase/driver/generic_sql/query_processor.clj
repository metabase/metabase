(ns metabase.driver.generic-sql.query-processor
  "The Query Processor is responsible for translating the Metabase Query Language into korma SQL forms."
  (:require [clojure.java.jdbc :as jdbc]
            (clojure [string :as s]
                     [walk :as walk])
            [clojure.tools.logging :as log]
            (honeysql [core :as hsql]
                      [format :as hformat]
                      [helpers :as h])
            (metabase [config :as config]
                      [driver :as driver])
            [metabase.driver.generic-sql :as sql]
            [metabase.query-processor :as qp]
            metabase.query-processor.interface
            [metabase.util :as u])
  (:import java.sql.Timestamp
           java.util.Date
           (metabase.query_processor.interface AgFieldRef
                                               DateTimeField
                                               DateTimeValue
                                               Field
                                               Expression
                                               ExpressionRef
                                               RelativeDateTimeValue
                                               Value)))

(def ^:dynamic *query*
  "The outer query currently being processed."
  nil)

(defn- driver [] {:pre [*query*]} (:driver *query*))

(defmethod hformat/fn-handler "distinct-count" [_ field]
  (str "count(distinct " (hformat/to-sql field) ")"))


;;; ## Formatting

(defn as
  "Generate a FORM `AS` FIELD alias using the name information of FIELD."
  [form field]
  {:pre [(driver)]}
  (if-let [alias (sql/field->alias (driver) field)]
    [form alias]
    form))

;; TODO - Consider moving this into query processor interface and making it a method on `ExpressionRef` instead ?
(defn- expression-with-name
  "Return the `Expression` referenced by a given (keyword or string) EXPRESSION-NAME."
  [expression-name]
  (or (get-in *query* [:query :expressions (keyword expression-name)]) (:expressions (:query *query*))
      (throw (Exception. (format "No expression named '%s'." (name expression-name))))))

(defprotocol ^:private IGenericSQLFormattable
  (formatted [this]
    "Return an appropriate HoneySQL form for an object."))

(extend-protocol IGenericSQLFormattable
  nil    (formatted [_] nil)
  Number (formatted [this] this)
  String (formatted [this] this)

  Expression
  (formatted [{:keys [operator args]}]
    (apply (partial hsql/call operator)
           (map formatted args)))

  ExpressionRef
  (formatted [{:keys [expression-name]}]
    ;; Unfortunately you can't just refer to the expression by name in other clauses like filter, but have to use the original formuala.
    (formatted (expression-with-name expression-name)))

  Field
  (formatted [{:keys [schema-name table-name special-type field-name]}]
    (let [field (keyword (hsql/qualify schema-name table-name field-name))]
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
      ;; For some arcane reason we name the results of a distinct aggregation "count",
      ;; everything else is named the same as the aggregation
      (if (= aggregation-type :distinct)
        :count
        aggregation-type)))

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
  "Apply an `aggregation` clause to HONEYSQL-FORM. Default implementation of `apply-aggregation` for SQL drivers."
  ([driver honeysql-form {{:keys [aggregation-type field]} :aggregation}]
   (apply-aggregation driver honeysql-form aggregation-type (formatted field)))

  ([driver honeysql-form aggregation-type field]
   (h/merge-select honeysql-form [(if-not field
                                    ;; aggregation clauses w/o a field
                                    (do (assert (= aggregation-type :count))
                                        :%count.*)
                                    ;; aggregation clauses w/ a Field
                                    (hsql/call (case  aggregation-type
                                                 :avg      :avg
                                                 :count    :count
                                                 :distinct :distinct-count
                                                 :stddev   (sql/stddev-fn driver)
                                                 :sum      :sum
                                                 :min      :min
                                                 :max      :max)
                                               field))
                                  (if (= aggregation-type :distinct)
                                    :count
                                    aggregation-type)])))

(defn apply-breakout
  "Apply a `breakout` clause to HONEYSQL-FORM. Default implementation of `apply-breakout` for SQL drivers."
  [_ honeysql-form {breakout-fields :breakout, fields-fields :fields}]
  (-> honeysql-form
      ;; Group by all the breakout fields
      ((partial apply h/group) (mapv formatted breakout-fields))
      ;; Add fields form only for fields that weren't specified in :fields clause -- we don't want to include them twice
      ((partial apply h/merge-select) (vec (for [field breakout-fields
                                                 :when (not (contains? (set fields-fields) field))]
                                             (as (formatted field) field))))))

(defn apply-fields
  "Apply a `fields` clause to HONEYSQL-FORM. Default implementation of `apply-fields` for SQL drivers."
  [_ honeysql-form {fields :fields}]
  (apply h/merge-select honeysql-form (vec (for [field fields]
                                             (as (formatted field) field)))))

(defn filter-subclause->predicate
  "Given a filter SUBCLAUSE, return a HoneySQL filter predicate form for use in HoneySQL `where`."
  [{:keys [filter-type field value], :as filter}]
  {:pre [(map? filter) field]}
  (let [field (formatted field)]
    (case          filter-type
      :between     [:between field (formatted (:min-val filter)) (formatted (:max-val filter))]
      :starts-with [:like    field (formatted (update value :value (fn [s] (str    s \%)))) ]
      :contains    [:like    field (formatted (update value :value (fn [s] (str \% s \%))))]
      :ends-with   [:like    field (formatted (update value :value (fn [s] (str \% s))))]
      :>           [:>       field (formatted value)]
      :<           [:<       field (formatted value)]
      :>=          [:>=      field (formatted value)]
      :<=          [:<=      field (formatted value)]
      :=           [:=       field (formatted value)]
      :!=          [:not=    field (formatted value)])))

(defn filter-clause->predicate
  "Given a filter CLAUSE, return a HoneySQL filter predicate form for use in HoneySQL `where`.  If this is a compound
   clause then we call `filter-subclause->predicate` on all of the subclauses."
  [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply vector :and (map filter-clause->predicate subclauses))
    :or  (apply vector :or  (map filter-clause->predicate subclauses))
    :not [:not (filter-subclause->predicate subclause)]
    nil  (filter-subclause->predicate clause)))

(defn apply-filter
  "Apply a `filter` clause to HONEYSQL-FORM. Default implementation of `apply-filter` for SQL drivers."
  [_ honeysql-form {clause :filter}]
  (h/where honeysql-form (filter-clause->predicate clause)))

(defn apply-join-tables
  "Apply expanded query `join-tables` clause to HONEYSQL-FORM. Default implementation of `apply-join-tables` for SQL drivers."
  [_ honeysql-form {join-tables :join-tables, {source-table-name :name, source-schema :schema} :source-table}]
  (loop [honeysql-form honeysql-form, [{:keys [table-name pk-field source-field schema]} & more] join-tables]
    (let [table-name        (hsql/qualify schema table-name)
          source-table-name (hsql/qualify source-schema source-table-name)
          honeysql-form     (h/left-join honeysql-form table-name
                                         [:= (hsql/qualify source-table-name (:field-name source-field))
                                             (hsql/qualify table-name        (:field-name pk-field))])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn apply-limit
  "Apply `limit` clause to HONEYSQL-FORM. Default implementation of `apply-limit` for SQL drivers."
  [_ honeysql-form {value :limit}]
  (h/limit honeysql-form value))

(defn apply-order-by
  "Apply `order-by` clause to HONEYSQL-FORM. Default implementation of `apply-order-by` for SQL drivers."
  [_ honeysql-form {subclauses :order-by}]
  (loop [honeysql-form honeysql-form, [{:keys [field direction]} & more] subclauses]
    (let [honeysql-form (h/merge-order-by honeysql-form [(formatted field) (case direction
                                                                             :ascending  :asc
                                                                             :descending :desc)])]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn apply-page
  "Apply `page` clause to HONEYSQL-FORM. Default implementation of `apply-page` for SQL drivers."
  [_ honeysql-form {{:keys [items page]} :page}]
  (-> honeysql-form
      (h/limit items)
      (h/offset (* items (dec page)))))

(defn- should-log-honeysql-form? []
  (and (config/config-bool :mb-db-logging)
       (not qp/*disable-qp-logging*)))

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

(defn- honeysql-form->sql+args [honeysql-form]
  {:pre [(map? honeysql-form)]}
  ;; TODO - quoting style
  (hsql/format honeysql-form
    :quoting             :ansi
    :allow-dashed-names? true))

(defn log-honeysql-form
  "Log a HoneySQL form and the SQL it corresponds to logging is enabled."
  ([honeysql-form]
   (when (should-log-honeysql-form?)
     (log-honeysql-form honeysql-form (try (first (honeysql-form->sql+args honeysql-form))
                                           (catch Throwable e
                                             (log/error (u/format-color 'red "Invalid HoneySQL form: %s\n%s" (.getMessage e) (u/pprint-to-str honeysql-form))))))))

  ([honeysql-form, ^String sql]
   (when (and (seq sql)
              (should-log-honeysql-form?))
     (log/debug (u/format-color 'green "\nHoneySQL Form: 😋\n%s" (u/pprint-to-str honeysql-form))
                (u/format-color 'blue  "\nSQL: 😈\n%s\n"         (pprint-sql sql))))))


;; TODO - make this a protocol method
(defn- apply-source-table [_ honeysql-form {{table-name :name, schema :schema} :source-table}]
  {:pre [table-name]}
  (h/from honeysql-form (hsql/qualify schema table-name)))

(def ^:private clause-handlers
  {:aggregation  #'sql/apply-aggregation ; use the vars rather than the functions themselves because them implementation
   :breakout     #'sql/apply-breakout    ; will get swapped around and  we'll be left with old version of the function that nobody implements
   :fields       #'sql/apply-fields
   :filter       #'sql/apply-filter
   :join-tables  #'sql/apply-join-tables
   :limit        #'sql/apply-limit
   :order-by     #'sql/apply-order-by
   :page         #'sql/apply-page
   :source-table apply-source-table})

(defn- apply-clauses
  "Loop through all the `clause->handler` entries; if the query contains a given clause, apply the handler fn."
  [driver honeysql-form query]
  (loop [honeysql-form honeysql-form, [[clause f] & more] (seq clause-handlers)]
    (let [honeysql-form (if (clause query)
                          (f driver honeysql-form query)
                          honeysql-form)]
      (if (seq more)
        (recur honeysql-form more)
        honeysql-form))))

(defn build-honeysql-form
  "Build the HoneySQL form we will compile to SQL and execute."
  [driverr {inner-query :query, :as outer-query}]
  {:pre [(map? outer-query) (map? inner-query) (:driver outer-query)]}
  (binding [*query* outer-query]
    (apply-clauses driverr {} inner-query)))

;; (require '[metabase.test.data.datasets :as datasets])
;; (require '[metabase.test.data :refer [dataset run-query]])
;; (require '[metabase.query-processor.expand :as ql])

;; (defn- x []
;;   (dataset tupac-sightings
;;            (run-query sightings
;;              (ql/order-by (ql/asc $city_id->cities.name)
;;                           (ql/desc $category_id->categories.name)
;;                           (ql/asc $id))
;;              (ql/limit 10))))

;; (defn- do-with-timezone [driver connection timezone f]
;;   (log/debug (u/format-color 'blue (sql/set-timezone-sql driver)))
;;   (try (jdbc/with-db-transaction [tconnection connection]
;;          (jdbc/execute! tconnection [(sql/set-timezone-sql driver) timezone])
;;          (f tconnection))
;;        (catch Throwable e
;;          (log/error (u/format-color 'red "Failed to set timezone:\n%s"
;;                       (with-out-str (jdbc/print-sql-exception-chain e))))
;;          (f tconnection))))

;; TODO - timezone stuff

(defn- exception->nice-error-message ^String [^java.sql.SQLException e]
  (or (->> (.getMessage e)                       ; error message comes back like "Error message ... [status-code]" sometimes
           (re-find  #"(?s)(^.*)\s+\[[\d-]+\]$") ; status code isn't useful and makes unit tests hard to write so strip it off
           second)                               ; (?s) = Pattern.DOTALL - tell regex `.` to match newline characters as well
      (.getMessage e)))

(defn- do-with-try-catch [f]
  (try
    (f)
    (catch java.sql.SQLException e
      (jdbc/print-sql-exception-chain e)
      (throw (Exception. (exception->nice-error-message e))))))

(defn- query! [database honeysql-form]
  (let [sql+args (honeysql-form->sql+args honeysql-form)]
    (jdbc/with-db-connection [connection (sql/db->jdbc-connection-spec database)]
      (jdbc/query connection sql+args
        :identifiers identity))))

(defn process-mbql
  "Convert QUERY into a HoneySQL form and execute it."
  [driver {database :database, settings :settings, :as outer-query}]
  (let [timezone      (:report-timezone settings)
        honeysql-form (build-honeysql-form driver outer-query)
        f             (fn []
                        (query! database honeysql-form))
        ;; f             (fn []
        ;;                 (kdb/with-db (:db entity)
        ;;                   (if (seq timezone)
        ;;                     (do-with-timezone driver timezone f)
        ;;                     (f))))
        ]
    (log-honeysql-form honeysql-form)
    (do-with-try-catch f)))
