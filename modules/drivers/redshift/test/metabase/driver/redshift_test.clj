(ns metabase.driver.redshift-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [metabase.driver.redshift :as redshift]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
            [metabase.driver.sql-jdbc.sync :as sql-jdbc.sync]
            [metabase.driver.sql-jdbc.sync.describe-database :as sync.describe-database]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.setting :as setting]
            [metabase.models.table :refer [Table]]
            [metabase.plugins.jdbc-proxy :as jdbc-proxy]
            [metabase.public-settings :as pubset]
            [metabase.query-processor :as qp]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.test.data.interface :as tx]
            [metabase.test.data.redshift :as redshift.test]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util :as tu]
            [metabase.util :as u]
            [toucan.db :as db])
  (:import [java.sql ResultSet ResultSetMetaData]
           metabase.plugins.jdbc_proxy.ProxyDriver))

(use-fixtures :once (fixtures/initialize :plugins))
(use-fixtures :once (fixtures/initialize :db))

(deftest correct-driver-test
  (mt/test-driver :redshift
    (testing "Make sure we're using the correct driver for Redshift"
      (let [driver (java.sql.DriverManager/getDriver "jdbc:redshift://host:5432/testdb")
            driver (if (instance? ProxyDriver driver)
                     (jdbc-proxy/wrapped-driver driver)
                     driver)]
        ;; although we set this as com.amazon.redshift.jdbc42.Driver, that is apparently an alias for this "real" class
        (is (= "com.amazon.redshift.Driver"
               (.getName (class driver))))))))

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

(deftest remark-test
  (testing "single field user-specified value"
    (let [expected (str/replace
                    (str
                     "-- /* partner: \"metabase\", {\"dashboard_id\":null,\"chart_id\":1234,\"optional_user_id\":1000,"
                     "\"optional_account_id\":\"" (pubset/site-uuid) "\","
                     "\"filter_values\":{\"id\":[\"1\",\"2\",\"3\"]}} */"
                     " Metabase:: userID: 1000 queryType: MBQL queryHash: cb83d4f6eedc250edb0f2c16f8d9a21e5d42f322ccece1494c8ef3d634581fe2\n"
                     "SELECT \"%schema%\".\"test_data_users\".\"id\" AS \"id\","
                     " \"%schema%\".\"test_data_users\".\"name\" AS \"name\","
                     " \"%schema%\".\"test_data_users\".\"last_login\" AS \"last_login\""
                     " FROM \"%schema%\".\"test_data_users\""
                     " WHERE (\"%schema%\".\"test_data_users\".\"id\" = 1 OR \"%schema%\".\"test_data_users\".\"id\" = 2"
                     " OR \"%schema%\".\"test_data_users\".\"id\" = 3)"
                     " LIMIT 2000")
                    "%schema%" redshift.test/session-schema-name)]
     (mt/test-driver
      :redshift
      (is (= expected
             (query->native
              (assoc
               (mt/mbql-query users {:limit 2000})
               :parameters [{:type   "id"
                             :target [:dimension [:field (mt/id :users :id) nil]]
                             :value  ["1" "2" "3"]}]
               :info {:executed-by 1000
                      :card-id     1234
                      :context     :ad-hoc
                      :nested?     false
                      :query-hash  (byte-array [-53 -125 -44 -10 -18 -36 37 14 -37 15 44 22 -8 -39 -94 30
                                                93 66 -13 34 -52 -20 -31 73 76 -114 -13 -42 52 88 31 -30])})))
          "if I run a Redshift query, does it get a remark added to it?")))))

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
(deftest test-external-table
  (mt/test-driver :redshift
   (testing "expects spectrum schema to exist"
     (is (= [{:description     nil
              :table_id        (mt/id :extsales)
              :semantic_type    nil
              :name            "buyerid"
              :settings        nil
              :source          :fields
              :field_ref       [:field (mt/id :extsales :buyerid) nil]
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
              :parent_id       nil
              :id              (mt/id :extsales :salesid)
              :visibility_type :normal
              :display_name    "Salesid"
              :base_type       :type/Integer
              :effective_type  :type/Integer
              :coercion_strategy nil}]
            ;; in different Redshift instances, the fingerprint on these columns is different.
            (map #(dissoc % :fingerprint)
                 (get-in (qp/process-query (mt/mbql-query
                                            :extsales
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
                                                  (format "from \"%s\".test_data_checkins " redshift.test/session-schema-name)
                                                  "where {{date}} "
                                                  "order by date desc "
                                                  "limit 1;")
                              :template-tags {"date" {:name         "date"
                                                      :display-name "date"
                                                      :type         :dimension
                                                      :dimension    [:field (mt/id :checkins :date) nil]}}}
                 :parameters [{:type   :date/all-options
                               :target [:dimension [:template-tag "date"]]
                               :value  "past30years"}]})))))))

