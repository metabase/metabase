(ns ^:mb/driver-tests metabase.driver.sparksql-test
  (:require
   [clojure.string :as str]
   [clojure.test :refer :all]
   [metabase.driver :as driver]
   [metabase.driver.sparksql :as sparksql]
   [metabase.driver.sql-jdbc.execute :as sql-jdbc.execute]
   [metabase.driver.sql.query-processor :as sql.qp]
   [metabase.lib.core :as lib]
   [metabase.lib.metadata :as lib.metadata]
   [metabase.lib.test-util.notebook-helpers :as lib.tu.notebook]
   [metabase.query-processor.compile :as qp.compile]
   [metabase.query-processor.test :as qp]
   [metabase.test :as mt]))

(set! *warn-on-reflection* true)

(deftest ^:parallel apply-page-test
  (testing "Make sure our custom implementation of `apply-page` works the way we'd expect"
    (let [hsql {:select [:name :id]
                :from   [{:select   [[:default.categories.name :name]
                                     [:default.categories.id :id]
                                     [[::sparksql/over
                                       :%row_number
                                       {:order-by [[:default.categories.id :asc]]}]
                                      :__rownum__]]
                          :from     [:default.categories]
                          :order-by [[:default.categories.id :asc]]}]
                :where  [:> :__rownum__ [:inline 5]]
                :limit  [:inline 5]}]
      (is (= hsql
             (sql.qp/apply-top-level-clause :sparksql :page
                                            {:select   [[:default.categories.name :name] [:default.categories.id :id]]
                                             :from     [:default.categories]
                                             :order-by [[:default.categories.id :asc]]}
                                            {:page {:page  2
                                                    :items 5}})))
      (is (= [["SELECT"
               "  `name`,"
               "  `id`"
               "FROM"
               "  ("
               "    SELECT"
               "      `default`.`categories`.`name` AS `name`,"
               "      `default`.`categories`.`id` AS `id`,"
               "      ROW_NUMBER() OVER ("
               "        ORDER BY"
               "          `default`.`categories`.`id` ASC"
               "      ) AS `__rownum__`"
               "    FROM"
               "      `default`.`categories`"
               "    ORDER BY"
               "      `default`.`categories`.`id` ASC"
               "  )"
               "WHERE"
               "  `__rownum__` > 5"
               "LIMIT"
               "  5"]]
             (-> (sql.qp/format-honeysql :sparksql hsql)
                 vec
                 (update 0 (partial driver/prettify-native-form :sparksql))
                 (update 0 str/split-lines)))))))

(deftest ^:parallel friendly-inline-strings-in-convert-to-sql-test
  (mt/test-driver :sparksql
    (let [query (mt/mbql-query venues
                  {:aggregation [[:count]]
                   :filter      [:= $name "wow"]})]
      (testing "The native query returned in query results should use user-friendly splicing"
        (let [expected "SELECT COUNT(*) AS `count` FROM `test_data`.`venues` AS `t1` WHERE `t1`.`name` = 'wow'"
              replaced "SELECT COUNT(*) AS `count` FROM `test_data`.`venues` AS `t1` WHERE `t1`.`name` = decode(unhex('776f77'), 'utf-8')"]
          (is (= "SELECT COUNT(*) AS `count` FROM `test_data`.`venues` AS `t1` WHERE `t1`.`name` = 'wow'"
                 (:query (qp.compile/compile-with-inline-parameters query))))
          (is (contains? #{expected replaced}
                         (-> (qp/process-query query) :data :native_form :query))))))))

(deftest paranoid-inline-strings-test
  (mt/test-driver :sparksql
    (let [query (mt/mbql-query venues
                  {:aggregation [[:count]]
                   :filter      [:= $name "wow"]})]
      (testing "When actually running the query we should use paranoid splicing and hex-encode strings"
        (let [orig    sql-jdbc.execute/prepared-statement
              the-sql (atom nil)]
          (with-redefs [sql-jdbc.execute/prepared-statement (fn [driver conn sql params]
                                                              (reset! the-sql sql)
                                                              (with-redefs [sql-jdbc.execute/prepared-statement orig]
                                                                (orig driver conn sql params)))]
            (is (=? {:status :completed}
                    (qp/process-query query)))
            (is (= ["-- Metabase"
                    "SELECT"
                    "  COUNT(*) AS `count`"
                    "FROM"
                    "  `test_data`.`venues` AS `t1`"
                    "WHERE"
                    "  `t1`.`name` = decode(unhex('776f77'), 'utf-8')"]
                   (str/split-lines (driver/prettify-native-form :sparksql @the-sql))))))))))

