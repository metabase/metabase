(ns metabase.driver.oracle-test
  "Tests for specific behavior of the Oracle driver."
  (:require [clojure.java.jdbc :as jdbc]
            [expectations :refer [expect]]
            [honeysql.core :as hsql]
            [metabase
             [driver :as driver]
             [query-processor :as qp]
             [query-processor-test :as qp.test]
             [util :as u]]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models
             [field :refer [Field]]
             [table :refer [Table]]]
            [metabase.query-processor.test-util :as qp.test-util]
            [metabase.test
             [data :as data]
             [util :as tu]]
            [metabase.test.data
             [datasets :refer [expect-with-driver]]
             [oracle :as oracle.tx]
             [sql :as sql.tx]]
            [metabase.test.util.log :as tu.log]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.util.test :as tt]))

;; make sure we can connect with an SID
(expect
  {:classname                   "oracle.jdbc.OracleDriver"
   :subprotocol                 "oracle:thin"
   :subname                     "@localhost:1521:ORCL"
   :oracle.jdbc.J2EE13Compliant true}
  (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                   :port 1521
                                                   :sid  "ORCL"}))

;; no SID and not Service Name should throw an exception
(expect
  AssertionError
  (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                   :port 1521}))

(expect
  "You must specify the SID and/or the Service Name."
  (try (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                        :port 1521})
       (catch Throwable e
         (driver/humanize-connection-error-message :oracle (.getMessage e)))))

;; make sure you can specify a Service Name with no SID
(expect
  {:classname                   "oracle.jdbc.OracleDriver"
   :subprotocol                 "oracle:thin"
   :subname                     "@localhost:1521/MyCoolService"
   :oracle.jdbc.J2EE13Compliant true}
  (sql-jdbc.conn/connection-details->spec :oracle
    {:host         "localhost"
     :port         1521
     :service-name "MyCoolService"}))

;; make sure you can specify a Service Name and an SID
(expect
  {:classname                   "oracle.jdbc.OracleDriver"
   :subprotocol                 "oracle:thin"
   :subname                     "@localhost:1521:ORCL/MyCoolService"
   :oracle.jdbc.J2EE13Compliant true}
  (sql-jdbc.conn/connection-details->spec :oracle
    {:host         "localhost"
     :port         1521
     :service-name "MyCoolService"
     :sid          "ORCL"}))

(expect
  com.jcraft.jsch.JSchException
  (let [engine  :oracle
        details {:ssl            false
                 :password       "changeme"
                 :tunnel-host    "localhost"
                 :tunnel-pass    "BOGUS-BOGUS-BOGUS"
                 :port           12345
                 :service-name   "test"
                 :sid            "asdf"
                 :host           "localhost"
                 :tunnel-enabled true
                 :tunnel-port    22
                 :user           "postgres"
                 :tunnel-user    "example"}]
    (tu.log/suppress-output
      (driver/can-connect? :oracle details))))

(expect-with-driver :oracle
  "UTC"
  (tu/db-timezone-id))

(defn- do-with-temp-user [f]
  (let [username (tu/random-name)]
    (try
      (oracle.tx/create-user! username)
      (f username)
      (finally
        (oracle.tx/drop-user! username)))))

(defmacro ^:private with-temp-user
  "Run `body` with a temporary user bound, binding their name to `username-binding`. Use this to create the equivalent
  of temporary one-off databases."
  [[username-binding] & body]
  `(do-with-temp-user (fn [~username-binding] ~@body)))


;; Make sure Oracle CLOBs are returned as text (#9026)
(expect-with-driver :oracle
  [[1M "Hello"]
   [2M nil]]
  (let [details  (:details (data/db))
        spec     (sql-jdbc.conn/connection-details->spec :oracle details)
        execute! (fn [format-string & args]
                   (jdbc/execute! spec (apply format format-string args)))
        pk-type  (sql.tx/pk-sql-type :oracle)]
    (with-temp-user [username]
      (execute! "CREATE TABLE \"%s\".\"messages\" (\"id\" %s, \"message\" CLOB)"            username pk-type)
      (execute! "INSERT INTO \"%s\".\"messages\" (\"id\", \"message\") VALUES (1, 'Hello')" username)
      (execute! "INSERT INTO \"%s\".\"messages\" (\"id\", \"message\") VALUES (2, NULL)"    username)
      (tt/with-temp* [Table [table {:schema username, :name "messages", :db_id (data/id)}]
                      Field [_     {:table_id (u/get-id table), :name "id",      :base_type "type/Integer"}]
                      Field [_     {:table_id (u/get-id table), :name "message", :base_type "type/Text"}]]
        (qp.test/rows
          (qp/process-query
            {:database (data/id)
             :type     :query
             :query    {:source-table (u/get-id table)}}))))))

;; let's make sure we're actually attempting to generate the correctl HoneySQL for joins and source queries so we
;; don't sit around scratching our heads wondering why the queries themselves aren't working

(expect-with-driver :oracle
  {:select [:*]
   :from   [{:select
             [[(hx/identifier :field oracle.tx/session-schema "test_data_venues" "id")          (hx/identifier :field-alias "id")]
              [(hx/identifier :field oracle.tx/session-schema "test_data_venues" "name")        (hx/identifier :field-alias "name")]
              [(hx/identifier :field oracle.tx/session-schema "test_data_venues" "category_id") (hx/identifier :field-alias "category_id")]
              [(hx/identifier :field oracle.tx/session-schema "test_data_venues" "latitude")    (hx/identifier :field-alias "latitude")]
              [(hx/identifier :field oracle.tx/session-schema "test_data_venues" "longitude")   (hx/identifier :field-alias "longitude")]
              [(hx/identifier :field oracle.tx/session-schema "test_data_venues" "price")       (hx/identifier :field-alias "price")]]

             :from      [(hx/identifier :table oracle.tx/session-schema "test_data_venues")]
             :left-join [[(hx/identifier :table oracle.tx/session-schema "test_data_categories") (hx/identifier :table-alias "test_data_categories__via__cat")]
                         [:=
                          (hx/identifier :field oracle.tx/session-schema "test_data_venues" "category_id")
                          (hx/identifier :field "test_data_categories__via__cat" "id")]]
             :where     [:=
                         (hx/identifier :field "test_data_categories__via__cat" "name")
                         "BBQ"]
             :order-by  [[(hx/identifier :field oracle.tx/session-schema "test_data_venues" "id") :asc]]}]
   :where [:<= {:s "rownum"} 100]}
  (qp.test-util/with-everything-store
    (#'sql.qp/mbql->honeysql
     :oracle
     (data/mbql-query venues
       {:source-table $$venues
        :order-by     [[:asc $id]]
        :filter       [:=
                       [:joined-field "test_data_categories__via__cat" $categories.name]
                       [:value "BBQ" {:base_type :type/Text, :special_type :type/Name, :database_type "VARCHAR"}]]
        :fields       [$id $name $category_id $latitude $longitude $price]
        :limit        100
        :joins        [{:source-table $$categories
                        :alias        "test_data_categories__via__cat",
                        :strategy     :left-join
                        :condition    [:=
                                       $category_id
                                       [:joined-field "test_data_categories__via__cat" $categories.id]]
                        :fk-field-id  (data/id :venues :category_id)
                        :fields       :none}]}))))
