(ns metabase.driver.net
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.util.net :as u.net]
   [toucan2.core :as t2])
  (:import
   (java.sql Connection)
   (org.apache.calcite.adapter.jdbc JdbcSchema)
   (org.apache.calcite.jdbc CalciteConnection)
   (org.apache.calcite.schema SchemaPlus)
   (org.apache.commons.dbcp2 BasicDataSource)))

(set! *warn-on-reflection* true)

(driver/register! :net :parent :sql-jdbc)

(doseq [feature driver/features]
  (defmethod driver/database-supports? [:net feature] [_driver _feature _database] false))

(doseq [feature [:left-join
                 :right-join
                 :inner-join]]
  (defmethod driver/database-supports? [:net feature] [_driver _feature _database] true))

(comment
  (driver/database-supports? :net :left-join (t2/select-one :model/Database :id 5))
  (t2/select-one :model/Database :id 5)
  (t2/debug (t2/update! :model/Database :id 5 {:features [:left-join :right-join :inner-join]})))

;;TODO -- is this needed when can-connect? and do-with-connection-with-options are overridden?
;; probably not needed atm
(defmethod sql-jdbc.conn/connection-details->spec :net
  [_driver {:keys [db-ids] :as _details}]
  nil)

(defmethod driver/can-connect? :net
  [_driver details]
  ;; this assertion is necessary because of every
  (let [{:keys [db-ids]} (u.net/preprocess-details details)
        dbs (->> (t2/select :model/Database :id [:in db-ids])
                 (map u.net/preprocess-slave-db-details))]
    (and (pos-int? (count db-ids))
         (every? #(driver/can-connect? (:engine %) (:details %)) dbs))))
(comment
  (driver/can-connect? :net (:details (toucan2.core/select-one :model/Database :id [:= 5]))))

;; SYNC

(defmethod sql-jdbc.sync.interface/database-type->base-type :net
  [_driver database-type]
  ({:VARCHAR :type/Text}
   database-type))

(defmethod driver/dbms-version :net
  [& _args]
  nil #_"WIP")

(defmethod driver/db-default-timezone :net
  [& _args]
  "UTC")

;; TODO
(defmethod driver/describe-database :net
  [_driver _database]
  {:tables #{}})

(defmethod driver/describe-table :net
  [_driver]
  {:fields #{}})

(defmethod sql-jdbc.sync/describe-table-fields :net
  [_driver _conn _table _db-name-or-nil]
  #{})

;; TODO
(defmethod driver/db-default-timezone :net
  [_driver _database]
  "UTC")

(defmethod driver/table-rows-seq :net
  [_driver _database _table]
  ;; hopefully
  nil)

(comment
  ;; calcite connection -- OK
  (let [props (doto (java.util.Properties.)
                (.setProperty "lex" "JAVA"))]
    (with-open [conn (java.sql.DriverManager/getConnection "jdbc:calcite:" props)]
      (.isClosed conn)))
  ;; decorating the connection -- OK
  (let [props (doto (java.util.Properties.)
                (.setProperty "lex" "JAVA"))]
    (with-open [conn (java.sql.DriverManager/getConnection "jdbc:calcite:" props)]
      (doto (.isClosed conn) println)
      (let [calcite-conn (.unwrap conn CalciteConnection)
            root-schema (.getRootSchema calcite-conn)
            pg-ds (doto (BasicDataSource.)
                    (.setUrl "jdbc:postgresql://localhost:5432/postgres_db")
                    (.setUsername "metabase")
                    (.setPassword "password")
                    (.setDriverClassName "org.postgresql.Driver"))]
        (.add root-schema "POSTGRES" (JdbcSchema/create root-schema
                                                        "POSTGRES"
                                                        pg-ds
                                                        nil
                                                        "public"))
        (jdbc/query {:connection calcite-conn} ["SELECT c.customer_id FROM POSTGRES.customers c"]))))
  ;; query mysql/maria customers mysql_db -- OK
  (let [props (doto (java.util.Properties.)
                (.setProperty "lex" "JAVA"))]
    (with-open [conn (java.sql.DriverManager/getConnection "jdbc:calcite:" props)]
      (doto (.isClosed conn) println)
      (let [calcite-conn (.unwrap conn CalciteConnection)
            root-schema (.getRootSchema calcite-conn)
            mysql-ds (doto (BasicDataSource.)
                       (.setUrl "jdbc:mysql://localhost:3306/mysql_db")
                       (.setUsername "root")
                       (.setPassword "")
                       (.setDriverClassName "org.mariadb.jdbc.Driver"))]
        (.add root-schema "MYSQL" (JdbcSchema/create root-schema
                                                     "MYSQL"
                                                     mysql-ds
                                                     nil
                                                     "mysql_db"))
        #_(jdbc/query {:connection calcite-conn} ["SELECT v.name FROM POSTGRES.venues v limit 5"])
        (jdbc/query {:connection calcite-conn} ["SELECT o.total_amount FROM MYSQL.orders o"]))))
  ;; query mysql aka maria office-checkins
  (let [props (doto (java.util.Properties.)
                (.setProperty "lex" "JAVA"))]
    (with-open [conn (java.sql.DriverManager/getConnection "jdbc:calcite:" props)]
      (doto (.isClosed conn) println)
      (let [calcite-conn (.unwrap conn CalciteConnection)
            root-schema (.getRootSchema calcite-conn)
            mysql-ds (doto (BasicDataSource.)
                       (.setUrl "jdbc:mysql://localhost:3306/office-checkins")
                       (.setUsername "root")
                       (.setPassword "")
                       (.setDriverClassName "org.mariadb.jdbc.Driver"))]
        (.add root-schema "MYSQL" (JdbcSchema/create root-schema
                                                     "MYSQL"
                                                     mysql-ds
                                                     nil
                                                     "office-checkins"))
        #_(jdbc/query {:connection calcite-conn} ["SELECT v.name FROM POSTGRES.venues v limit 5"])
        #_(jdbc/query {:connection calcite-conn} ["SELECT o.person, CAST(o.`timestamp` as DATE) FROM MYSQL.checkins o"])
        #_(jdbc/query {:connection calcite-conn} ["SELECT o.person, CAST(o.`timestamp` as DATE) FROM MYSQL.checkins o"])

        (jdbc/query {:connection calcite-conn} ["SELECT * FROM MYSQL.checkins o"]))))

  (let [props (doto (java.util.Properties.)
                (.setProperty "lex" "JAVA"))]
    (with-open [conn (java.sql.DriverManager/getConnection "jdbc:calcite:" props)]
      (doto (.isClosed conn) println)
      (let [calcite-conn (.unwrap conn CalciteConnection)
            root-schema (.getRootSchema calcite-conn)
            pg-ds (doto (BasicDataSource.)
                    (.setUrl "jdbc:postgresql://localhost:5432/test-data")
                    (.setUsername "metabase")
                    (.setPassword "password")
                    (.setDriverClassName "org.postgresql.Driver"))]
        (.add root-schema "test-data (postgres)__2" (JdbcSchema/create root-schema
                                                                       "test-data (postgres)__2"
                                                                       pg-ds
                                                                       nil
                                                                       "public"))
        (jdbc/query {:connection calcite-conn} ["SELECT * FROM `test-data (postgres)__2`.orders c limit 1"])))))

(defn- link-databases-to-root-schema! [^SchemaPlus root-schema databases]
  (def ddd databases)
  (doseq [{:keys [engine details] :as slave-db} databases]
    (let [schema-name (u.net/schema-for-slave-db slave-db)]
      (case engine
        :postgres (.add root-schema schema-name (JdbcSchema/create root-schema
                                                                   schema-name
                                                                   (doto (BasicDataSource.)
                                                                     ;; https://jdbc.postgresql.org/documentation/use/#connecting-to-the-database
                                                                     (.setUrl (str "jdbc:postgresql:" (:db details)))
                                                                     (.setUsername "metabase")
                                                                     (.addConnectionProperty "password" (:password details))
                                                                     (.addConnectionProperty "host" (:host details))
                                                                     (.addConnectionProperty "port" (:port details))

                                                                     ;; we are using different connector but I think syntax will be the same
                                                                     ;; https://dev.mysql.com/doc/connector-j/en/connector-j-reference-jdbc-url-format.html
                                                                     #_(.addConnectionProperty "db" "test-data")
                                                                     #_(.setPassword "password")
                                                                     (.setDriverClassName "org.postgresql.Driver"))
                                                                   nil
                                                                   ;; TODO or schema public
                                                                   "public"))
        :mysql (.add root-schema schema-name (JdbcSchema/create root-schema
                                                                schema-name
                                                                (do (def de details)
                                                                    (doto (BasicDataSource.)
                                                                      (.setUrl (str "jdbc:mysql://" (:host details) ":" (:port details) "/" (:db details)))
                                                                      (.setUsername (:user details))
                                                                      (.setPassword (:password details ""))
                                                                      (.setDriverClassName "org.mariadb.jdbc.Driver")))
                                                                nil
                                                                (:db details) #_"office-checkins"))))))

;; TODO: I could ignore pooling for now
(defmethod sql-jdbc.execute/do-with-connection-with-options :net
  [_driver db-or-id-or-spec _options f]
  ;; here
  ;; 1 get connection calcite connection
  ;; 2 use details to "decorate" it
  ;; 3 profit
  (let [details (cond (pos-int? db-or-id-or-spec)
                      (:details (toucan2.core/select :model/Database :id db-or-id-or-spec))

                      ;; database
                      (and (map? db-or-id-or-spec) (contains? db-or-id-or-spec :id))
                      (:details db-or-id-or-spec)

                      :else
                      (throw (Exception. "Unsupported")))
        props (doto (java.util.Properties.)
                (.setProperty "lex" "JAVA"))
        _ (def dede details)
        ;; TODO fix mysql
        linked-dbs-ids #_[2] (mapv #(Long/parseLong %) (clojure.string/split (-> #_dede details :db-ids) #","))]
    (assert (not-empty linked-dbs-ids))
    (with-open [conn (java.sql.DriverManager/getConnection "jdbc:calcite:" props)]
      (doto (.isClosed conn) println)
      (let [calcite-conn ^CalciteConnection (.unwrap conn CalciteConnection)
            root-schema (.getRootSchema calcite-conn)]
        (link-databases-to-root-schema! root-schema (toucan2.core/select :model/Database :id [:in linked-dbs-ids]))
        (f calcite-conn)))))

;; TODO: read-column-thunk -- leaving this as sql-jdbc default for now

;; TODO: set-parameter -- not interesting for this POC

(defmethod sql-jdbc.execute/read-column-thunk [:net java.sql.Types/TIMESTAMP]
  [_ rs _ i]
  (fn []
    (def a (.isBeforeFirst rs))
    (def b (.isAfterLast rs))
    #_(.getObject rs i String)
    (.getTimestamp rs i)))

(defmethod sql-jdbc.execute/read-column-thunk [:net java.sql.Types/DATE]
  [_ rs _ i]
  (fn []
    (def a (.isBeforeFirst rs))
    (def b (.isAfterLast rs))
    #_(.getObject rs i String)
    (.getDate rs i)))

(defmethod sql.qp/quote-style :net [_] :mysql)