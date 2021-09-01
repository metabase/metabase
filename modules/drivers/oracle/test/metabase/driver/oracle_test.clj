(ns metabase.driver.oracle-test
  "Tests for specific behavior of the Oracle driver."
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [metabase.driver :as driver]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.driver.util :as driver.u]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.query-processor-test :as qp.test]
            [metabase.query-processor-test.order-by-test :as qp-test.order-by-test] ; used for one SSL connectivity test
            [metabase.test :as mt]
            [metabase.test.data.oracle :as oracle.tx]
            [metabase.test.data.sql :as sql.tx]
            [metabase.test.data.sql.ddl :as ddl]
            [metabase.test.util :as tu]
            [metabase.test.util.log :as tu.log]
            [metabase.util :as u]
            [metabase.util.honeysql-extensions :as hx]
            [toucan.util.test :as tt]))

(deftest connection-details->spec-test
  (doseq [[message expected-spec details]
          [["You should be able to connect with an SID"
            {:classname   "oracle.jdbc.OracleDriver"
             :subprotocol "oracle:thin"
             :subname     "@localhost:1521:ORCL"}
            {:host "localhost"
             :port 1521
             :sid  "ORCL"}]
           ["You should be able to specify a Service Name with no SID"
            {:classname   "oracle.jdbc.OracleDriver"
             :subprotocol "oracle:thin"
             :subname     "@localhost:1521/MyCoolService"}
            {:host         "localhost"
             :port         1521
             :service-name "MyCoolService"}]
           ["You should be able to specify a Service Name *and* an SID"
            {:classname   "oracle.jdbc.OracleDriver"
             :subprotocol "oracle:thin"
             :subname     "@localhost:1521:ORCL/MyCoolService"}
            {:host         "localhost"
             :port         1521
             :service-name "MyCoolService"
             :sid          "ORCL"}]
           ["You should be to specify SSL with a trust store"
            {:classname                         "oracle.jdbc.OracleDriver"
             :subprotocol                       "oracle:thin"
             :subname                           (str "@(DESCRIPTION=(ADDRESS=(PROTOCOL=tcps)(HOST=localhost)(PORT=1521)"
                                                     ")(CONNECT_DATA=(SID=ORCL)(SERVICE_NAME=MyCoolService)))")}
            {:host                    "localhost"
             :port                    1521
             :service-name            "MyCoolService"
             :sid                     "ORCL"
             :ssl                     true}]]]
    (is (= expected-spec
           (sql-jdbc.conn/connection-details->spec :oracle details))
        message)))

(deftest require-sid-or-service-name-test
  (testing "no SID and no Service Name should throw an exception"
    (is (thrown?
         AssertionError
         (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                          :port 1521})))
    (is (= "You must specify the SID and/or the Service Name."
           (try (sql-jdbc.conn/connection-details->spec :oracle {:host "localhost"
                                                                 :port 1521})
                (catch Throwable e
                  (driver/humanize-connection-error-message :oracle (.getMessage e))))))))

(deftest test-ssh-connection
  (testing "Gets an error when it can't connect to oracle via ssh tunnel"
    (mt/test-driver :oracle
      (is (thrown?
           java.net.ConnectException
           (try
             (let [engine :oracle
                   details {:ssl            false
                            :password       "changeme"
                            :tunnel-host    "localhost"
                            :tunnel-pass    "BOGUS-BOGUS"
                            :port           5432
                            :dbname         "test"
                            :host           "localhost"
                            :tunnel-enabled true
                            ;; we want to use a bogus port here on purpose -
                            ;; so that locally, it gets a ConnectionRefused,
                            ;; and in CI it does too. Apache's SSHD library
                            ;; doesn't wrap every exception in an SshdException
                            :tunnel-port    21212
                            :tunnel-user    "bogus"}]
               (tu.log/suppress-output
                (driver.u/can-connect-with-details? engine details :throw-exceptions)))
             (catch Throwable e
               (loop [^Throwable e e]
                 (or (when (instance? java.net.ConnectException e)
                       (throw e))
                     (some-> (.getCause e) recur))))))))))

(deftest timezone-id-test
  (mt/test-driver :oracle
    (is (= "UTC"
           (tu/db-timezone-id)))))

(deftest insert-rows-ddl-test
  (is (= [[(str "INSERT ALL"
                " INTO \"my_db\".\"my_table\" (\"col1\", \"col2\") VALUES (?, 1)"
                " INTO \"my_db\".\"my_table\" (\"col1\", \"col2\") VALUES (?, 2) "
                "SELECT * FROM dual")
           "A"
           "B"]]
         (ddl/insert-rows-ddl-statements :oracle (hx/identifier :table "my_db" "my_table") [{:col1 "A", :col2 1}
                                                                                            {:col1 "B", :col2 2}]))
      "Make sure we're generating correct DDL for Oracle to insert all rows at once."))

(defn- do-with-temp-user [username f]
  (let [username (or username (tu/random-name))]
    (try
      (oracle.tx/create-user! username)
      (f username)
      (finally
        (oracle.tx/drop-user! username)))))

