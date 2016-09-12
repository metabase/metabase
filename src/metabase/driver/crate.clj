(ns metabase.driver.crate
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.set :as set]
            [honeysql.core :as hsql]
            [metabase.driver :as driver]
            (metabase.driver.crate [query-processor :as qp]
                                   [util :as crate-util])
            [metabase.driver.generic-sql :as sql]
            [metabase.util :as u]))

(def ^:private ^:const column->base-type
  "Map of Crate column types -> Field base types
   Crate data types -> https://crate.io/docs/reference/sql/data_types.html"
  {:integer         :type/Integer
   :string          :type/Text
   :boolean         :type/Boolean
   :byte            :type/Integer
   :short           :type/Integer
   :long            :type/BigInteger
   :float           :type/Float
   :double          :type/Float
   :ip              :type/*
   :timestamp       :type/DateTime
   :geo_shape       :type/Dictionary
   :geo_point       :type/Array
   :object          :type/Dictionary
   :array           :type/Array
   :object_array    :type/Array
   :string_array    :type/Array
   :integer_array   :type/Array
   :float_array     :type/Array
   :boolean_array   :type/Array
   :byte_array      :type/Array
   :timestamp_array :type/Array
   :short_array     :type/Array
   :long_array      :type/Array
   :double_array    :type/Array
   :ip_array        :type/Array
   :geo_shape_array :type/Array
   :geo_point_array :type/Array})


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

(defn- string-length-fn [field-key]
  (hsql/call :char_length field-key))


(defrecord CrateDriver []
  clojure.lang.Named
  (getName [_] "Crate"))

(u/strict-extend CrateDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:can-connect?   (u/drop-first-arg can-connect?)
          :date-interval  crate-util/date-interval
          :details-fields (constantly [{:name         "hosts"
                                        :display-name "Hosts"
                                        :default      "//localhost:4300"}])
          :features       (comp (u/rpartial set/difference #{:foreign-keys}) sql/features)})
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:connection-details->spec  (u/drop-first-arg crate-spec)
          :column->base-type         (u/drop-first-arg column->base-type)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :apply-filter              qp/apply-filter
          :date                      crate-util/date
          :unix-timestamp->timestamp crate-util/unix-timestamp->timestamp
          :current-datetime-fn       (constantly now)}))


(driver/register-driver! :crate (CrateDriver.))
