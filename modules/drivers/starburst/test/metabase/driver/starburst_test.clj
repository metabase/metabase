(ns ^:mb/driver-tests metabase.driver.starburst-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [java-time.api :as t]
   [metabase.driver :as driver]
   [metabase.driver.common.table-rows-sample :as table-rows-sample]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql-jdbc.sync.interface :as sql-jdbc.sync.interface]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.driver.starburst :as starburst]
   [metabase.query-processor :as qp]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.timezones-test :as timezones-test]
   [metabase.sync.core :as sync]
   [metabase.test :as mt]
   [metabase.test.data.interface :as tx]
   [metabase.test.data.sql-jdbc :as sql-jdbc.tx]
   [metabase.test.fixtures :as fixtures]
   [metabase.warehouses.core :as warehouses]
   [toucan2.core :as t2]
   [toucan2.tools.with-temp :as t2.with-temp])
  (:import
   (java.sql Connection PreparedStatement ResultSet SQLException)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))
(sql-jdbc.tx/add-test-extensions! :starburst)

(defmethod tx/before-run :starburst
  [_]
  (alter-var-root #'timezones-test/broken-drivers conj :starburst))

(deftest have-select-privilege-mixed-tables-test
  (testing "have-select-privilege? correctly handles mixed Hive/Iceberg tables (Issue #63127)"
    (testing "Returns true when DESCRIBE succeeds (compatible table type)"
      (let [mock-conn (reify Connection
                        (getCatalog [_] "hive")
                        (prepareStatement [_ sql]
                          (is (= "DESCRIBE \"hive\".\"sales_data\".\"hive_table\"" sql))
                          (reify PreparedStatement
                            (executeQuery [_]
                              (reify ResultSet
                                (next [_] true)
                                (close [_] nil)))
                            (close [_] nil))))]
        (is (true? (sql-jdbc.sync.interface/have-select-privilege?
                    :starburst mock-conn "sales_data" "hive_table")))))

    (testing "Returns false when DESCRIBE fails with UNSUPPORTED_TABLE_TYPE error (incompatible table type like Iceberg in Hive catalog)"
      (let [mock-conn (reify Connection
                        (getCatalog [_] "hive")
                        (prepareStatement [_ sql]
                          (is (= "DESCRIBE \"hive\".\"sales_data\".\"iceberg_table\"" sql))
                          (reify PreparedStatement
                            (executeQuery [_]
                              ;; This simulates the actual Trino error when Hive catalog tries to describe an Iceberg table
                              ;; The error code 133001 corresponds to UNSUPPORTED_TABLE_TYPE in Trino's StandardErrorCode
                              (throw (SQLException. "Cannot query Iceberg table 'sales_data.iceberg_table'" nil 133001)))
                            (close [_] nil))))]
        (is (false? (sql-jdbc.sync.interface/have-select-privilege?
                     :starburst mock-conn "sales_data" "iceberg_table")))))

    (testing "Returns false for non-mixed-catalog errors"
      (let [mock-conn (reify Connection
                        (getCatalog [_] "hive")
                        (prepareStatement [_ sql]
                          (is (= "DESCRIBE \"hive\".\"sales_data\".\"restricted_table\"" sql))
                          (reify PreparedStatement
                            (executeQuery [_]
                              (throw (SQLException. "Access Denied: Cannot access table restricted_table" nil 42000)))
                            (close [_] nil))))]
        (is (false? (sql-jdbc.sync.interface/have-select-privilege?
                     :starburst mock-conn "sales_data" "restricted_table")))))))

(deftest describe-database-test
  (mt/test-driver :starburst
    (is (= {:tables #{{:name "categories" :schema "default"}
                      {:name "venues" :schema "default"}
                      {:name "checkins" :schema "default"}
                      {:name "users" :schema "default"}}}
           (-> (driver/describe-database :starburst (mt/db))
               (update :tables (comp set (partial filter (comp #{"categories"
                                                                 "venues"
                                                                 "checkins"
                                                                 "users"}
                                                               :name)))))))))

