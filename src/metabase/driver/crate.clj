(ns metabase.driver.crate
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [honeysql.core :as hsql]
            [metabase.driver :as driver]
            (metabase.driver.crate [analyze :as analyze]
                                   [query-processor :as qp]
                                   [util :as crate-util])
            [metabase.driver.generic-sql :as sql]
            [metabase.util :as u]))

(def ^:private ^:const column->base-type
  "Map of Crate column types -> Field base types
   Crate data types -> https://crate.io/docs/reference/sql/data_types.html"
  {:integer         :IntegerField
   :string          :TextField
   :boolean         :BooleanField
   :byte            :IntegerField
   :short           :IntegerField
   :long            :BigIntegerField
   :float           :FloatField
   :double          :FloatField
   :ip              :UnknownField
   :timestamp       :DateTimeField
   :geo_shape       :DictionaryField
   :geo_point       :ArrayField
   :object          :DictionaryField
   :array           :ArrayField
   :object_array    :ArrayField
   :string_array    :ArrayField
   :integer_array   :ArrayField
   :float_array     :ArrayField
   :boolean_array   :ArrayField
   :byte_array      :ArrayField
   :timestamp_array :ArrayField
   :short_array     :ArrayField
   :long_array      :ArrayField
   :double_array    :ArrayField
   :ip_array        :ArrayField
   :geo_shape_array :ArrayField
   :geo_point_array :ArrayField})


(def ^:private ^:const now (hsql/call :current_timestamp 3))

(defn- crate-spec
  [{:keys [hosts]
    :or   {hosts "//localhost:4300"}
    :as   opts}]
  (merge {:classname   "io.crate.client.jdbc.CrateDriver" ; must be in classpath
          :subprotocol "crate"
          :subname     (str hosts)}
         (dissoc opts :hosts)))

(defn- can-connect? [details]
  (let [connection-spec (crate-spec details)]
    (= 1 (first (vals (first (jdbc/query connection-spec ["select 1 from sys.cluster"])))))))


(defrecord CrateDriver []
  clojure.lang.Named
  (getName [_] "Crate"))

(u/strict-extend CrateDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:analyze-table  analyze/analyze-table
          :can-connect?   (u/drop-first-arg can-connect?)
          :date-interval  crate-util/date-interval
          :details-fields (constantly [{:name         "hosts"
                                        :display-name "Hosts"
                                        :default      "//localhost:4300"}])
          :execute-query  qp/execute-query
          :features       (fn [this]
                            (set/difference (sql/features this)
                                            #{:foreign-keys}))})
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:connection-details->spec  (u/drop-first-arg crate-spec)
          :column->base-type         (u/drop-first-arg column->base-type)
          :string-length-fn          (constantly :char_length)
          :apply-filter              qp/apply-filter
          :date                      crate-util/date
          :unix-timestamp->timestamp crate-util/unix-timestamp->timestamp
          :current-datetime-fn       (constantly now)}))


(driver/register-driver! :crate (CrateDriver.))
