(ns metabase.driver.crate
  (:require [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as qp]
            (korma [core :as k])
            [korma.sql.engine :as kengine]
            [korma.sql.fns :as kfns]
            [metabase.util.korma-extensions :as kx]
            [korma.sql.utils :as kutils]
            [clj-time.format :as f]
            [clj-time.coerce :as c]
            [clj-time.core :as t])
  (:import (clojure.lang Named)
           (java.sql Timestamp)))


(defn- column->base-type
  "Map of Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  [_ column-type]
  ({:integer   :IntegerField
    :string    :TextField
    :boolean   :BooleanField
    :byte      :IntegerField
    :short     :IntegerField
    :long      :BigIntegerField
    :float     :FloatField
    :double    :FloatField
    :ip        :UnknownField
    :timestamp :DateTimeField
    :geo_point :UnknownField
    :geo_shape :UnknownField
    } column-type))

;; # Adapt generic SQL to Crate SQL

(defn- filter-subclause->predicate
  "Given a filter SUBCLAUSE, return a Korma filter predicate form for use in korma `where`."
  [{:keys [filter-type field value], :as filter}]
  {:pre [(map? filter) field]}
  (let [field (qp/formatted field)]
    {field (case filter-type
             ;; TODO: implement Crate equivalent for "BETWEEN"
             :between     ['between [(qp/formatted (:min-val filter)) (qp/formatted (:max-val filter))]]
             :starts-with ['like (qp/formatted (update value :value (fn [s] (str s \%))))]
             :contains    ['like (qp/formatted (update value :value (fn [s] (str \% s \%))))]
             :ends-with   ['like (qp/formatted (update value :value (fn [s] (str \% s))))]
             :>           ['> (qp/formatted value)]
             :<           ['< (qp/formatted value)]
             :>=          ['>= (qp/formatted value)]
             :<=          ['<= (qp/formatted value)]
             :=           ['= (qp/formatted value)]
             :!=          ['not= (qp/formatted value)])}))

(defn- filter-clause->predicate [{:keys [compound-type subclause subclauses], :as clause}]
  (case compound-type
    :and (apply kfns/pred-and (map filter-clause->predicate subclauses))
    :or  (apply kfns/pred-or (map filter-clause->predicate subclauses))
    :not (kfns/pred-not (kengine/pred-map (filter-subclause->predicate subclause)))
    nil  (filter-subclause->predicate clause)))

(defn- apply-filter
  "Apply custom generic SQL filter"
  [_ korma-form {clause :filter}]
  (k/where korma-form (filter-clause->predicate clause)))


;; # Adapt datetime operations to support Crate SQL

(def ^:private now (k/sqlfn :CURRENT_TIMESTAMP (k/raw 3)))

(def ^:private YEAR   (constantly 31536000000))
(def ^:private MONTH  (constantly 2628000000))
(def ^:private WEEK   (constantly 604800000))
(def ^:private DAY    (constantly 86400000))

(defn- convert-to-isotime
  "Prints datetime as ISO time"
  [sql-time format]
  (if (= (instance? Timestamp sql-time) true)
    (f/unparse (f/formatters format)
               (t/from-time-zone (c/from-sql-time sql-time)
                                 (t/time-zone-for-offset -2)))
    sql-time))

(defn- unix-timestamp->timestamp [_ expr seconds-or-milliseconds]
  "Converts datetime string to a valid timestamp"
  (case seconds-or-milliseconds
    :seconds       (kutils/func (format "TRY_CAST('%s' as TIMESTAMP)" seconds-or-milliseconds) [expr])
    :milliseconds  (recur nil (kx// expr 1000) :seconds)))

(defn- date-trunc [unit expr]
  "date_trunc('interval', timestamp): truncates a timestamp to a given interval"
  (k/sqlfn :DATE_TRUNC (kx/literal unit) expr))

(defn- extract    [unit expr]
  "extract(field from expr): extracts subfields of a timestamp"
  (kutils/func (format "EXTRACT(%s FROM %%s)" (name unit)) [expr]))

(def ^:private extract-integer
  (comp kx/->integer extract))

(defn- date [_ unit expr]
  (case unit
    :default         (kx/->timestamp expr)
    :minute          (date-trunc :minute expr)
    :minute-of-hour  (extract-integer :minute expr)
    :hour            (date-trunc :hour expr)
    :hour-of-day     (extract-integer :hour expr)
    :day             (date-trunc :day (convert-to-isotime expr :date-hour-minute-second))
    :day-of-week     (extract-integer :day_of_week expr)
    :day-of-month    (extract-integer :day_of_month expr)
    :day-of-year     (extract-integer :day_of_year expr)
    :week            (date-trunc :week expr)
    :week-of-year    (extract-integer :week expr)
    :month           (date-trunc :month expr)
    :month-of-year   (extract-integer :month expr)
    :quarter         (date-trunc :quarter expr)
    :quarter-of-year (extract-integer :quarter expr)
    :year            (extract-integer :year expr)))

(defn- sql-interval [unit amount]
  (format "CURRENT_TIMESTAMP + %d" (* (unit) amount)))

(defn- date-interval [_ unit amount]
  "defines the sql command required for date-interval calculation"
  (case unit
    :quarter  (recur nil :month (kx/* amount 3))
    :year     (k/raw (sql-interval YEAR amount))
    :month    (k/raw (sql-interval MONTH amount))
    :week     (k/raw (sql-interval WEEK amount))
    :day      (k/raw (sql-interval DAY amount))))

(defrecord CrateDriver []
  Named
  (getName [_] "Crate"))

(defn- crate-spec
  [{:keys [host port]
    :or {host "localhost", port 4300}
    :as opts}]
  (merge {:classname "io.crate.client.jdbc.CrateDriver" ; must be in classpath
          :subprotocol "crate"
          :subname (str "//" host ":" port)}
         (dissoc opts :host :port)))

(defn- connection-details->spec [_ details]
  (-> details crate-spec))

(defn- can-connect [driver details]
  (let [connection (connection-details->spec driver details)]
    (= 1 (-> (k/exec-raw connection "select 1 from sys.cluster" :results)
             first
             vals
             first))))

(def CrateISQLDriverMixin
  "Implementations of `ISQLDriver` methods for `CrateDriver`."
  (merge (sql/ISQLDriverDefaultsMixin)
         {:connection-details->spec  connection-details->spec
          :column->base-type         column->base-type
          :string-length-fn          (constantly :CHAR_LENGTH)
          :apply-filter              apply-filter
          :date                      date
          :unix-timestamp->timestamp unix-timestamp->timestamp
          :current-datetime-fn       (constantly now)}))

(extend CrateDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:details-fields (constantly [{:name         "host"
                                        :display-name "Host"
                                        :default      "localhost"}
                                       {:name         "port"
                                        :display-name "Port"
                                        :type         :integer
                                        :default      4300}])
          :can-connect?  can-connect
          :date-interval date-interval})
  sql/ISQLDriver CrateISQLDriverMixin)

(driver/register-driver! :crate (CrateDriver.))
