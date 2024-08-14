(ns metabase.driver.redshift-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.describe-database
    :as sql-jdbc.describe-database]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :refer [Table]]
   [metabase.plugins.jdbc-proxy :as jdbc-proxy]
   [metabase.public-settings :as public-settings]
   [metabase.query-processor :as qp]
   [metabase.sync :as sync]
   [metabase.sync.util :as sync-util]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.redshift :as redshift.test]
   [metabase.test.data.sql :as sql.tx]
   [metabase.test.fixtures :as fixtures]
   [metabase.util :as u]
   [metabase.util.honey-sql-2 :as h2x]
   [metabase.util.log :as log]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (metabase.plugins.jdbc_proxy ProxyDriver)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :plugins))
(use-fixtures :once (fixtures/initialize :db))

(deftest ^:parallel correct-driver-test
  (mt/test-driver :redshift
    (testing "Make sure we're using the correct driver for Redshift"
      (let [driver (java.sql.DriverManager/getDriver "jdbc:redshift://host:5432/testdb")
            driver (if (instance? ProxyDriver driver)
                     (jdbc-proxy/wrapped-driver driver)
                     driver)]
        ;; although we set this as com.amazon.redshift.jdbc42.Driver, that is apparently an alias for this "real" class
        (is (= "com.amazon.redshift.Driver"
               (.getName (class driver))))))))

