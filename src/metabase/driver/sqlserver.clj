(ns metabase.driver.sqlserver
  (:require (korma [core :as k]
                   [db :as kdb])
            [korma.sql.utils :as utils]
            (metabase.driver [generic-sql :refer [sql-driver]]
                             [interface :refer [defdriver]]))
  (:import net.sourceforge.jtds.jdbc.Driver)) ; need to import this in order to load JDBC driver

(defn- connection-details->spec [details-map]
  (assoc (kdb/mssql details-map)
         :classname   "net.sourceforge.jtds.jdbc.Driver"
         :subprotocol "jtds:sqlserver"))

(def ^:private ^:const column->base-type
  "See [this page](https://msdn.microsoft.com/en-us/library/ms187752.aspx) for details."
  {:bigint           :BigIntegerField
   :binary           :UnknownField
   :bit              :UnknownField
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

(defdriver sqlserver
  (sql-driver {:driver-name               "SQL Server"
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
               :column->base-type         column->base-type
               :connection-details->spec  connection-details->spec
               :date                      date
               :date-interval             date-interval
               :unix-timestamp->timestamp unix-timestamp->timestamp}))

(defn x []
  (metabase.driver/process-query {:database 85
                                  :type :native
                                  :native {:query "SELECT COUNT(*) AS \"count\" FROM TABLES; GO"}}))

(defn y []
  (let [entity (metabase.driver.generic-sql.util/korma-entity (Database 85) {:name "sys.tables"})]
    (k/sql-only
     (k/select entity (k/limit 1)))))

(defn a []
  (let [entity (metabase.driver.generic-sql.util/korma-entity (Database 85) {:name "sys.tables"})]
    (k/sql-only
     (k/select entity
               (k/modifier "TOP 1")))))

(defn b []
  (let [entity (metabase.driver.generic-sql.util/korma-entity (Database 85) {:name "sys.tables"})]
    (k/select entity
              (k/modifier (utils/func :TOP 1)))))

(defn c []
  (-> (k/select* (metabase.driver.generic-sql.util/korma-entity (Database 85) {:name "sys.tables"}))
      (k/modifier (utils/func "TOP %s" [1]))))

(defn d []
  (k/exec (c)))

(defn e []
  (k/as-sql (c)))
