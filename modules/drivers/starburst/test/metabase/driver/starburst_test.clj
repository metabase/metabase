;;
;; Licensed under the Apache License, Version 2.0 (the "License");
;; you may not use this file except in compliance with the License.
;; You may obtain a copy of the License at

;;     http://www.apache.org/licenses/LICENSE-2.0

;; Unless required by applicable law or agreed to in writing, software
;; distributed under the License is distributed on an "AS IS" BASIS,
;; WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
;; See the License for the specific language governing permissions and
;; limitations under the License.
;;
(ns metabase.driver.starburst-test
  (:require [clojure.java.jdbc :as jdbc]
            [clojure.string :as str]
            [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase.api.database :as api.database]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver :as driver]
            [metabase.driver.implementation.connectivity :as starburst-connectivity]
            [metabase.driver.sql-jdbc.connection :as sql-jdbc.conn]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :as table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.sync :as sync]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [toucan.db :as db]))

(use-fixtures :once (fixtures/initialize :db))

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
                       ;; for HTTP based Starburst driver, this is coming back as varchar(255)
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
                         (driver/describe-table :starburst (mt/db) (db/select-one 'Table :id (mt/id :venues)))))))

(deftest table-rows-sample-test
  (mt/test-driver :starburst
                  (is (= [[1 "Red Medicine"]
                          [2 "Stout Burgers & Beers"]
                          [3 "The Apple Pan"]
                          [4 "Wurstküche"]
                          [5 "Brite Spot Family Restaurant"]]
                         (->> (metadata-queries/table-rows-sample (Table (mt/id :venues))
                                                                  [(Field (mt/id :venues :id))
                                                                   (Field (mt/id :venues :name))]
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
        ;; the `read-column-thunk` for `Types/TIMESTAMP` always returns an `OffsetDateTime`, not a `LocalDateTime`, as
        ;; the original Starburst version of this test expected; therefore, convert the `ZonedDateTime` corresponding to
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
  (mt/test-driver :starburst
                  (let [query (mt/mbql-query venues
                                             {:aggregation [[:count]]
                                              :filter      [:= $name "wow"]})]
                    (testing "The native query returned in query results should use user-friendly splicing"
                      (is (= (str "SELECT COUNT(*) AS \"count\" "
                                  "FROM \"default\".\"venues\" "
                                  "WHERE \"default\".\"venues\".\"name\" = 'wow'")
                             (:query (qp/compile-and-splice-parameters query))
                             (-> (qp/process-query query) :data :native_form :query)))))))

(deftest connection-tests
  (testing "db-name is correct in all cases"
    (doseq [[c s expected] [[nil nil ""]
                            ["" "" ""]
                            ["my_catalog" nil "my_catalog"]
                            ["my_catalog" "" "my_catalog"]
                            ["my_catalog" "my_schema" "my_catalog/my_schema"]]]
      (is (= expected (#'starburst-connectivity/db-name c s)))))
  (testing "jdbc-spec is correct"
    (is (= {:classname   "io.trino.jdbc.TrinoDriver"
            :subname     "//my-starburst-server:1234/my_catalog?Option1=Value1&Option2=Value2"
            :subprotocol "trino"}
           (#'starburst-connectivity/jdbc-spec {:host "my-starburst-server"
                               :port 1234
                               :catalog "my_catalog"
                               :schema nil
                               :additional-options "Option1=Value1&Option2=Value2"})))))

(defn- execute-ddl! [ddl-statements]
  (mt/with-driver :starburst
    (let [jdbc-spec (sql-jdbc.conn/connection-details->spec :starburst (:details (mt/db)))]
      (with-open [conn (jdbc/get-connection jdbc-spec)]
        (doseq [ddl-stmt ddl-statements]
          (with-open [stmt (.prepareStatement conn ddl-stmt)]
            (.executeUpdate stmt)))))))

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
                      (mt/with-temp Database [db {:engine :starburst, :name "Temp Trino JDBC Schema DB", :details with-schema}]
                        (mt/with-db db
            ;; same as test_data, but with schema, so should NOT pick up venues, users, etc.
                          (sync/sync-database! db)
                          (is (= [{:name t, :schema s, :db_id (mt/id)}]
                                 (map #(select-keys % [:name :schema :db_id]) (db/select Table :db_id (mt/id)))))))
                      (execute-ddl! [(format "DROP TABLE %s.%s" s t)
                                     (format "DROP SCHEMA %s" s)])))))

(deftest test-database-connection-test
  (mt/test-driver :starburst
                  (testing "can-test-database-connection works properly"
      ;; for whatever reason, :let-user-control-scheduling is the only "always available" option that goes into details
      ;; the others (ex: :auto_run_queries and :refingerprint) are one level up (fields in the model, not in the details
      ;; JSON blob)
                    (let [db-details (assoc (:details (mt/db)) :let-user-control-scheduling false)]
                      (is (nil? (api.database/test-database-connection :starburst db-details)))))))

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
      (is (true? (str/starts-with? (:source jdbc-spec) "Starburst Metabase"))))))

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
    (mt/dataset sample-dataset
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
