(ns metabase.driver.presto-jdbc-test
  (:require [clojure.test :refer :all]
            [honeysql.core :as hsql]
            [java-time :as t]
            [metabase.db.metadata-queries :as metadata-queries]
            [metabase.driver :as driver]
            [metabase.driver.presto-jdbc :as presto-jdbc]
            [metabase.driver.sql.query-processor :as sql.qp]
            [metabase.models.database :refer [Database]]
            [metabase.models.field :refer [Field]]
            [metabase.models.table :as table :refer [Table]]
            [metabase.query-processor :as qp]
            [metabase.test :as mt]
            [metabase.test.fixtures :as fixtures]
            [metabase.test.util :as tu]
            [toucan.db :as db]
            [metabase.util.honeysql-extensions :as hx]
            [honeysql.format :as hformat]))

(use-fixtures :once (fixtures/initialize :db))

(deftest describe-database-test
  (mt/test-driver :presto-jdbc
    (is (= {:tables #{{:name "categories" :schema "default"}
                      {:name "venues" :schema "default"}
                      {:name "checkins" :schema "default"}
                      {:name "users" :schema "default"}}}
           (-> (driver/describe-database :presto-jdbc (mt/db))
               (update :tables (comp set (partial filter (comp #{"categories"
                                                                 "venues"
                                                                 "checkins"
                                                                 "users"}
                                                               :name)))))))))

(deftest describe-table-test
  (mt/test-driver :presto-jdbc
    (is (= {:name   "venues"
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
           (driver/describe-table :presto-jdbc (mt/db) (db/select-one 'Table :id (mt/id :venues)))))))

(deftest table-rows-sample-test
  (mt/test-driver :presto-jdbc
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
                                 [(hsql/raw "row_number() OVER (ORDER BY \"default\".\"categories\".\"id\" ASC)")
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
    (is (= "UTC"
           (tu/db-timezone-id)))))

(deftest template-tag-timezone-test
  (mt/test-driver :presto-jdbc
    (testing "Make sure date params work correctly when report timezones are set (#10487)"
      (mt/with-temporary-setting-values [report-timezone "Asia/Hong_Kong"]
        ;; the `read-column-thunk` for `Types/TIMESTAMP` always returns an `OffsetDateTime`, not a `LocalDateTime`, as
        ;; the original Presto version of this test expected; therefore, convert the `ZonedDateTime` corresponding to
        ;; midnight on this date (at the report TZ) to `OffsetDateTime` for comparison's sake
        (is (= [[(-> (t/zoned-date-time 2014 8 2 0 0 0 0 (t/zone-id "Asia/Hong_Kong"))
                     t/offset-date-time)
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
                    "FROM \"default\".\"venues\" "
                    "WHERE \"default\".\"venues\".\"name\" = 'wow'")
               (:query (qp/query->native-with-spliced-params query))
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
  (testing "Complex HoneySQL conversions work as expected"
    (testing "unix-timestamp with microsecond precision"
      (is (= [(str "date_add('millisecond', mod((1623963256123456 / 1000), 1000),"
                   " from_unixtime(((1623963256123456 / 1000) / 1000), 'UTC'))")]
             (-> (sql.qp/unix-timestamp->honeysql :presto-jdbc :microseconds (hsql/raw 1623963256123456))
               (hformat/format)))))))