(deftest redshift-types-test
  (mt/test-driver
    :redshift
    (testing "Redshift specific types should be synced correctly"
      (let [db-details   (tx/dbdef->connection-details :redshift)
            tbl-nm       "redshift_specific_types"
            qual-tbl-nm  (str redshift.test/session-schema-name "." tbl-nm)
            view-nm      "late_binding_view"
            qual-view-nm (str redshift.test/session-schema-name "." view-nm)]
        (mt/with-temp Database [database {:engine :redshift, :details db-details}]
          ;; create a table with a CHARACTER VARYING and a NUMERIC column, and a late bound view that selects from it
          (redshift.test/execute!
           (str "DROP TABLE IF EXISTS %1$s;%n"
                "CREATE TABLE %1$s(weird_varchar CHARACTER VARYING(50), numeric_col NUMERIC(10,2));%n"
                "CREATE OR REPLACE VIEW %2$s AS SELECT * FROM %1$s WITH NO SCHEMA BINDING;")
           qual-tbl-nm
           qual-view-nm)
          ;; sync the schema again to pick up the new view (and table, though we aren't checking that)
          (sync/sync-database! database)
          (is (contains?
               (db/select-field :name Table :db_id (u/the-id database)) ; the new view should have been synced
               view-nm))
          (let [table-id (db/select-one-id Table :db_id (u/the-id database), :name view-nm)]
            ;; and its columns' :base_type should have been identified correctly
            (is (= [{:name "numeric_col",   :database_type "numeric(10,2)",         :base_type :type/Decimal}
                    {:name "weird_varchar", :database_type "character varying(50)", :base_type :type/Text}]
                   (map
                    (partial into {})
                    (db/select [Field :name :database_type :base_type] :table_id table-id {:order-by [:name]}))))))))))

(defn- assert-jdbc-url-fetch-size [db fetch-size]
  (with-open [conn (.getConnection (sql-jdbc.execute/datasource db))]
    (let [md  (.getMetaData conn)
          url (.getURL md)]
      (is (str/includes? url (str "defaultRowFetchSize=" fetch-size))))))

(deftest test-jdbc-fetch-size
  (testing "Redshift JDBC fetch size is set correctly in PreparedStatement"
    (mt/test-driver :redshift
      ;; the default value should always be picked up if nothing is set
      (assert-jdbc-url-fetch-size (mt/db) (:default (setting/resolve-setting :redshift-fetch-size)))
      (mt/with-temporary-setting-values [redshift-fetch-size "14"]
        ;; create a new DB in order to pick up the change to the setting here
        (mt/with-temp Database [db {:engine :redshift, :details (:details (mt/db))}]
          (mt/with-db db
            ;; make sure the JDBC URL has the defaultRowFetchSize parameter set correctly
            (assert-jdbc-url-fetch-size db 14)
            ;; now, actually run a query and see if the PreparedStatement has the right fetchSize set
            (mt/with-everything-store
              (let [orig-fn sql-jdbc.execute/reducible-rows
                    new-fn  (fn [driver ^ResultSet rs ^ResultSetMetaData rsmeta canceled-chan]
                              (is (= 14 (.getFetchSize (.getStatement rs))))
                              (orig-fn driver rs rsmeta canceled-chan))]
                (with-redefs [sql-jdbc.execute/reducible-rows new-fn]
                  (is (= [[1]] (-> {:query "SELECT 1"}
                                   (mt/native-query)
                                   (qp/process-query)
                                   (mt/rows)))))))))))))

(deftest syncable-schemas-test
  (mt/test-driver :redshift
    (testing "Should filter out schemas for which the user has no perms"
      ;; create a random username and random schema name, and grant the user USAGE permission for it
      (let [temp-username (str/lower-case (tu/random-name))
            random-schema (str/lower-case (tu/random-name))
            user-pw       "Password1234"
            db-det        (:details (mt/db))]
        (redshift.test/execute! (str "CREATE SCHEMA %s;"
                                       "CREATE USER %s PASSWORD '%s';%n"
                                       "GRANT USAGE ON SCHEMA %s TO %s;%n")
                                  random-schema
                                  temp-username
                                  user-pw
                                  random-schema
                                  temp-username)
        (try
          (binding [redshift.test/*use-original-syncable-schemas-impl?* true]
            (mt/with-temp Database [db {:engine :redshift, :details (assoc db-det :user temp-username :password user-pw)}]
              (with-open [conn (jdbc/get-connection (sql-jdbc.conn/db->pooled-connection-spec db))]
                (let [schemas (reduce conj
                                      #{}
                                      (sql-jdbc.sync/syncable-schemas :redshift conn (.getMetaData conn)))]
                  (testing "syncable-schemas for the user should contain the newly created random schema"
                    (is (contains? schemas random-schema)))
                  (testing "should not contain the current session-schema name (since that was never granted)"
                    (is (not (contains? schemas redshift.test/session-schema-name))))))))
          (finally
            (redshift.test/execute! (str "REVOKE USAGE ON SCHEMA %s FROM %s;%n"
                                           "DROP USER IF EXISTS %s;%n"
                                           "DROP SCHEMA IF EXISTS %s;%n")
             random-schema
             temp-username
             temp-username
             random-schema)))))

    (testing "Should filter out non-existent schemas (for which nobody has permissions)"
      (let [fake-schema-name (u/qualified-name ::fake-schema)]
        (binding [redshift.test/*use-original-syncable-schemas-impl?* true]
          ;; override `all-schemas` so it returns our fake schema in addition to the real ones.
          (with-redefs [sync.describe-database/all-schemas (let [orig sync.describe-database/all-schemas]
                                                             (fn [metadata]
                                                               (eduction
                                                                cat
                                                                [(orig metadata) [fake-schema-name]])))]
            (let [jdbc-spec (sql-jdbc.conn/db->pooled-connection-spec (mt/db))]
              (with-open [conn (jdbc/get-connection jdbc-spec)]
                (letfn [(schemas []
                          (reduce
                           conj
                           #{}
                           (sql-jdbc.sync/syncable-schemas :redshift conn (.getMetaData conn))))]
                  (testing "if schemas-with-usage-permissions is disabled, the ::fake-schema should come back"
                    (with-redefs [redshift/reducible-schemas-with-usage-permissions (fn [_ reducible]
                                                                                      reducible)]
                      (is (contains? (schemas) fake-schema-name))))
                  (testing "normally, ::fake-schema should be filtered out (because it does not exist)"
                    (is (not (contains? (schemas) fake-schema-name)))))))))))))
