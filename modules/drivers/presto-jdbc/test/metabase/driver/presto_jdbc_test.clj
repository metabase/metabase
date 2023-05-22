(ns metabase.driver.presto-jdbc-test
  (:require
   [clojure.java.jdbc :as jdbc]
   [clojure.test :refer :all]
   [honeysql.format :as hformat]
   [java-time :as t]
   [metabase.api.database :as api.database]
   [metabase.db.metadata-queries :as metadata-queries]
   [metabase.driver :as driver]
   [metabase.driver.presto-jdbc :as presto-jdbc]
   [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.models.database :refer [Database]]
   [metabase.models.field :refer [Field]]
   [metabase.models.table :as table :refer [Table]]
   [metabase.query-processor :as qp]
   [metabase.sync :as sync]
   [metabase.test :as mt]
   [metabase.test.data.presto-jdbc :as data.presto-jdbc]
   [metabase.test.fixtures :as fixtures]
   [metabase.util.honeysql-extensions :as hx]
   [toucan2.core :as t2])
  (:import
   (java.io File)))

(set! *warn-on-reflection* true)

(use-fixtures :once (fixtures/initialize :db))

(deftest describe-database-test
  (mt/test-driver :presto-jdbc
    (is (= {:tables #{{:name "test_data_categories" :schema "default"}
                      {:name "test_data_venues" :schema "default"}
                      {:name "test_data_checkins" :schema "default"}
                      {:name "test_data_users" :schema "default"}}}
           (-> (driver/describe-database :presto-jdbc (mt/db))
               (update :tables (comp set (partial filter (comp #{"test_data_categories"
                                                                 "test_data_venues"
                                                                 "test_data_checkins"
                                                                 "test_data_users"}
                                                               :name)))))))))

