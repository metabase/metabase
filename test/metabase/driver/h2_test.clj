(ns metabase.driver.h2-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.actions.error :as actions.error]
   [metabase.config :as config]
   [metabase.core :as mbc]
   [metabase.db :as mdb]
   [metabase.driver :as driver]
   [metabase.driver.h2 :as h2]
   [metabase.driver.h2.actions :as h2.actions]
   [metabase.driver.sql-jdbc.actions :as sql-jdbc.actions]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models :refer [Database]]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.test :as mt]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp]))

(set! *warn-on-reflection* true)

(deftest ^:parallel parse-connection-string-test
  (testing "Check that the functions for exploding a connection string's options work as expected"
    (is (= ["file:my-file" {"OPTION_1" "TRUE", "OPTION_2" "100", "LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON" "NICE_TRY"}]
           (#'h2/connection-string->file+options "file:my-file;OPTION_1=TRUE;OPTION_2=100;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY")))))

(deftest ^:parallel build-connection-string-test
  (testing "Check that we can build connection string out of parsed results"
    (is (= "file:my-file;OPTION_1=TRUE;OPTION_2=100;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY"
           (#'h2/file+options->connection-string "file:my-file" {"OPTION_1" "TRUE", "OPTION_2" "100", "LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON" "NICE_TRY"})))))

(deftest ^:parallel set-safe-options-test
  (testing "Check that we add safe connection options to connection strings"
    (is (= "file:my-file;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=TRUE"
           (#'h2/connection-string-set-safe-options "file:my-file;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY"))))

  (testing "Check that we override shady connection string options set by shady admins with safe ones"
    (is (= "file:my-file;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=TRUE"
           (#'h2/connection-string-set-safe-options "file:my-file;;LOOK_I_INCLUDED_AN_EXTRA_SEMICOLON=NICE_TRY;IFEXISTS=FALSE;"))))

  (testing "Check that we override the INIT connection string option"
    (is (= "file:my-file;IFEXISTS=TRUE"
           (#'h2/connection-string-set-safe-options "file:my-file;INIT=ANYTHING_HERE_WILL_BE_IGNORED")))))

(deftest ^:parallel db-details->user-test
  (testing "make sure we return the USER from db details if it is a keyword key in details..."
    (is (= "cam"
           (#'h2/db-details->user {:db "file:my_db.db", :USER "cam"}))))

  (testing "or a string key..."
    (is (= "cam"
           (#'h2/db-details->user {:db "file:my_db.db", "USER" "cam"}))))

  (testing "or part of the `db` connection string itself"
    (is (= "cam"
           (#'h2/db-details->user {:db "file:my_db.db;USER=cam"})))))

(deftest ^:parallel only-connect-to-existing-dbs-test
  (testing "Make sure we *cannot* connect to a non-existent database by default"
    (binding [h2/*allow-testing-h2-connections* true]
      (is (thrown-with-msg?
           org.h2.jdbc.JdbcSQLNonTransientConnectionException
           #"Database .+ not found, .+"
           (driver/can-connect? :h2 {:db (str (System/getProperty "user.dir") "/toucan_sightings")}))))))

(deftest ^:parallel only-connect-when-non-malicious-properties
  (testing "Reject connection strings with malicious properties"
    (let [conn-str (str "jdbc:h2:file:"
                        (System/getProperty "user.dir")
                        "/toucan_sightings.db"
                        ";TRACE_LEVEL_SYSTEM_OUT=1\\;CREATE TRIGGER IAMPWNED BEFORE SELECT ON INFORMATION_SCHEMA.TABLES AS $$//javascript\nnew java.net.URL('http://localhost:3000/api/health').openConnection().getContentLength()\n$$--=x\\;")
          result (try (binding [h2/*allow-testing-h2-connections* true]
                        (driver/can-connect? :h2 {:db conn-str}))
                      ::did-not-throw
                      (catch Exception e e))]
      (is (instance? clojure.lang.ExceptionInfo result))
      (is (partial= {:cause "Malicious keys detected"
                     :data {:keys ["TRACE_LEVEL_SYSTEM_OUT"]}}
                    (Throwable->map result)))))
  (testing "Reject connection details which lie about their driver"
    (let [conn "mem:fake-h2-db"
          f (fn f [details]
              (try (driver/can-connect? :postgres details)
                   ::did-not-throw
                   (catch Exception e e)))]
      (testing "connection-uri"
        (let [result (f {:connection-uri conn})]
          (is (= "Cannot specify subname, protocol, or connection-uri in details map"
                 (ex-message result)))
          (is (= {:invalid-keys #{"connection-uri"}} (ex-data result)))))
      (testing "subprotocol"
        (let [result (f {:db conn, :subprotocol "h2"})]
          (is (= "Cannot specify subname, protocol, or connection-uri in details map"
                 (ex-message result)))
          (is (= {:invalid-keys #{"subprotocol"}} (ex-data result)))))
      (testing "subprotocol"
        (let [result (f {:db conn, :classname "org.h2.Driver"})]
          (is (= "Cannot specify subname, protocol, or connection-uri in details map"
                 (ex-message result)))
          (is (= {:invalid-keys #{"classname"}} (ex-data result))))))))

(deftest ^:parallel db-default-timezone-test
  (mt/test-driver :h2
    (is (= (t/zone-id "Z")
           (-> (driver/db-default-timezone :h2 (mt/db))
               t/zone-id
               .normalized)))))

(deftest disallow-admin-accounts-test
  (testing "Check that we're not allowed to run SQL against an H2 database with a non-admin account"
    (t2.with-temp/with-temp [Database db {:name "Fake-H2-DB", :engine "h2", :details {:db "mem:fake-h2-db"}}]
      (is (thrown-with-msg?
           clojure.lang.ExceptionInfo
           #"Running SQL queries against H2 databases using the default \(admin\) database user is forbidden\.$"
           (qp/process-query {:database (:id db)
                              :type     :native
                              :native   {:query "SELECT 1"}}))))))

(deftest ^:parallel add-interval-honeysql-form-test
  (testing "Should convert fractional seconds to milliseconds"
    (is (= (h2x/with-database-type-info
            [:dateadd
             (h2x/literal "millisecond")
             [:inline 100500]
             (h2x/with-database-type-info :%now "timestamp")]
            "timestamp")
           (sql.qp/add-interval-honeysql-form :h2 (sql.qp/current-datetime-honeysql-form :h2) 100.5 :second)))))

(deftest ^:parallel add-interval-honeysql-form-test-2
  (testing "Non-fractional seconds should remain seconds, but be cast to longs"
    (is (= (h2x/with-database-type-info
            [:dateadd
             (h2x/literal "second")
             [:inline 100]
             (h2x/with-database-type-info :%now "timestamp")]
            "timestamp")
           (sql.qp/add-interval-honeysql-form :h2 (sql.qp/current-datetime-honeysql-form :h2) 100.0 :second)))))

(deftest ^:parallel clob-test
  (mt/test-driver :h2
    (testing "Make sure we properly handle rows that come back as `org.h2.jdbc.JdbcClob`"
      (let [results (qp/process-query (mt/native-query {:query "SELECT cast('Conchúr Tihomir' AS clob) AS name;"}))]
        (testing "rows"
          (is (= [["Conchúr Tihomir"]]
                 (mt/rows results))))
        (testing "cols"
          (is (= [{:display_name "NAME"
                   :base_type    :type/Text
                   :effective_type :type/Text
                   :source       :native
                   :field_ref    [:field "NAME" {:base-type :type/Text}]
                   :name         "NAME"}]
                 (mt/cols results))))))))

(deftest ^:parallel native-query-date-trunc-test
  (mt/test-driver :h2
    (testing "A native query that doesn't return a column class name metadata should work correctly (#12150)"
      (is (= [{:display_name "D"
               :base_type    :type/Date
               :effective_type :type/Date
               :source       :native
               :field_ref    [:field "D" {:base-type :type/Date}]
               :name         "D"}]
             (mt/cols (qp/process-query (mt/native-query {:query "SELECT date_trunc('day', DATE) AS D FROM CHECKINS LIMIT 5;"}))))))))

(deftest ^:parallel timestamp-with-timezone-test
  (testing "Make sure TIMESTAMP WITH TIME ZONEs come back as OffsetDateTimes."
    (is (= [{:t #t "2020-05-28T18:06-07:00"}]
           (jdbc/query (mdb/spec :h2 {:db "mem:test_db"})
                       "SELECT TIMESTAMP WITH TIME ZONE '2020-05-28 18:06:00.000 America/Los_Angeles' AS t")))))

(deftest ^:parallel native-query-parameters-test
  (testing "Native query parameters should work with filters."
    (is (= [[693 "2015-12-29T00:00:00Z" 10 90]]
           (mt/rows
             (qp/process-query
              {:database   (mt/id)
               :type       :native
               :native     {:query         "select * from checkins where {{date}} order by date desc limit 1;"
                            :template-tags {"date" {:name         "date"
                                                    :display-name "date"
                                                    :type         :dimension
                                                    :widget-type  :date/all-options
                                                    :dimension    [:field (mt/id :checkins :date) nil]}}}
               :parameters [{:type :date/all-options
                             :target [:dimension [:template-tag "date"]]
                             :value "past30years"}]}))))))

(defn- pretty-sql [s]
  (-> s
      (str/replace #"\"" "")
      (str/replace #"PUBLIC\." "")))

(deftest ^:parallel do-not-cast-to-date-if-column-is-already-a-date-test
  (mt/test-driver :h2
    (testing "Don't wrap Field in date() if it's already a DATE (#11502)"
      (mt/dataset attempted-murders
        (let [query (mt/mbql-query attempts
                      {:aggregation [[:count]]
                       :breakout    [!day.date]})]
          (is (= (str "SELECT ATTEMPTS.DATE AS DATE, COUNT(*) AS count "
                      "FROM ATTEMPTS "
                      "GROUP BY ATTEMPTS.DATE "
                      "ORDER BY ATTEMPTS.DATE ASC")
                 (some-> (qp.compile/compile query) :query pretty-sql))))))))

(deftest ^:parallel check-action-commands-test
  (mt/test-driver :h2
    (are [query] (= true (#'h2/every-command-allowed-for-actions? (#'h2/classify-query (u/the-id (mt/db)) query)))
      "select 1"
      "update venues set name = 'bill'"
      "delete venues"
      "select 1;
       update venues set name = 'bill';
       delete venues;"
      "update venues set name = 'stomp';"
      "select * from venues; update venues set name = 'stomp';"
      "update venues set name = 'stomp'; select * from venues;"
      "truncate table venues"
      "insert into venues values (1, 'Chicken Chow')"
      "merge into venues key(1) values (1, 'Chicken Chow')"
      "merge into venues using (select 1 as id) as source on (venues.id = source.id) when matched then update set name = 'Chicken Chow';"
      "create table venues (id int, name varchar(255))"
      "drop table venues"
      "update venues set name = 'bill'"
      "insert into venues (name) values ('bill')"
      "create table venues"
      "alter table venues add column address varchar(255)")

    (are [query] (= false (#'h2/every-command-allowed-for-actions? (#'h2/classify-query (u/the-id (mt/db)) query)))
      "select * from venues; update venues set name = 'stomp';
       CREATE ALIAS EXEC AS 'String shellexec(String cmd) throws java.io.IOException {Runtime.getRuntime().exec(cmd);return \"y4tacker\";}';
       EXEC ('open -a Calculator.app')"
      "select * from venues; update venues set name = 'stomp';
       CREATE ALIAS EXEC AS 'String shellexec(String cmd) throws java.io.IOException {Runtime.getRuntime().exec(cmd);return \"y4tacker\";}';"
      "CREATE ALIAS EXEC AS 'String shellexec(String cmd) throws java.io.IOException {Runtime.getRuntime().exec(cmd);return \"y4tacker\";}';")

    (is (= nil (#'h2/check-action-commands-allowed {:database (u/the-id (mt/db)) :native {:query nil}})))

    (is (= nil (#'h2/check-action-commands-allowed
                {:database (u/the-id (mt/db))
                 :engine :h2
                 :native {:query (str/join "; "
                                           ["select 1"
                                            "update venues set name = 'bill'"
                                            "delete venues"])}})))
    (let [trigger-creation-attempt (str/join "\n" ["DROP TRIGGER IF EXISTS MY_SPECIAL_TRIG;"
                                                   "CREATE OR REPLACE TRIGGER MY_SPECIAL_TRIG BEFORE SELECT ON INFORMATION_SCHEMA.Users AS '';"
                                                   "SELECT * FROM INFORMATION_SCHEMA.Users;"])]
      (is (thrown? clojure.lang.ExceptionInfo
                   #"DDL commands are not allowed to be used with h2."
                   (#'h2/check-action-commands-allowed
                    {:database (u/the-id (mt/db))
                     :engine :h2
                     :native {:query trigger-creation-attempt}}))))))

(deftest ^:parallel check-read-only-test
  (testing "read only statements should pass"
    (are [query] (nil?
                  (#'h2/check-read-only-statements
                   {:database (u/the-id (mt/db))
                    :engine :h2
                    :native {:query query}}))
      "select * from orders"
      "select 1; select 2;"
      "explain select * from orders"
      "values (1, 'Hello'), (2, 'World');"
      "show tables"
      "table orders"
      "call 1 + 1"
      ;; Note this passes the check, but will fail on execution
      "update venues set name = 'bill'; some query that can't be parsed;"))
  (testing "not read only statements should fail"
    (are [query] (thrown?
                  clojure.lang.ExceptionInfo
                  #"Only SELECT statements are allowed in a native query."
                  (#'h2/check-read-only-statements
                   {:database (u/the-id (mt/db))
                    :engine :h2
                    :native {:query query}}))
      "update venues set name = 'bill'"
      "insert into venues (name) values ('bill')"
      "delete venues"
      "select 1; update venues set name = 'bill'; delete venues;"
      (str/join "\n" ["DROP TRIGGER IF EXISTS MY_SPECIAL_TRIG;"
                        "CREATE OR REPLACE TRIGGER MY_SPECIAL_TRIG BEFORE SELECT ON INFORMATION_SCHEMA.Users AS '';"
                        "SELECT * FROM INFORMATION_SCHEMA.Users;"]))))

(deftest disallowed-commands-in-action-test
  (mt/test-driver :h2
    (mt/with-actions-test-data-and-actions-enabled
      (testing "Should not be able to execute query actions with disallowed commands"
        (let [sql "select * from categories; update categories set name = 'stomp';
                 CREATE ALIAS EXEC AS 'String shellexec(String cmd) throws java.io.IOException {Runtime.getRuntime().exec(cmd);return \"y4tacker\";}';
                 EXEC ('open -a Calculator.app')"]
          (mt/with-actions [{:keys [action-id]} {:type :query
                                                 :dataset_query {:database (mt/id)
                                                                 :type     "native"
                                                                 :native   {:query sql}}}]
            (is (=? {:message "Error executing Action: DDL commands are not allowed to be used with H2."}
                    (mt/user-http-request :crowberto
                                          :post 500
                                          (format "action/%s/execute" action-id)))))))
      (testing "Should be able to execute query actions with allowed commands"
        (let [sql "update categories set name = 'stomp' where id = 1; update categories set name = 'stomp' where id = 2;"]
          (mt/with-actions [{:keys [action-id]} {:type :query
                                                 :dataset_query {:database (mt/id)
                                                                 :type     "native"
                                                                 :native   {:query sql}}}]
            (is (=? {:rows-affected 1}
                    (mt/user-http-request :crowberto
                                          :post 200
                                          (format "action/%s/execute" action-id))))))))))

(deftest ^:parallel syncable-schemas-test
  (mt/test-driver :h2
    (testing "`syncable-schemas` should return schemas that should be synced"
      (mt/with-empty-db
        (is (= #{"PUBLIC"}
               (driver/syncable-schemas driver/*driver* (mt/db))))))))

(deftest syncable-audit-db-test
  (mt/test-driver :h2
    (when config/ee-available?
      (let [audit-db-expected-id 13371337
            original-audit-db    (t2/select-one 'Database :is_audit true)]
        (is (not= ::mbc/noop (mbc/ensure-audit-db-installed!))
            "Make sure we call the right ensure-audit-db-installed! impl")
        (try
          (testing "spec obtained from audit db has no connection string, and that works OK."
            (let [audit-db-id (t2/select-one-fn :id 'Database :is_audit true)]
              (is (= audit-db-expected-id audit-db-id))
              (let [audit-db-pooled-spec (sql-jdbc.conn/db->pooled-connection-spec audit-db-id)]
                (is (= "com.mchange.v2.c3p0.PoolBackedDataSource" (pr-str (type (:datasource audit-db-pooled-spec)))))
                (let [spec (sql-jdbc.conn/connection-details->spec :h2 audit-db-pooled-spec)]
                  (is (= #{:classname :subprotocol :subname :datasource}
                         (set (keys spec))))))))
          (finally
            (t2/delete! Database :is_audit true)
            (when original-audit-db (mbc/ensure-audit-db-installed!))))))))

;; API tests are in [[metabase.api.action-test]]
(deftest ^:parallel actions-maybe-parse-sql-error-test
  (testing "violate not null constraint"
    (is (= {:type    :metabase.actions.error/violate-not-null-constraint
            :message "Ranking must have values."
            :errors  {"RANKING" "You must provide a value."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :h2 actions.error/violate-not-null-constraint nil :row/created
            "NULL not allowed for column \"RANKING\"; SQL statement:\nINSERT INTO \"PUBLIC\".\"GROUP\" (\"NAME\") VALUES (CAST(? AS VARCHAR)) [23502-214])")))))

(deftest actions-maybe-parse-sql-error-test-2
  (testing "violate unique constraint"
    (is (= {:type :metabase.actions.error/violate-unique-constraint,
            :message "Ranking already exists.",
            :errors {"RANKING" "This Ranking value already exists."}}
           (with-redefs [h2.actions/constraint->column-names (fn [& _args]
                                                               ["RANKING"])]
             (sql-jdbc.actions/maybe-parse-sql-error
              :h2 actions.error/violate-unique-constraint nil nil
              "Unique index or primary key violation: \"PUBLIC.CONSTRAINT_INDEX_4 ON PUBLIC.\"\"GROUP\"\"(RANKING NULLS FIRST) VALUES ( /* 1 */ 1 )\"; SQL statement:\nINSERT INTO \"PUBLIC\".\"GROUP\" (\"NAME\", \"RANKING\") VALUES (CAST(? AS VARCHAR), CAST(? AS INTEGER)) [23505-214]"))))))

(deftest ^:parallel actions-maybe-parse-sql-error-test-3
  (testing "incorrect type"
    (is (= {:type :metabase.actions.error/incorrect-value-type,
            :message "Some of your values aren’t of the correct type for the database.",
            :errors {}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :h2 actions.error/incorrect-value-type nil nil
            "Data conversion error converting \"S\"; SQL statement:\nUPDATE \"PUBLIC\".\"GROUP\" SET \"RANKING\" = CAST(? AS INTEGER) WHERE \"PUBLIC\".\"GROUP\".\"ID\" = 1 [22018-214]")))))

(deftest ^:parallel actions-maybe-parse-sql-error-test-4
  (testing "violate fk constraints"
    (is (= {:type :metabase.actions.error/violate-foreign-key-constraint,
            :message "Other tables rely on this row so it cannot be deleted.",
            :errors {}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :h2 actions.error/violate-foreign-key-constraint {:id 1} :row/delete
            "Referential integrity constraint violation: \"CONSTRAINT_54: PUBLIC.INVOICES FOREIGN KEY(ACCOUNT_ID) REFERENCES PUBLIC.ACCOUNTS(ID) (CAST(1 AS BIGINT))\"; SQL statement:\nDELETE  FROM \"PUBLIC\".\"ACCOUNTS\" WHERE \"PUBLIC\".\"ACCOUNTS\".\"ID\" = 1 [23503-214]")))))

(deftest ^:parallel actions-maybe-parse-sql-error-test-5
  (testing "violate fk constraints"
    (is (= {:type :metabase.actions.error/violate-foreign-key-constraint,
            :message "Unable to create a new record.",
            :errors {"GROUP-ID" "This Group-id does not exist."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :h2 actions.error/violate-foreign-key-constraint {:id 1} :row/create
            "Referential integrity constraint violation: \"USER_GROUP-ID_GROUP_-159406530: PUBLIC.\"\"USER\"\" FOREIGN KEY(\"\"GROUP-ID\"\") REFERENCES PUBLIC.\"\"GROUP\"\"(ID) (CAST(999 AS BIGINT))\"; SQL statement:\nINSERT INTO \"PUBLIC\".\"USER\" (\"NAME\", \"GROUP-ID\") VALUES (CAST(? AS VARCHAR), CAST(? AS INTEGER)) [23506-214]")))))

(deftest ^:parallel actions-maybe-parse-sql-error-test-6
  (testing "violate fk constraints"
    (is (= {:type :metabase.actions.error/violate-foreign-key-constraint,
            :message "Unable to update the record.",
            :errors {"GROUP-ID" "This Group-id does not exist."}}
           (sql-jdbc.actions/maybe-parse-sql-error
            :h2 actions.error/violate-foreign-key-constraint {:id 1} :row/update
            "Referential integrity constraint violation: \"USER_GROUP-ID_GROUP_-159406530: PUBLIC.\"\"USER\"\" FOREIGN KEY(\"\"GROUP-ID\"\") REFERENCES PUBLIC.\"\"GROUP\"\"(ID) (CAST(999 AS BIGINT))\"; SQL statement:\nINSERT INTO \"PUBLIC\".\"USER\" (\"NAME\", \"GROUP-ID\") VALUES (CAST(? AS VARCHAR), CAST(? AS INTEGER)) [23506-214]")))))