(defmacro ^:private with-temp-user
  "Run `body` with a temporary user bound, binding their name to `username-binding`. Use this to create the equivalent
  of temporary one-off databases. A particular username can be passed in as the binding or else one is generated with
  `tu/random-name`."
  [[username-binding & [username]] & body]
  `(do-with-temp-user ~username (fn [~username-binding] ~@body)))


(deftest return-clobs-as-text-test
  (mt/test-driver :oracle
    (testing "Make sure Oracle CLOBs are returned as text (#9026)"
      (let [details  (:details (mt/db))
            spec     (sql-jdbc.conn/connection-details->spec :oracle details)
            execute! (fn [format-string & args]
                       (jdbc/execute! spec (apply format format-string args)))
            pk-type  (sql.tx/pk-sql-type :oracle)]
        (with-temp-user [username]
          (execute! "CREATE TABLE \"%s\".\"messages\" (\"id\" %s, \"message\" CLOB)"            username pk-type)
          (execute! "INSERT INTO \"%s\".\"messages\" (\"id\", \"message\") VALUES (1, 'Hello')" username)
          (execute! "INSERT INTO \"%s\".\"messages\" (\"id\", \"message\") VALUES (2, NULL)"    username)
          (tt/with-temp* [Table [table    {:schema username, :name "messages", :db_id (mt/id)}]
                          Field [id-field {:table_id (u/the-id table), :name "id", :base_type "type/Integer"}]
                          Field [_        {:table_id (u/the-id table), :name "message", :base_type "type/Text"}]]
            (is (= [[1M "Hello"]
                    [2M nil]]
                   (qp.test/rows
                     (qp/process-query
                      {:database (mt/id)
                       :type     :query
                       :query    {:source-table (u/the-id table)
                                  :order-by     [[:asc [:field (u/the-id id-field) nil]]]}}))))))))))

(deftest handle-slashes-test
  (mt/test-driver :oracle
    (let [details  (:details (mt/db))
          spec     (sql-jdbc.conn/connection-details->spec :oracle details)
          execute! (fn [format-string & args]
                     (jdbc/execute! spec (apply format format-string args)))
          pk-type  (sql.tx/pk-sql-type :oracle)
          schema   (str (tu/random-name) "/")]
      (with-temp-user [username schema]
        (execute! "CREATE TABLE \"%s\".\"mess/ages/\" (\"id\" %s, \"column1\" varchar(200))" username pk-type)
        (testing "Sync can handle slashes in the schema and tablenames"
          (is (= #{"id" "column1"}
                 (into #{}
                       (map :name)
                       (:fields
                        (sql-jdbc.sync/describe-table :oracle spec {:name "mess/ages/" :schema username}))))))))))

;; let's make sure we're actually attempting to generate the correctl HoneySQL for joins and source queries so we
;; don't sit around scratching our heads wondering why the queries themselves aren't working
(deftest honeysql-test
  (mt/test-driver :oracle
    (testing "Correct HoneySQL form should be generated"
      (mt/with-everything-store
        (is (= (letfn [(id
                         ([field-name database-type]
                          (id oracle.tx/session-schema "test_data_venues" field-name database-type))
                         ([table-name field-name database-type]
                          (id nil table-name field-name database-type))
                         ([schema-name table-name field-name database-type]
                          (-> (hx/identifier :field schema-name table-name field-name)
                              (hx/with-database-type-info database-type))))]
                 {:select [:*]
                  :from   [{:select
                            [[(id "id" "number")
                              (hx/identifier :field-alias "id")]
                             [(id "name" "varchar2")
                              (hx/identifier :field-alias "name")]
                             [(id "category_id" "number")
                              (hx/identifier :field-alias "category_id")]
                             [(id "latitude" "binary_float")
                              (hx/identifier :field-alias "latitude")]
                             [(id "longitude" "binary_float")
                              (hx/identifier :field-alias "longitude")]
                             [(id "price" "number")
                              (hx/identifier :field-alias "price")]]
                            :from      [(hx/identifier :table oracle.tx/session-schema "test_data_venues")]
                            :left-join [[(hx/identifier :table oracle.tx/session-schema "test_data_categories")
                                         (hx/identifier :table-alias "test_data_categories__via__cat")]
                                        [:=
                                         (id "category_id" "number")
                                         (id "test_data_categories__via__cat" "id" "number")]]
                            :where     [:=
                                        (id "test_data_categories__via__cat" "name" "varchar2")
                                        "BBQ"]
                            :order-by  [[(id "id" "number") :asc]]}]
                  :where  [:<= (hsql/raw "rownum") 100]})
               (#'sql.qp/mbql->honeysql
                :oracle
                (qp/query->preprocessed
                 (mt/mbql-query venues
                   {:source-table $$venues
                    :order-by     [[:asc $id]]
                    :filter       [:=
                                   &test_data_categories__via__cat.categories.name
                                   [:value "BBQ" {:base_type :type/Text, :semantic_type :type/Name, :database_type "VARCHAR"}]]
                    :fields       [$id $name $category_id $latitude $longitude $price]
                    :limit        100
                    :joins        [{:source-table $$categories
                                    :alias        "test_data_categories__via__cat"
                                    :strategy     :left-join
                                    :condition    [:=
                                                   $category_id
                                                   &test_data_categories__via__cat.categories.id]
                                    :fk-field-id  (mt/id :venues :category_id)
                                    :fields       :none}]})))))))))

(deftest oracle-connect-with-ssl-test
  (mt/test-driver :oracle
    (if (System/getenv "MB_ORACLE_SSL_TEST_SSL")
      (testing "Oracle with SSL connectivity"
        (mt/with-env-keys-renamed-by #(str/replace-first % "mb-oracle-ssl-test" "mb-oracle-test")
          (qp-test.order-by-test/order-by-aggregate-fields-test)))
      (println (u/format-color 'yellow
                               "Skipping %s because %s env var is not set"
                               "oracle-connect-with-ssl-test"
                               "MB_ORACLE_SSL_TEST_SSL")))))

(deftest text-equals-empty-string-test
  (mt/test-driver :oracle
    (testing ":= with empty string should work correctly (#13158)"
      (mt/dataset airports
        (is (= [1M]
               (mt/first-row
                (mt/run-mbql-query airport {:aggregation [:count], :filter [:= $code ""]}))))))))