(deftest describe-table-test
  (mt/test-driver :presto-jdbc
    (is (= {:name   "test_data_venues"
            :schema "default"
            :fields #{{:name          "name",
                       ;; for HTTP based Presto driver, this is coming back as varchar(255)
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
           (driver/describe-table :presto-jdbc (mt/db) (t2/select-one 'Table :id (mt/id :venues)))))))

(deftest table-rows-sample-test
  (mt/test-driver :presto-jdbc
    (is (= [[1 "Red Medicine"]
            [2 "Stout Burgers & Beers"]
            [3 "The Apple Pan"]
            [4 "Wurstküche"]
            [5 "Brite Spot Family Restaurant"]]
           (->> (metadata-queries/table-rows-sample (t2/select-one Table :id (mt/id :venues))
                  [(t2/select-one Field :id (mt/id :venues :id))
                   (t2/select-one Field :id (mt/id :venues :name))]
                  (constantly conj))
                (sort-by first)
                (take 5))))))

(deftest page-test
  (testing ":page clause"
    (is (= {:select ["name" "id"]
            :from   [{:select   [[:default.categories.name "name"]
                                 [:default.categories.id "id"]
                                 [(hx/raw "row_number() OVER (ORDER BY \"default\".\"categories\".\"id\" ASC)")
                                  :__rownum__]]
                      :from     [:default.categories]
                      :order-by [[:default.categories.id :asc]]}]
            :where  [:> :__rownum__ 5]
            :limit  5}
           (sql.qp/apply-top-level-clause :presto-jdbc :page
                                          {:select   [[:default.categories.name "name"] [:default.categories.id "id"]]
                                           :from     [:default.categories]
                                           :order-by [[:default.categories.id :asc]]}
                                          {:page {:page  2
                                                  :items 5}})))))

(deftest db-default-timezone-test
  (mt/test-driver :presto-jdbc
    (is (= nil
           (driver/db-default-timezone :presto-jdbc (mt/db))))))

(deftest template-tag-timezone-test
  (mt/test-driver :presto-jdbc
    (testing "Make sure date params work correctly when report timezones are set (#10487)"
      (mt/with-temporary-setting-values [report-timezone "Asia/Hong_Kong"]
        ;; the `read-column-thunk` for `Types/TIMESTAMP` always returns an `OffsetDateTime`, not a `LocalDateTime`, as
        ;; the original Presto version of this test expected; therefore, convert the `ZonedDateTime` corresponding to
        ;; midnight on this date (at the report TZ) to `OffsetDateTime` for comparison's sake
        (is (= [[(-> (t/zoned-date-time 2014 8 2 0 0 0 0 (t/zone-id "Asia/Hong_Kong"))
                     t/offset-date-time
                     (t/with-offset-same-instant (t/zone-offset 0)))
                 (t/local-date 2014 8 2)]]
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
  (mt/test-driver :presto-jdbc
    (let [query (mt/mbql-query venues
                  {:aggregation [[:count]]
                   :filter      [:= $name "wow"]})]
      (testing "The native query returned in query results should use user-friendly splicing"
        (is (= (str "SELECT count(*) AS \"count\" "
                    "FROM \"default\".\"test_data_venues\" "
                    "WHERE \"default\".\"test_data_venues\".\"name\" = 'wow'")
               (:query (qp/compile-and-splice-parameters query))
               (-> (qp/process-query query) :data :native_form :query)))))))

(deftest connection-tests
  (testing "db-name is correct in all cases"
    (doseq [[c s expected] [[nil nil ""]
                            ["" "" ""]
                            ["my_catalog" nil "my_catalog"]
                            ["my_catalog" "" "my_catalog"]
                            ["my_catalog" "my_schema" "my_catalog/my_schema"]]]
      (is (= expected (#'presto-jdbc/db-name c s)))))
  (testing "jdbc-spec is correct"
    (is (= {:classname   "com.facebook.presto.jdbc.PrestoDriver"
            :subname     "//my-presto-server:1234/my_catalog?Option1=Value1&Option2=Value2"
            :subprotocol "presto"}
           (#'presto-jdbc/jdbc-spec {:host "my-presto-server"
                                     :port 1234
                                     :catalog "my_catalog"
                                     :schema nil
                                     :additional-options "Option1=Value1&Option2=Value2"})))))

(deftest honeysql-tests
  (mt/test-driver :presto-jdbc
    (mt/with-everything-store
      (testing "Complex HoneySQL conversions work as expected"
        (testing "unix-timestamp with microsecond precision"
          (is (= [(str "date_add('millisecond', mod((1623963256123456 / 1000), 1000),"
                       " from_unixtime(((1623963256123456 / 1000) / 1000), 'UTC'))")]
                 (-> (sql.qp/unix-timestamp->honeysql :presto-jdbc :microseconds (hx/raw 1623963256123456))
                     (hformat/format)))))))))

(defn- clone-db-details
  "Clones the details of the current DB ensuring fresh copies for the secrets
  (keystore and truststore)."
  []
  (-> (:details (mt/db))
      (dissoc :ssl-keystore-id :ssl-keystore-password-id
              :ssl-truststore-id :ssl-truststore-password-id)
      (merge (select-keys (data.presto-jdbc/dbdef->connection-details (:name (mt/db)))
                          [:ssl-keystore-path :ssl-keystore-password-value
                           :ssl-truststore-path :ssl-truststore-password-value]))))

(defn- execute-ddl! [ddl-statements]
  (mt/with-driver :presto-jdbc
    (let [jdbc-spec (sql-jdbc.conn/connection-details->spec :presto-jdbc (clone-db-details))]
      (with-open [conn (jdbc/get-connection jdbc-spec)]
        (doseq [ddl-stmt ddl-statements]
          (with-open [stmt (.prepareStatement conn ddl-stmt)]
            (.executeUpdate stmt)))))))

(deftest specific-schema-sync-test
  (mt/test-driver :presto-jdbc
    (testing "When a specific schema is designated, only that one is synced"
      (let [s           "specific_schema"
            t           "specific_table"
            db-details  (clone-db-details)
            with-schema (assoc db-details :schema s)]
        (execute-ddl! [(format "DROP TABLE IF EXISTS %s.%s" s t)
                       (format "DROP SCHEMA IF EXISTS %s" s)
                       (format "CREATE SCHEMA %s" s)
                       (format "CREATE TABLE %s.%s (pk INTEGER, val1 VARCHAR(512))" s t)])
        (mt/with-temp Database [db {:engine :presto-jdbc, :name "Temp Presto JDBC Schema DB", :details with-schema}]
          (mt/with-db db
            ;; same as test_data, but with schema, so should NOT pick up venues, users, etc.
            (sync/sync-database! db)
            (is (= [{:name t, :schema s, :db_id (mt/id)}]
                   (map #(select-keys % [:name :schema :db_id]) (t2/select Table :db_id (mt/id)))))))
        (execute-ddl! [(format "DROP TABLE %s.%s" s t)
                       (format "DROP SCHEMA %s" s)])))))

(deftest test-database-connection-test
  (mt/test-driver :presto-jdbc
    (testing "can-test-database-connection works properly"
      ;; for whatever reason, :let-user-control-scheduling is the only "always available" option that goes into details
      ;; the others (ex: :auto_run_queries and :refingerprint) are one level up (fields in the model, not in the details
      ;; JSON blob)
      (let [db-details (assoc (:details (mt/db)) :let-user-control-scheduling false)]
        (is (nil? (api.database/test-database-connection :presto-jdbc db-details)))))))

(deftest kerberos-properties-test
  (testing "Kerberos related properties are set correctly"
    (let [details {:host                         "presto-server"
                   :port                         7778
                   :catalog                      "my-catalog"
                   :kerberos                     true
                   :ssl                          true
                   :kerberos-config-path         "/path/to/krb5.conf"
                   :kerberos-principal           "alice@DOMAIN.COM"
                   :kerberos-remote-service-name "HTTP"
                   :kerberos-keytab-path         "/path/to/client.keytab"}
          jdbc-spec (sql-jdbc.conn/connection-details->spec :presto-jdbc details)]
      (is (= (str "//presto-server:7778/my-catalog?KerberosPrincipal=alice@DOMAIN.COM"
                  "&KerberosRemoteServiceName=HTTP&KerberosKeytabPath=/path/to/client.keytab"
                  "&KerberosConfigPath=/path/to/krb5.conf")
             (:subname jdbc-spec))))))

(defn- create-dummy-keystore
  "Creates and empty file for simulating a JKS."
  ^File [prefix]
  (doto (File/createTempFile prefix ".jks")
    .deleteOnExit))

(deftest ssl-store-properties-test
  (testing "SSL keystore and truststore properties are added as URL parameters"
    (let [keystore   (create-dummy-keystore "keystore")
          truststore (create-dummy-keystore "truststore")
          details    {:host                          "presto-server"
                      :port                          7778
                      :catalog                       "my-catalog"
                      :additional-options            "additional-options"
                      :ssl                           true
                      :ssl-use-keystore              true
                      :ssl-keystore-path             (.getPath keystore)
                      :ssl-keystore-password-value   "keystorepass"
                      :ssl-use-truststore            true
                      :ssl-truststore-path           (.getPath truststore)
                      :ssl-truststore-password-value "truststorepass"}]
      (try
        (is (= (format (str "//presto-server:7778/my-catalog?additional-options"
                            "&SSLKeyStorePath=%s"
                            "&SSLKeyStorePassword=keystorepass"
                            "&SSLTrustStorePath=%s"
                            "&SSLTrustStorePassword=truststorepass")
                       (.getCanonicalPath keystore)
                       (.getCanonicalPath truststore))
               (:subname (sql-jdbc.conn/connection-details->spec :presto-jdbc details))))
        (finally
          (.delete truststore)
          (.delete keystore))))))