(deftest ^:parallel array-test
  (mt/test-driver :sparksql
    (let [query (mt/native-query {:query "select array(1,2,3)"})]
      (is (= [["[1,2,3]"]]
             (mt/rows (qp/process-query query)))))))

(deftest ^:parallel read-dates-test
  (testing "DATE columns should come back as LocalDate"
    (mt/test-driver :sparksql
      (sql-jdbc.execute/do-with-connection-with-options
       :sparksql
       (mt/id)
       nil
       (fn [^java.sql.Connection conn]
         (with-open [rset (.executeQuery (.createStatement conn) "SELECT date '2024-03-22T13:52:00' AS d;")]
           (let [rsmeta (.getMetaData rset)]
             (testing "Should be returned as correct database types"
               (testing "database type"
                 (is (= "date"
                        (.getColumnTypeName rsmeta 1))))
               (testing "JDBC type"
                 (is (= "DATE"
                        (.getName (java.sql.JDBCType/valueOf (.getColumnType rsmeta 1)))))))
             (testing "Rows should come back as expected Java types"
               (is (= [[#t "2024-03-22"]]
                      (into [] (sql-jdbc.execute/reducible-rows :sparksql rset rsmeta))))))))))))

(deftest ^:parallel omit-table-aliases-in-order-by-test
  (testing "Make sure Spark SQL / Hive works correctly with table aliases in ORDER BY (#10973)"
    (mt/test-driver :sparksql
      (let [mp    (mt/metadata-provider)
            query (-> (lib/query mp (lib.metadata/table mp (mt/id :venues)))
                      (lib/join (-> (lib/join-clause (lib.metadata/table mp (mt/id :categories)))
                                    (lib/with-join-fields [(lib.metadata/field mp (mt/id :categories :id))])))
                      (as-> $query (lib/with-fields $query (let [cols     (lib/visible-columns $query)
                                                                 find-col (fn [table-name col-name]
                                                                            (lib.tu.notebook/find-col-with-spec
                                                                             $query
                                                                             cols
                                                                             {:display-name table-name}
                                                                             {:display-name col-name}))]
                                                             [(find-col "Venues"     "ID")
                                                              (find-col "Categories" "ID")])))
                      (as-> $query (lib/order-by $query (lib.tu.notebook/find-col-with-spec
                                                         $query
                                                         (lib/visible-columns $query)
                                                         {:display-name "Venues"}
                                                         {:display-name "ID"})))
                      (lib/limit 3))]
        ;; allegedly this did not work in the past with Spark SQL / Hive, we needed to do
        ;;
        ;;    ORDER BY `id` ASC
        ;;
        ;; (exclude the subselect/join alias and use the `:lib/desired-column-alias`). However as of ~61 it seems to be
        ;; working correctly even using the subselect alias (`t1`).
        (testing "Confirm compiled SQL uses the subselect alias (`t1`) for ORDER BY, which was not working in the past"
          (is (= ["SELECT"
                  "  `t1`.`id` AS `id`,"
                  "  `Categories`.`id` AS `Categories__id`"
                  "FROM"
                  "  `test_data`.`venues` AS `t1`"
                  "  LEFT JOIN ("
                  "    SELECT"
                  "      `t1`.`id` AS `id`,"
                  "      `t1`.`name` AS `name`" ; this doesn't really need to be selected but I guess is done because of remapping
                  "    FROM"
                  "      `test_data`.`categories` AS `t1`"
                  "  ) AS `Categories` ON `t1`.`category_id` = `Categories`.`id`"
                  "ORDER BY"
                  "  `t1`.`id` ASC"
                  "LIMIT"
                  "  3"]
                 (-> query
                     qp.compile/compile
                     :query
                     (->> (driver/prettify-native-form :sparksql))
                     str/split-lines))))
        (testing "The query should run successfully"
          (is (= [[1 4] [2 11] [3 11]]
                 (mt/rows (qp/process-query query)))))))))
