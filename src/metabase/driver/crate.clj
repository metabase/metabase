(ns metabase.driver.crate
  (:require [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [metabase.driver.generic-sql.query-processor :as qp]
            (korma [core :as k])
            [korma.sql.engine :as kengine]
            [korma.sql.fns :as kfns])
  (:import (clojure.lang Named)))

;; # Adapt generic SQL to Crate SQL

(defn- filter-subclause->predicate
  "Given a filter SUBCLAUSE, return a Korma filter predicate form for use in korma `where`."
  [{:keys [filter-type field value], :as filter}]
  {:pre [(map? filter) field]}
  (let [field (qp/formatted field)]
    {field (case          filter-type
             :between     ['between [(qp/formatted (:min-val filter)) (qp/formatted (:max-val filter))]]
             :starts-with ['like (qp/formatted (update value :value (fn [s] (str    s \%)))) ]
             :contains    ['like (qp/formatted (update value :value (fn [s] (str \% s \%))))]
             :ends-with   ['like (qp/formatted (update value :value (fn [s] (str \% s))))]
             :>           ['>    (qp/formatted value)]
             :<           ['<    (qp/formatted value)]
             :>=          ['>=   (qp/formatted value)]
             :<=          ['<=   (qp/formatted value)]
             :=           ['=    (qp/formatted value)]
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


(defn- column->base-type
  "Map of Postgres column types -> Field base types.
   Add more mappings here as you come across them."
  [_ column-type]
  ({:integer   :IntegerField
    :string    :TextField
    :boolean   :BooleanField
    :byte      :UnknownField
    :short     :UnknownField
    :long      :BigIntegerField
    :float     :FloatField
    :double    :FloatField
    :ip        :UnknownField
    :timestamp :DateTimeField
    :geo_point :UnknownField
    :geo_shape :UnknownField
    } column-type))

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
          :apply-filter              apply-filter}))

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
          :can-connect?  can-connect})
  sql/ISQLDriver CrateISQLDriverMixin)

(driver/register-driver! :crate (CrateDriver.))
