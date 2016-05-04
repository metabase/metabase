(ns metabase.driver.crate
  (:require [metabase.driver :as driver]
            [metabase.driver.generic-sql :as sql]
            [clojure.set :as set]
            (korma [core :as k])
            (metabase.driver.crate [query-processor :as qp]
                                   [util :as u]
                                   [generic-sql :as gs]
                                   [native :as n]))
  (:import (clojure.lang Named)))

(defn- column->base-type
  "Map of Crate column types -> Field base types
  Crate data types -> https://crate.io/docs/reference/sql/data_types.html"
  [_ column-type]
  ({:integer          :IntegerField
    :string           :TextField
    :boolean          :BooleanField
    :byte             :IntegerField
    :short            :IntegerField
    :long             :BigIntegerField
    :float            :FloatField
    :double           :FloatField
    :ip               :UnknownField
    :timestamp        :DateTimeField
    :geo_shape        :DictionaryField
    :geo_point        :ArrayField
    :object           :DictionaryField
    :array            :ArrayField
    :object_array     :ArrayField
    :string_array     :ArrayField
    :integer_array    :ArrayField
    :float_array      :ArrayField
    :boolean_array    :ArrayField
    :byte_array       :ArrayField
    :timestamp_array  :ArrayField
    :short_array      :ArrayField
    :long_array       :ArrayField
    :double_array     :ArrayField
    :ip_array         :ArrayField
    :geo_shape_array  :ArrayField
    :geo_point_array  :ArrayField
    } column-type))


(def ^:private now (k/sqlfn :CURRENT_TIMESTAMP (k/raw 3)))

(defrecord CrateDriver []
  Named
  (getName [_] "Crate"))

(defn- crate-spec
  [{:keys [hosts]
    :or {hosts "//localhost:4300"}
    :as opts}]
  (merge {:classname "io.crate.client.jdbc.CrateDriver" ; must be in classpath
          :subprotocol "crate"
          :subname (str hosts)}
         (dissoc opts :hosts)))

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
          :apply-filter              qp/apply-filter
          :date                      u/date
          :unix-timestamp->timestamp u/unix-timestamp->timestamp
          :current-datetime-fn       (constantly now)}))

(extend CrateDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:details-fields (constantly [{:name         "hosts"
                                        :display-name "Hosts"
                                        :default      "//localhost:4300"}])
          :can-connect?   can-connect
          :date-interval  u/date-interval
          :analyze-table  gs/analyze-table
          :process-native n/process-and-run
          :features       (fn [this]
                            (set/difference (sql/features this)
                                            #{:foreign-keys}))})
  sql/ISQLDriver CrateISQLDriverMixin)

(driver/register-driver! :crate (CrateDriver.))