(deftest describe-table-test
  (mt/test-driver :starburst
    (is (= {:name   "venues"
            :schema "default"
            :fields #{{:name          "name",
                       ;; for HTTP based starburst driver, this is coming back as varchar(255)
                       ;; however, for whatever reason, the DESCRIBE statement results do not return the length
                       :database-type "varchar"
                       :base-type     :type/Text
                       :database-position 1}
                      {:name          "latitude"
                       :database-type "double"
                       :base-type     :type/Float
                       :database-position 3}
                      {:name          "longitude"
                       :database-type "double"
                       :base-type     :type/Float
                       :database-position 4}
                      {:name          "price"
                       :database-type "integer"
                       :base-type     :type/Integer
                       :database-position 5}
                      {:name          "category_id"
                       :database-type "integer"
                       :base-type     :type/Integer
                       :database-position 2}
                      {:name          "id"
                       :database-type "integer"
                       :base-type     :type/Integer
                       :database-position 0}}}
           (driver/describe-table :starburst (mt/db) (t2/select-one :model/Table :id (mt/id :venues)))))))

(deftest table-rows-sample-test
  (mt/test-driver :starburst
    (is (= [[1 "Red Medicine"]
            [2 "Stout Burgers & Beers"]
            [3 "The Apple Pan"]
            [4 "Wurstküche"]
            [5 "Brite Spot Family Restaurant"]]
           (->> (table-rows-sample/table-rows-sample (t2/select-one :model/Table :id (mt/id :venues))
                                                     [(t2/select-one :model/Field :id (mt/id :venues :id))
                                                      (t2/select-one :model/Field :id (mt/id :venues :name))]
                                                     (constantly conj))
                (sort-by first)
                (take 5))))))

(deftest page-test
  (testing ":page clause"
    (is (= {:select ["name" "id"]
            :from   [{:select   [[:default.categories.name "name"]
                                 [:default.categories.id "id"]
                                 [[:raw "row_number() OVER (ORDER BY default.categories.id ASC)"]
                                  :__rownum__]]
                      :from     [:default.categories]
                      :order-by [[:default.categories.id :asc]]}]
            :where  [:> :__rownum__ 5]
            :limit  5}
           (sql.qp/apply-top-level-clause :starburst :page
                                          {:select   [[:default.categories.name "name"] [:default.categories.id "id"]]
                                           :from     [:default.categories]
                                           :order-by [[:default.categories.id :asc]]}
                                          {:page {:page  2
                                                  :items 5}})))))

