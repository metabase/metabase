(ns metabase.driver.crate
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.tools.logging :as log]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [util :as u]]
            [metabase.driver.crate.util :as crate-util]
            [metabase.driver.generic-sql :as sql]
            [metabase.util.i18n :refer [tru]])
  (:import java.sql.DatabaseMetaData))

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

(defn- connection-details->spec
  [{:keys [hosts]
    :as   details}]
  (merge {:classname   "io.crate.client.jdbc.CrateDriver" ; must be in classpath
          :subprotocol "crate"
          :subname     (str "//" hosts)
          :user        "crate"}
         (dissoc details :hosts)))

(defn- can-connect? [details]
  (let [connection-spec (connection-details->spec details)]
    (= 1 (first (vals (first (jdbc/query connection-spec ["select 1"])))))))

(defn- string-length-fn [field-key]
  (hsql/call :char_length field-key))

(defn- describe-table-fields
  [database _ {:keys [schema name]}]
  (let [columns (jdbc/query
                 (sql/db->jdbc-connection-spec database)
                 [(format "select column_name, data_type as type_name
                           from information_schema.columns
                           where table_name like '%s' and table_schema like '%s'
                           and data_type != 'object_array'" name schema)])] ; clojure jdbc can't handle fields of type "object_array" atm
    (set (for [{:keys [column_name type_name]} columns]
           {:name          column_name
            :custom        {:column-type type_name}
            :database-type type_name
            :base-type     (or (column->base-type (keyword type_name))
                               (do (log/warn (format "Don't know how to map column type '%s' to a Field base_type, falling back to :type/*." type_name))
                                   :type/*))}))))

(defn- add-table-pks
  [^DatabaseMetaData metadata, table]
  (let [pks (->> (.getPrimaryKeys metadata nil nil (:name table))
                 jdbc/result-set-seq
                 (mapv :column_name)
                 set)]
    (update table :fields (fn [fields]
                            (set (for [field fields]
                                   (if-not (contains? pks (:name field))
                                     field
                                     (assoc field :pk? true))))))))

(defn- describe-table [driver database table]
  (sql/with-metadata [metadata driver database]
    (->> (describe-table-fields database driver table)
         (assoc (select-keys table [:name :schema]) :fields)
         ;; find PKs and mark them
         (add-table-pks metadata))))

(defrecord CrateDriver []
  :load-ns true
  clojure.lang.Named
  (getName [_] "Crate"))

(def ^:private crate-date-formatters (driver/create-db-time-formatters "yyyy-MM-dd HH:mm:ss.SSSSSSZ"))
(def ^:private crate-db-time-query "select DATE_FORMAT(current_timestamp, '%Y-%m-%d %H:%i:%S.%fZ')")

(u/strict-extend CrateDriver
  driver/IDriver
  (merge (sql/IDriverSQLDefaultsMixin)
         {:can-connect?    (u/drop-first-arg can-connect?)
          :date-interval   crate-util/date-interval
          :describe-table  describe-table
          :details-fields  (constantly [{:name         "hosts"
                                         :display-name (tru "Hosts")
                                         :default      "localhost:5432/"}])
          :features        (comp (u/rpartial disj :foreign-keys) sql/features)
          :current-db-time (driver/make-current-db-time-fn crate-db-time-query crate-date-formatters)})
  sql/ISQLDriver
  (merge (sql/ISQLDriverDefaultsMixin)
         {:connection-details->spec  (u/drop-first-arg connection-details->spec)
          :column->base-type         (u/drop-first-arg column->base-type)
          :string-length-fn          (u/drop-first-arg string-length-fn)
          :date                      crate-util/date
          :quote-style               (constantly :crate)
          :field->alias              (constantly nil)
          :unix-timestamp->timestamp crate-util/unix-timestamp->timestamp
          :current-datetime-fn       (constantly now)}))

(defn -init-driver
  "Register the Crate driver"
  []
  (driver/register-driver! :crate (CrateDriver.)))