(deftest ^:parallel default-select-test
  (is (= ["SELECT \"source\".* FROM (SELECT *) AS \"source\""]
         (->> {:from [[{::sql.qp/sql-source-query ["SELECT *"]}
                       [(h2x/identifier :table-alias "source")]]]}
              (#'sql.qp/add-default-select :redshift)
              (sql.qp/format-honeysql :redshift)))))

(defn- query->native [query]
  (let [native-query (atom nil)
        check-sql-fn (fn [_ _ sql & _]
                       (reset! native-query sql)
                       (throw (Exception. "done")))]
    (with-redefs [sql-jdbc.execute/prepared-statement check-sql-fn
                  sql-jdbc.execute/execute-statement! check-sql-fn]
      (u/ignore-exceptions
        (qp/process-query query))
      @native-query)))

(defn- sql->lines [sql]
  (str/split-lines (driver/prettify-native-form :redshift sql)))

(deftest remark-test
  (testing "if I run a Redshift query, does it get a remark added to it?"
    (mt/test-driver :redshift
      (let [expected (for [line ["-- /* partner: \"metabase\", {\"dashboard_id\":5678,\"chart_id\":1234,\"optional_user_id\":1000,\"optional_account_id\":\"{{site-uuid}}\",\"filter_values\":{\"id\":[\"1\",\"2\",\"3\"]}} */ Metabase:: userID: 1000 queryType: MBQL queryHash: cb83d4f6eedc250edb0f2c16f8d9a21e5d42f322ccece1494c8ef3d634581fe2"
                                 "SELECT"
                                 "  \"{{schema}}\".\"test_data_users\".\"id\" AS \"id\","
                                 "  \"{{schema}}\".\"test_data_users\".\"name\" AS \"name\","
                                 "  \"{{schema}}\".\"test_data_users\".\"last_login\" AS \"last_login\""
                                 "FROM"
                                 "  \"{{schema}}\".\"test_data_users\""
                                 "WHERE"
                                 "  ("
                                 "    \"{{schema}}\".\"test_data_users\".\"id\" = 1"
                                 "  )"
                                 "  OR ("
                                 "    \"{{schema}}\".\"test_data_users\".\"id\" = 2"
                                 "  )"
                                 "  OR ("
                                 "    \"{{schema}}\".\"test_data_users\".\"id\" = 3"
                                 "  )"
                                 "LIMIT"
                                 "  2000"]]
                       (-> line
                           (str/replace #"\Q{{site-uuid}}\E" (public-settings/site-uuid))
                           (str/replace #"\Q{{schema}}\E" (redshift.test/unique-session-schema))))]
        (is (= expected
               (sql->lines
                (query->native
                 (assoc
                  (mt/mbql-query users {:limit 2000})
                  :parameters [{:type   "id"
                                :target [:dimension [:field (mt/id :users :id) nil]]
                                :value  ["1" "2" "3"]}]
                  :info {:executed-by  1000
                         :card-id      1234
                         :dashboard-id 5678
                         :context      :ad-hoc
                         :query-hash   (byte-array [-53 -125 -44 -10 -18 -36 37 14 -37 15 44 22 -8 -39 -94 30
                                                    93 66 -13 34 -52 -20 -31 73 76 -114 -13 -42 52 88 31 -30])})))))))))

;; the extsales table is a Redshift Spectrum linked table, provided by AWS's sample data set for Redshift.
;; See https://docs.aws.amazon.com/redshift/latest/dg/c-getting-started-using-spectrum.html
;;
;; Data is loaded into S3 via:
;;
;; aws s3 cp s3://awssampledbuswest2/tickit/spectrum/sales/ s3://mb-rs-test/tickit/spectrum/sales/ --recursive
;;
;; And the Redshift table and schema is created via:
;;
;; create external schema spectrum
;; from data catalog
;; database 'spectrumdb'
;; iam_role ''
;; create external database if not exists;
;;
;; create external table spectrum.extsales(
;; salesid integer,
;; listid integer,
;; sellerid integer,
;; buyerid integer,
;; eventid integer,
;; dateid smallint,
;; qtysold smallint,
;; pricepaid decimal(8,2),
;; commission decimal(8,2),
;; saletime timestamp)
;; row format delimited
;; fields terminated by '\t'
;; stored as textfile
;; location 's3://mb-rs-test/tickit/spectrum/sales/'
;; table properties ('numRows'='172000');
;;
(deftest ^:parallel test-external-table
  (mt/test-driver :redshift
    (testing "expects spectrum schema to exist"
      (is (=? [{:description     nil
                :table_id        (mt/id :extsales)
                :semantic_type    nil
                :name            "buyerid"
                :settings        nil
                :source          :fields
                :field_ref       [:field (mt/id :extsales :buyerid) nil]
                :nfc_path        nil
                :parent_id       nil
                :id              (mt/id :extsales :buyerid)
                :visibility_type :normal
                :display_name    "Buyerid"
                :base_type       :type/Integer
                :effective_type  :type/Integer
                :coercion_strategy nil}
               {:description     nil
                :table_id        (mt/id :extsales)
                :semantic_type    nil
                :name            "salesid"
                :settings        nil
                :source          :fields
                :field_ref       [:field (mt/id :extsales :salesid) nil]
                :nfc_path        nil
                :parent_id       nil
                :id              (mt/id :extsales :salesid)
                :visibility_type :normal
                :display_name    "Salesid"
                :base_type       :type/Integer
                :effective_type  :type/Integer
                :coercion_strategy nil}]
              ;; in different Redshift instances, the fingerprint on these columns is different.
              (map #(dissoc % :fingerprint)
                   (get-in (qp/process-query (mt/mbql-query extsales
                                               {:limit    1
                                                :fields   [$buyerid $salesid]
                                                :order-by [[:asc $buyerid]
                                                           [:asc $salesid]]
                                                :filter   [:= [:field (mt/id :extsales :buyerid) nil] 11498]}))
                           [:data :cols])))))))

(deftest parameters-test
  (mt/test-driver :redshift
    (testing "Native query parameters should work with filters. (#12984)"
      (is (= [[693 "2015-12-29T00:00:00Z" 10 90]]
             (mt/rows
               (qp/process-query
                {:database   (mt/id)
                 :type       :native
                 :native     {:query         (str "select * "
                                                  (format "from \"%s\".test_data_checkins " (redshift.test/unique-session-schema))
                                                  "where {{date}} "
                                                  "order by date desc "
                                                  "limit 1;")
                              :template-tags {"date" {:name         "date"
                                                      :display-name "date"
                                                      :type         :dimension
                                                      :widget-type  :date/all-options
                                                      :dimension    [:field (mt/id :checkins :date) nil]}}}
                 :parameters [{:type   :date/all-options
                               :target [:dimension [:template-tag "date"]]
                               :value  "past30years"}]})))))))

(defn- execute! [format-string & args]
  (let [sql  (apply format format-string args)
        spec (sql-jdbc.conn/connection-details->spec :redshift @redshift.test/db-connection-details)]
    (log/info (u/format-color 'blue "[redshift] %s" sql))
    (try
      (jdbc/execute! spec sql)
      (catch Throwable e
        (throw (ex-info (format "Error executing SQL: %s" (ex-message e))
                        {:sql sql}
                        e)))))
  (log/info (u/format-color 'blue "[ok]")))

(deftest redshift-types-test
  (mt/test-driver
    :redshift
    (testing "Redshift specific types should be synced correctly"
      (let [db-details (tx/dbdef->connection-details :redshift nil nil)]
        (mt/with-temp [:model/Database database {:engine :redshift, :details db-details}]
          (let [tbl-nm       (tx/db-qualified-table-name (:name database) "table")
                qual-tbl-nm  (format "\"%s\".\"%s\"" (redshift.test/unique-session-schema) tbl-nm)
                view-nm      (tx/db-qualified-table-name (:name database) "view")
                qual-view-nm (format "\"%s\".\"%s\"" (redshift.test/unique-session-schema) view-nm)]
            ;; create a table with a CHARACTER VARYING and a NUMERIC column, and a late bound view that selects from it
            (execute!
             (str "DROP TABLE IF EXISTS %1$s;%n"
                  "CREATE TABLE %1$s(weird_varchar CHARACTER VARYING(50), numeric_col NUMERIC(10,2));%n"
                  "CREATE OR REPLACE VIEW %2$s AS SELECT * FROM %1$s WITH NO SCHEMA BINDING;")
             qual-tbl-nm
             qual-view-nm)
            ;; sync the schema again to pick up the new view (and table, though we aren't checking that)
            (binding [sync-util/*log-exceptions-and-continue?* false]
              (sync/sync-database! database {:scan :schema}))
            (is (contains?
                 (t2/select-fn-set :name Table :db_id (u/the-id database)) ; the new view should have been synced
                 view-nm))
            (let [table-id (t2/select-one-pk Table :db_id (u/the-id database), :name view-nm)]
              ;; and its columns' :base_type should have been identified correctly
              (is (= [{:name "numeric_col",   :database_type "numeric",           :base_type :type/Decimal}
                      {:name "weird_varchar", :database_type "character varying", :base_type :type/Text}]
                     (map
                      mt/derecordize
                      (t2/select [Field :name :database_type :base_type] :table_id table-id {:order-by [:name]})))))))))))

(deftest redshift-lbv-sync-error-test
  (mt/test-driver
    :redshift
    (testing "Late-binding view with with data types that cause a JDBC error can still be synced successfully (#21215)"
      (let [db-details (tx/dbdef->connection-details :redshift nil nil)]
        (t2.with-temp/with-temp [Database database {:engine :redshift, :details db-details}]
          (let [view-nm      (tx/db-qualified-table-name (:name database) "lbv")
                qual-view-nm (format "\"%s\".\"%s\"" (redshift.test/unique-session-schema) view-nm)]
            (execute!
             (str "CREATE OR REPLACE VIEW %1$s AS ("
                  "WITH test_data AS (SELECT 'open' AS shop_status UNION ALL SELECT 'closed' AS shop_status) "
                  "SELECT NULL as raw_null, "
                  "'hello' as raw_var, "
                  "CASE WHEN shop_status = 'open' THEN 11387.133 END AS case_when_numeric_inc_nulls "
                  "FROM test_data) WITH NO SCHEMA BINDING;")
             qual-view-nm)
            (binding [sync-util/*log-exceptions-and-continue?* false]
              (sync/sync-database! database {:scan :schema}))
            (is (contains?
                 (t2/select-fn-set :name Table :db_id (u/the-id database)) ; the new view should have been synced without errors
                 view-nm))
            (let [table-id (t2/select-one-pk Table :db_id (u/the-id database), :name view-nm)]
                ;; and its columns' :base_type should have been identified correctly
              (is (= [{:name "case_when_numeric_inc_nulls", :database_type "numeric",           :base_type :type/Decimal}
                      {:name "raw_null",                    :database_type "character varying", :base_type :type/Text}
                      {:name "raw_var",                     :database_type "character varying", :base_type :type/Text}]
                     (t2/select [Field :name :database_type :base_type] :table_id table-id {:order-by [:name]}))))))))))

(deftest describe-database-privileges-test
  (mt/test-driver :redshift
    (testing "Should filter out schemas for which the user has insufficient select perms"
      (let [user-name    (u/lower-case-en (mt/random-name))
            schema       (sql.tx/session-schema :redshift)
            table-name   (u/lower-case-en (mt/random-name))
            schema+table (format "\"%s\".\"%s\"" schema table-name)
            user-pw      "Password1234"
            details      (assoc (:details (mt/db)) :user user-name, :password user-pw)
            revoke-schema-usage (format "REVOKE USAGE ON SCHEMA \"%s\" FROM %s;%n" schema user-name)]
        (try (execute! (str (format "CREATE USER %s PASSWORD '%s';%n" user-name user-pw)
                            (format "CREATE TABLE %s (i INTEGER);%n" schema+table)))
               (mt/with-temp [:model/Database db {:engine :redshift, :details details}]
                 (let [table-is-in-results? (fn []
                                              (binding [redshift.test/*override-describe-database-to-filter-by-db-name?* false]
                                                (->> (:tables (driver/describe-database :redshift db))
                                                     (map :name)
                                                     (some #{table-name})
                                                     boolean)))
                       grant-schema-usage   (format "GRANT USAGE ON SCHEMA \"%s\" TO %s;%n" schema user-name)
                       revoke-table-select  (format "REVOKE SELECT ON TABLE %s FROM %s;%n" schema+table user-name)
                       grant-table-select   (format "GRANT SELECT ON TABLE %s TO %s;%n" schema+table user-name)]
                   (testing "with schema usage and table select grants, table should be in results"
                     (execute! (str grant-schema-usage grant-table-select))
                     (is (true? (table-is-in-results?))))
                   (testing "with no schema usage and no table select grants, table should not be in results"
                     (execute! (str revoke-schema-usage revoke-table-select))
                     (is (false? (table-is-in-results?))))
                   (testing "with no schema usage but table select grants, table should not be in results"
                     (execute! (str revoke-schema-usage grant-table-select))
                     (is (false? (table-is-in-results?))))
                   (testing "with schema usage but no table select grants, table should not be in results"
                     (execute! (str grant-schema-usage revoke-table-select))
                     (is (false? (table-is-in-results?))))))
             (finally
               (execute! (str revoke-schema-usage
                              (format "DROP USER IF EXISTS %s;%n" user-name)))))))))

(deftest describe-database-exclude-metabase-cache-test
  (mt/test-driver :redshift
    (testing "metabase_cache tables should be excluded from the describe-database results"
      (mt/dataset avian-singles
        (mt/with-persistence-enabled [persist-models!]
          (let [details (assoc (:details (mt/db))
                               :schema-filters-type "inclusion"
                               :schema-filters-patterns "metabase_cache*,20*,pg_*")] ; 20* matches test session schemas
            (mt/with-temp [:model/Card _      {:name          "model"
                                               :type          :model
                                               :dataset_query (mt/mbql-query users)
                                               :database_id   (mt/id)}
                           :model/Database db {:engine :redshift, :details details}]
              (binding [redshift.test/*override-describe-database-to-filter-by-db-name?* false]
                (persist-models!)
                (let [synced-schemas (set (map :schema (:tables (driver/describe-database :redshift db))))]
                  (testing "sense check: there are results matching some schemas in the schema-filters-patterns"
                    (is (some #(re-matches #"20(.*)" %) synced-schemas)))
                  (let [all-schemas (map :table_schema (jdbc/query (sql-jdbc.conn/db->pooled-connection-spec (mt/db))
                                                                   "select distinct table_schema from information_schema.tables;"))]
                    (testing "metabase_cache_ tables are excluded from results"
                      (let [match? #(re-matches #"metabase_cache(.*)" %)]
                        (is (some match? all-schemas))
                        (is (not-any? match? synced-schemas))))
                    (testing "system tables are excluded from results"
                      (let [match? #(re-matches #"pg_(.*)" %)]
                        (is (some match? all-schemas))
                        (is (not-any? match? synced-schemas))))))))))))))

(deftest sync-materialized-views-test
  (mt/test-driver :redshift
    (testing "Check that we properly fetch materialized views"
      (let [db-details (tx/dbdef->connection-details :redshift nil nil)]
        (mt/with-temp [Database database {:engine :redshift, :details db-details}]
          (let [table-name    (tx/db-qualified-table-name (:name database) "sync_t")
                qual-tbl-nm   (format "\"%s\".\"%s\"" (redshift.test/unique-session-schema) table-name)
                mview-nm      (tx/db-qualified-table-name (:name database) "sync_mv")
                qual-mview-nm (format "\"%s\".\"%s\"" (redshift.test/unique-session-schema) mview-nm)]
            (execute!
             (str "CREATE TABLE IF NOT EXISTS %1$s(weird_varchar CHARACTER VARYING(50), numeric_col NUMERIC(10,2));\n"
                  "CREATE MATERIALIZED VIEW %2$s AS SELECT * FROM %1$s;")
             qual-tbl-nm
             qual-mview-nm)
            (is (some #(= mview-nm (:name %))
                      (:tables (sql-jdbc.describe-database/describe-database :redshift database))))))))))

(mt/defdataset unix-timestamps
  [["timestamps"
    [{:field-name "timestamp", :base-type {:native "numeric"}}]
    [[1642704550656]]]])

(deftest unix-timestamp-test
  (mt/test-driver :redshift
    (testing "NUMERIC columns should work with UNIX timestamp conversion (#7487)"
      (mt/dataset unix-timestamps
        (testing "without coercion strategy"
          (let [query (mt/mbql-query timestamps)]
            (mt/with-native-query-testing-context query
              (is (= [1 1642704550656M]
                     (mt/first-row (qp/process-query query)))))))
        (testing "WITH coercion strategy"
          (mt/with-temp-vals-in-db Field (mt/id :timestamps :timestamp) {:coercion_strategy :Coercion/UNIXMilliSeconds->DateTime
                                                                         :effective_type    :type/Instant}
            (let [query (mt/mbql-query timestamps)]
              (mt/with-native-query-testing-context query
                (is (= [1 "2022-01-20T18:49:10.656Z"]
                       (mt/first-row (qp/process-query query))))))))))))

(deftest interval-test
  (mt/test-drivers #{:postgres :redshift}
    (testing "Redshift Interval values should behave the same as postgres (#19501)"
      (is (= ["0 years 0 mons 5 days 0 hours 0 mins 0.0 secs"]
             (mt/first-row
               (qp/process-query
                 (mt/native-query {:query "select interval '5 days'"}))))))))

;; Cal 2024-04-10: Commented this out instead of deleting it. We used to use this for `driver/describe-database` (see metabase#37439)
;; We might use it again in the future for getting privileges for actions.
#_(deftest table-privileges-test
  (mt/test-driver :redshift
    (testing "`table-privileges` should return the correct data for current_user and role privileges"
      (mt/with-temp [Database database {:engine :redshift :details (tx/dbdef->connection-details :redshift nil nil)}]
        (let [schema-name                  (redshift.test/unique-session-schema)
              username                     (str (sql.tu.unique-prefix/unique-prefix) "privilege_rows_test_role")
              db-name                      (:name database)
              table-name                   (tx/db-qualified-table-name db-name "table")
              qual-tbl-name                (format "\"%s\".\"%s\"" schema-name table-name)
              table-partial-select-name    (tx/db-qualified-table-name db-name "tbl_sel")
              qual-tbl-partial-select-name (format "\"%s\".\"%s\"" schema-name table-partial-select-name)
              table-partial-update-name    (tx/db-qualified-table-name db-name "tbl_upd")
              qual-tbl-partial-update-name (format "\"%s\".\"%s\"" schema-name table-partial-update-name)
              view-nm                      (tx/db-qualified-table-name db-name "view")
              qual-view-name               (format "\"%s\".\"%s\"" schema-name view-nm)
              mview-name                   (tx/db-qualified-table-name db-name "mview")
              qual-mview-name              (format "\"%s\".\"%s\"" schema-name mview-name)
              conn-spec                    (sql-jdbc.conn/db->pooled-connection-spec database)
              get-privileges               (fn []
                                             (sql-jdbc.conn/with-connection-spec-for-testing-connection
                                               [spec [:redshift (assoc (:details database) :user username)]]
                                               (with-redefs [sql-jdbc.conn/db->pooled-connection-spec (fn [_] spec)]
                                                 (set (sql-jdbc.sync/current-user-table-privileges driver/*driver* spec)))))]
          (try
           (execute! (format
                      (str
                       "CREATE TABLE %1$s (id INTEGER);\n"
                       "CREATE VIEW %2$s AS SELECT * from %1$s;\n"
                       "CREATE MATERIALIZED VIEW %3$s AS SELECT * from %1$s;\n"
                       "CREATE TABLE %4$s (id INTEGER);\n"
                       "CREATE TABLE %5$s (id INTEGER);\n"
                       "CREATE USER \"%6$s\" WITH PASSWORD '%7$s';\n"
                       "GRANT SELECT ON %1$s TO \"%6$s\";\n"
                       "GRANT UPDATE ON %1$s TO \"%6$s\";\n"
                       "GRANT SELECT ON %2$s TO \"%6$s\";\n"
                       "GRANT SELECT ON %3$s TO \"%6$s\";\n"
                       "GRANT SELECT (id) ON %4$s TO \"%6$s\";\n"
                       "GRANT UPDATE (id) ON %5$s TO \"%6$s\";")
                      qual-tbl-name
                      qual-view-name
                      qual-mview-name
                      qual-tbl-partial-select-name
                      qual-tbl-partial-update-name
                      username
                      (get-in database [:details :password])))
           (testing "check that without USAGE privileges on the schema, nothing is returned"
             (is (= #{}
                    (get-privileges))))
           (testing "with USAGE privileges, SELECT and UPDATE privileges are returned"
             (jdbc/execute! conn-spec (format "GRANT USAGE ON SCHEMA \"%s\" TO \"%s\";" schema-name username))
             (is (= (into #{} (map #(merge {:schema schema-name
                                            :role   nil
                                            :select false
                                            :update false
                                            :insert false
                                            :delete false}
                                           %)
                                   [{:table  table-name
                                     :update true
                                     :select true}
                                    {:table  table-partial-select-name
                                     :select true}
                                    {:table  table-partial-update-name
                                     :update true}
                                    {:table  view-nm
                                     :select true}
                                    {:table  mview-name
                                     :select true}]))
                    (get-privileges))))
           (finally
            (execute! (format
                       (str
                        "DROP TABLE IF EXISTS %2$s CASCADE;\n"
                        "DROP VIEW IF EXISTS %3$s CASCADE;\n"
                        "DROP MATERIALIZED VIEW IF EXISTS %4$s CASCADE;\n"
                        "DROP TABLE IF EXISTS %5$s CASCADE;\n"
                        "DROP TABLE IF EXISTS %6$s CASCADE;\n"
                        "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA \"%1$s\" FROM \"%7$s\";\n"
                        "REVOKE ALL PRIVILEGES ON SCHEMA \"%1$s\" FROM \"%7$s\";\n"
                        "REVOKE USAGE ON SCHEMA \"%1$s\" FROM \"%7$s\";\n"
                        "DROP USER IF EXISTS \"%7$s\";")
                       schema-name
                       qual-tbl-name
                       qual-view-name
                       qual-mview-name
                       qual-tbl-partial-select-name
                       qual-tbl-partial-update-name
                       username)))))))))

(deftest ^:parallel date-plus-integer-test
  (testing "Can we add a {{date}} template tag parameter to an integer in SQL queries? (#40755)"
    (mt/test-driver :redshift
      (is (= [[#t "2024-07-03"]]
             (mt/rows
              (qp/process-query
               {:database   (mt/id)
                :type       :native
                :native     {:query         "SELECT {{date}} + 1 AS t;"
                             :template-tags {"date" {:type         :date
                                                     :name         "date"
                                                     :display-name "Date"}}}
                :parameters [{:type   :date/single
                              :target [:variable [:template-tag "date"]]
                              :value  "2024-07-02"}]
                :middleware {:format-rows? false}})))))))
