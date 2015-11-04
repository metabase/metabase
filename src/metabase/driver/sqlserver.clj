(ns metabase.driver.sqlserver
  (:require (korma [core :as k]
                   [db :as kdb])
            [korma.sql.utils :as utils]
            [metabase.driver :refer [defdriver]]
            [metabase.driver.generic-sql :refer [sql-driver]])
  ;; (:import net.sourceforge.jtds.jdbc.Driver)
  ) ; need to import this in order to load JDBC driver

;; (defn- connection-details->spec [details-map]
;;   (assoc (kdb/mssql details-map)
;;          :classname   "net.sourceforge.jtds.jdbc.Driver"
;;          :subprotocol "jtds:sqlserver"))

(def ^:private ^:const column->base-type
  "See [this page](https://msdn.microsoft.com/en-us/library/ms187752.aspx) for details."
  {:bigint           :BigIntegerField
   :binary           :UnknownField
   :bit              :BooleanField     ; actually this is 1 / 0 instead of true / false ...
   :char             :CharField
   :cursor           :UnknownField
   :date             :DateField
   :datetime         :DateTimeField
   :datetime2        :DateTimeField
   :datetimeoffset   :TimeField
   :decimal          :DecimalField
   :float            :FloatField
   :geography        :UnknownField
   :geometry         :UnknownField
   :hierarchyid      :UnknownField
   :image            :UnknownField
   :int              :IntegerField
   :money            :DecimalField
   :nchar            :CharField
   :ntext            :TextField
   :numeric          :DecimalField
   :nvarchar         :TextField
   :real             :FloatField
   :smalldatetime    :DateTimeField
   :smallint         :IntegerField
   :smallmoney       :DecimalField
   :sql_variant      :UnknownField
   :table            :UnknownField
   :text             :TextField
   :time             :TimeField
   :timestamp        :UnknownField ; not a standard SQL timestamp, see https://msdn.microsoft.com/en-us/library/ms182776.aspx
   :tinyint          :IntegerField
   :uniqueidentifier :UUIDField
   :varbinary        :UnknownField
   :varchar          :TextField
   :xml              :UnknownField})

(defn- date [unit field-or-value])

(defn- date-interval [unit amount])

(defn- unix-timestamp->timestamp [field-or-value seconds-or-milliseconds])

(defn- apply-limit [korma-query {value :limit}]
  (k/modifier korma-query (format "TOP %d" value)))

(defdriver sqlserver
  (-> (sql-driver {:driver-name               "SQL Server"
                   :details-fields            [{:name         "host"
                                                :display-name "Host"
                                                :default "localhost"}
                                               {:name         "port"
                                                :display-name "Port"
                                                :type         :integer
                                                :default      1433}
                                               {:name         "dbname"
                                                :display-name "Database name"
                                                :placeholder  "birds_of_the_word"}
                                               {:name         "user"
                                                :display-name "Database username"
                                                :placeholder  "What username do you use to login to the database?"
                                                :required     true}
                                               {:name         "password"
                                                :display-name "Database password"
                                                :type         :password
                                                :placeholder  "*******"}]
                   :sql-string-length-fn      :LEN
                   ;; :ignored-schemas           #{"sys" "INFORMATION_SCHEMA"}
                   :column->base-type         column->base-type
                   :connection-details->spec  kdb/mssql ; connection-details->spec
                   :date                      date
                   :date-interval             date-interval
                   :unix-timestamp->timestamp unix-timestamp->timestamp})
      (assoc-in [:qp-clause->handler :limit] apply-limit)))

(defn x []
  (metabase.driver/process-query {:database 92
                                  :type :native
                                  :native {:query "SELECT TOP 2000 \"sys.TABLES\".* FROM \"sys\".\"TABLES\";"}}))

;; TODO - use schema information in query expander, Generic SQL QP
;; TODO - use schema information in other sync fns