(deftest db-timezone-id-test
  (mt/test-driver :starburst
    (testing "If global timezone is 'SYSTEM', should use system timezone"
      (is (= "UTC"
             (driver/db-default-timezone driver/*driver* (mt/db)))))))

(deftest template-tag-timezone-test
  (mt/test-driver :starburst
    (testing "Make sure date params work correctly when report timezones are set (#10487)"
      (mt/with-temporary-setting-values [report-timezone "Asia/Hong_Kong"]
        ;; the `read-column-thunk` for `Types/TIMESTAMP` used to return an `OffsetDateTime`, but since Metabase 1.50 it
        ;; returns a LocalDate
        (is (= [[(t/local-date "2014-08-02")
                 (t/local-date "2014-08-02")]]
               (mt/rows
                (qp/process-query
                 {:database     (mt/id)
                  :type         :native
                  :middleware   {:format-rows? false} ; turn off formatting so we can check the raw local date objs
                  :native       {:query         "SELECT {{date}}, cast({{date}} AS date)"
                                 :template-tags {:date {:name "date" :display_name "Date" :type "date"}}}
                  :parameters   [{:type   "date/single"
                                  :target ["variable" ["template-tag" "date"]]
                                  :value  "2014-08-02"}]}))))))))

(deftest splice-strings-test
  (mt/test-driver :starburst
    (let [query (mt/mbql-query venues
                  {:aggregation [[:count]]
                   :filter      [:= $name "wow"]})]
      (testing "The native query returned in query results should use user-friendly splicing"
        (is (= (str "SELECT COUNT(*) AS \"count\" "
                    "FROM \"default\".\"venues\" "
                    "WHERE \"default\".\"venues\".\"name\" = 'wow'")
               (:query (qp.compile/compile-with-inline-parameters query))
               (-> (qp/process-query query) :data :native_form :query)))))))

(deftest connection-tests
  (testing "db-name is correct in all cases"
    (doseq [[c s expected] [[nil nil ""]
                            ["" "" ""]
                            ["my_catalog" nil "my_catalog"]
                            ["my_catalog" "" "my_catalog"]
                            ["my_catalog" "my_schema" "my_catalog/my_schema"]]]
      (is (= expected (#'starburst/db-name c s)))))
  (testing "jdbc-spec is correct"
    (is (= {:classname   "io.trino.jdbc.TrinoDriver"
            :subname     "//my-starburst-server:1234/my_catalog?Option1=Value1&Option2=Value2"
            :subprotocol "trino"}
           (#'starburst/jdbc-spec {:host "my-starburst-server"
                                   :port 1234
                                   :catalog "my_catalog"
                                   :schema nil
                                   :additional-options "Option1=Value1&Option2=Value2"})))))

(defn- execute-ddl! [ddl-statements]
  (mt/with-driver :starburst
    (let [jdbc-spec (sql-jdbc.conn/connection-details->spec :starburst (:details (mt/db)))]
      (sql-jdbc.execute/do-with-connection-with-options
       :starburst
       jdbc-spec
       {}
       (fn [^Connection conn]
         (doseq [ddl-stmt ddl-statements]
           (with-open [stmt (.prepareStatement conn ddl-stmt)]
             (.executeUpdate stmt))))))))

(deftest specific-schema-sync-test
  (mt/test-driver :starburst
    (testing "When a specific schema is designated, only that one is synced"
      (let [s           "specific_schema"
            t           "specific_table"
            db-details  (:details (mt/db))
            with-schema (assoc db-details :schema s)]
        (execute-ddl! [(format "DROP TABLE IF EXISTS %s.%s" s t)
                       (format "DROP SCHEMA IF EXISTS %s" s)
                       (format "CREATE SCHEMA %s" s)
                       (format "CREATE TABLE %s.%s (pk INTEGER, val1 VARCHAR(512))" s t)])
        (t2.with-temp/with-temp [:model/Database db {:engine :starburst, :name "Temp starburst JDBC Schema DB", :details with-schema}]
          (mt/with-db db
            ;; same as test_data, but with schema, so should NOT pick up venues, users, etc.
            (sync/sync-database! db)
            (is (= [{:name t, :schema s, :db_id (mt/id)}]
                   (map #(select-keys % [:name :schema :db_id]) (t2/select :model/Table :db_id (mt/id)))))))
        (execute-ddl! [(format "DROP TABLE %s.%s" s t)
                       (format "DROP SCHEMA %s" s)])))))

(deftest test-database-connection-test
  (mt/test-driver :starburst
    (testing "can-test-database-connection works properly"
      ;; for whatever reason, :let-user-control-scheduling is the only "always available" option that goes into details
      ;; the others (ex: :auto_run_queries and :refingerprint) are one level up (fields in the model, not in the details
      ;; JSON blob)
      (let [db-details (assoc (:details (mt/db)) :let-user-control-scheduling false)]
        (is (nil? (warehouses/test-database-connection :starburst db-details)))))))

(deftest kerberos-properties-test
  (testing "Kerberos related properties are set correctly"
    (let [details {:host                         "starburst-server"
                   :port                         7778
                   :catalog                      "my-catalog"
                   :kerberos                     true
                   :ssl                          true
                   :kerberos-config-path         "/path/to/krb5.conf"
                   :kerberos-principal           "alice@DOMAIN.COM"
                   :kerberos-remote-service-name "HTTP"
                   :kerberos-keytab-path         "/path/to/client.keytab"
                   :kerberos-delegation          true}
          jdbc-spec (sql-jdbc.conn/connection-details->spec :starburst details)]
      (is (= (str "//starburst-server:7778/my-catalog?KerberosPrincipal=alice@DOMAIN.COM"
                  "&KerberosRemoteServiceName=HTTP&KerberosKeytabPath=/path/to/client.keytab"
                  "&KerberosConfigPath=/path/to/krb5.conf&KerberosDelegation=true")
             (:subname jdbc-spec))))))

(deftest source-property-test
  (testing "source property is set correctly"
    (let [details {:host                         "starburst-server"
                   :port                         7778
                   :catalog                      "my-catalog"
                   :ssl                          true}
          jdbc-spec (sql-jdbc.conn/connection-details->spec :starburst details)]
      (is (str/starts-with? (:source jdbc-spec) "Metabase")))))

(deftest role-property-test
  (testing "Role is set correctly"
    (let [details {:host                          "starburst-server"
                   :port                          7778
                   :roles                         "my_role"
                   :catalog                       "my-catalog"}
          jdbc-spec (sql-jdbc.conn/connection-details->spec :starburst details)]
      (is (true? (= (:roles jdbc-spec) "system:my_role"))))))

(deftest datetime-diff-base-test
  (mt/test-drivers (mt/normal-drivers-with-feature :datetime-diff)
    (mt/dataset test-data
      (letfn [(query [x y unit]
                (->> (mt/run-mbql-query orders
                       {:limit 1
                        :expressions {"diff"     [:datetime-diff x y unit]
                                      "diff-rev" [:datetime-diff y x unit]}
                        :fields [[:expression "diff"]
                                 [:expression "diff-rev"]]})
                     (mt/formatted-rows [int int])
                     first))]
        (doseq [[unit cases] [[:year [["2021-10-03" "2022-10-02" 0 "day under a year"]
                                      ["2021-10-03" "2022-10-03" 1 "same day"]
                                      ["2017-06-10" "2019-07-10" 2 "multiple years"]]]
                              [:month [["2022-10-03" "2022-11-02" 0  "day under a month"]
                                       ["2022-10-02" "2022-11-02" 1  "just one month"]
                                       ["2022-10-02" "2023-10-03" 12 "over a year"]]]
                              [:week [["2022-10-01" "2022-10-04" 0   "under 7 days across week boundary"]
                                      ["2022-10-02" "2022-10-09" 1   "just one week"]
                                      ["2022-10-02" "2023-10-03" 52 "over a year"]]]
                              [:day [["2022-10-02" "2022-10-02" 0   "same day"]
                                     ["2022-10-02" "2022-10-03" 1   "consecutive days"]
                                     ["2021-10-02" "2022-10-05" 368 "over a year"]]]]

                [x y expected description] cases]
          (testing (name unit)
            (testing description
              (is (= [expected (- expected)] (query x y unit))))))))))

(defn prepared-statements-helper
  [prepared-optimized]
  (let [details (merge (:details (mt/db))
                       {:prepared-optimized prepared-optimized})]
    (t2.with-temp/with-temp [:model/Database db {:engine :starburst, :name "Temp starburst JDBC Schema DB", :details details}]
      (mt/with-db db
        (is (= [["2023-11-06T00:00:00Z" 42 "It was created"]]
               (mt/rows
                (qp/process-query
                 {:database     (mt/id)
                  :type         :native
                  :native       {:query         "SELECT {{created_at}}, {{nb_created}}, {{detail}}"
                                 :template-tags {:created_at {:name         "created_at"
                                                              :display_name "created_at"
                                                              :type         :date
                                                              :required     true}
                                                 :nb_created {:name         "nb_created"
                                                              :display_name "nb_created"
                                                              :type         :number
                                                              :required     true}
                                                 :detail {:name         "detail"
                                                          :display_name "detail"
                                                          :type         :text
                                                          :required     true}}}
                  :parameters    [{:type   :date
                                   :name   "created_at"
                                   :target [:variable [:template-tag "created_at"]]
                                   :value  "2023-11-06"}
                                  {:type   :number
                                   :name   "nb_created"
                                   :target [:variable [:template-tag "nb_created"]]
                                   :value  "42"}
                                  {:type   :text
                                   :name   "detail"
                                   :target [:variable [:template-tag "detail"]]
                                   :value  "It was created"}]}))))))))

(deftest prepared-statements
  (mt/test-driver :starburst
    (testing "Make sure prepared statements work"
        ;; If impersonation is set, then the starburst user should be the current Metabase user, i.e. metabase_user@user.com
        ;; The role is ignored as Metabase users may not have the role defined in the database connection
      (prepared-statements-helper true)
      (prepared-statements-helper false))))

(deftest optimized-prepared-statement-is-closed-test
  (mt/test-driver :starburst
    (testing "can check isClosed on optimized prepared statement"
      (sql-jdbc.execute/do-with-connection-with-options
       driver/*driver* (mt/id) nil
       (fn [^Connection conn]
         (let [stmt (.prepareStatement conn "select 1" ResultSet/TYPE_FORWARD_ONLY ResultSet/CONCUR_READ_ONLY)
               prepared-stmt (#'starburst/proxy-optimized-prepared-statement driver/*driver* conn stmt [])]
           (is (false? (.isClosed prepared-stmt)))
           (.close stmt)
           (is (true? (.isClosed prepared-stmt)))))))))

(deftest have-select-privilege-doesnt-throw-test
  (mt/test-driver :starburst
    (testing "have-select-privilege? returns true if table exists"
      (sql-jdbc.execute/do-with-connection-with-options
       driver/*driver*
       (mt/db)
       nil
       (fn [^Connection conn]
         (is (true?
              (sql-jdbc.sync.interface/have-select-privilege? driver/*driver* conn "default" "products"))))))
    (testing "have-select-privilege? returns false if table does not exist"
      (sql-jdbc.execute/do-with-connection-with-options
       driver/*driver*
       (mt/db)
       nil
       (fn [^Connection conn]
         (is (false?
              (sql-jdbc.sync.interface/have-select-privilege? driver/*driver* conn "default" "fake_table"))))))))
